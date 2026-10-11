import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { serverError } from "./http-errors.js";
import { createRateLimiter } from "./rate-limit.js";

import { requireOwnerAdmin, startSession } from "./auth.js";
import { ensureDefaultInventory } from "./db/showcase.js";

/**
 * Portfolio demo mode: one-click sign-in for visitors, plus click analytics.
 * Off unless DEMO_MODE=true, because it hands an admin session to anyone who asks.
 */
// Read lazily: ES module imports run before server.js calls dotenv.config().
const demoEnabled = () => process.env.DEMO_MODE === "true";
const DEMO_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const DEMO_ACCOUNTS = {
  manager: {
    action: "manager_demo",
    email: "demo-manager@liquidationhub.demo",
    display_name: "Demo Manager",
    role: "admin",
  },
  consumer: {
    action: "consumer_demo",
    email: "demo-viewer@liquidationhub.demo",
    display_name: "Demo Viewer",
    role: "viewer",
  },
};

// Without a configured salt the hash still hides IPs, but unique-visitor counts reset on restart.
const fallbackSalt = randomBytes(16).toString("hex");
const visitorHash = (ip) =>
  ip ? createHash("sha256").update((process.env.DEMO_ANALYTICS_SALT ?? fallbackSalt) + ip).digest("hex") : null;
const header = (req, name, max) => req.get(name)?.slice(0, max) || null;

/** 20 demo sessions per IP per hour, so a script cannot flood sessions or inflate the analytics. */
const overLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20 });

const DemoSchema = z.object({ kind: z.enum(["manager", "consumer"]) });

export function registerDemo(app, pool, requireAuth) {
  if (demoEnabled() && !process.env.DEMO_ANALYTICS_SALT) {
    console.warn("DEMO_ANALYTICS_SALT is not set; unique visitor counts will reset when the server restarts.");
  }

  app.get("/api/auth/demo", (req, res) => {
    res.json({ success: true, enabled: demoEnabled() });
  });

  /**
   * Starts a demo session and records the click in one request, so every logged click is a
   * real sign-in made through the API (no separate, spammable tracking endpoint).
   */
  app.post("/api/auth/demo", async (req, res) => {
    if (!demoEnabled()) return res.status(404).json({ success: false, error: "Demo mode is off." });

    const parsed = DemoSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ success: false, error: "Unknown demo type." });
    if (overLimit(req.ip)) {
      return res.status(429).json({ success: false, error: "Too many demo sessions. Try again later." });
    }
    const account = DEMO_ACCOUNTS[parsed.data.kind];

    try {
      // Heal before handing over the dashboard, so a previous visitor's deletions are already undone.
      if (process.env.SHOWCASE_AUTOHEAL !== "false") await ensureDefaultInventory(pool, "demo start");

      // The password hash is not a valid scrypt string, so these accounts can never use /login.
      const { rows } = await pool.query(
        `INSERT INTO hub_users (email, display_name, password_hash, role, is_demo)
         VALUES ($1, $2, 'demo$no-password', $3, true)
         ON CONFLICT (lower(email)) DO UPDATE
           SET role = EXCLUDED.role, is_demo = true, is_active = true
         RETURNING user_id, email, display_name, role, is_demo`,
        [account.email, account.display_name, account.role],
      );
      const user = rows[0];

      await startSession(pool, res, user.user_id, DEMO_SESSION_TTL_MS);
      await pool.query(
        `INSERT INTO demo_clicks (action_type, visitor_hash, user_agent, referrer, accept_language)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          account.action,
          visitorHash(req.ip),
          header(req, "user-agent", 512),
          header(req, "referer", 512),
          header(req, "accept-language", 64),
        ],
      );

      res.json({ success: true, user });
    } catch (err) {
      serverError(res, err, `${req.method} ${req.path}`);
    }
  });

  /** Portfolio engagement report. Owner admins only; demo admins cannot read it. */
  app.get("/api/analytics/demo-clicks", requireAuth, requireOwnerAdmin, async (req, res) => {
    try {
      const [totals, daily, recent] = await Promise.all([
        pool.query(`
          SELECT action_type, count(*)::int AS clicks, count(DISTINCT visitor_hash)::int AS unique_visitors,
                 min(clicked_at) AS first_click, max(clicked_at) AS last_click
            FROM demo_clicks GROUP BY action_type ORDER BY action_type`),
        pool.query("SELECT * FROM demo_click_daily WHERE day > current_date - 30 ORDER BY day DESC, action_type"),
        pool.query(
          "SELECT click_id, action_type, clicked_at, user_agent, referrer FROM demo_clicks ORDER BY clicked_at DESC LIMIT 50",
        ),
      ]);
      res.json({ success: true, totals: totals.rows, daily: daily.rows, recent: recent.rows });
    } catch (err) {
      serverError(res, err, `${req.method} ${req.path}`);
    }
  });
}
