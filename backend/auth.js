import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "vx_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** Format: scrypt$N$r$p$salt$hash (base64). Parameters travel with the hash so they can be raised later. */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const hash = await scryptAsync(password, salt, keylen, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$");
}

async function verifyPassword(password, stored) {
  const [scheme, N, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown, so a miss costs the same time as a wrong password.
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function sessionCookie(token, maxAgeMs) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

/** In-memory throttle: 8 failed attempts per IP+email per 15 minutes. Swap for Redis behind a load balancer. */
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

function throttleKey(req, email) {
  return `${req.ip}|${email}`;
}
function isThrottled(key) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) return false;
  return entry.count >= MAX_FAILURES;
}
function recordFailure(key) {
  if (failures.size > 10_000) {
    for (const [k, v] of failures) if (Date.now() - v.first > WINDOW_MS) failures.delete(k);
  }
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failures.set(key, { first: Date.now(), count: 1 });
  else entry.count += 1;
}

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(512),
});

const publicUser = (row) => ({
  user_id: row.user_id,
  email: row.email,
  display_name: row.display_name,
  role: row.role,
});

/** Mounts /api/auth/* and returns requireAuth middleware for protected routes. */
export function registerAuth(app, pool) {
  app.post("/api/auth/login", async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "Enter a valid email and password." });
    }
    const { email, password } = parsed.data;
    const key = throttleKey(req, email);
    if (isThrottled(key)) {
      return res
        .status(429)
        .json({ success: false, error: "Too many attempts. Try again in a few minutes." });
    }

    try {
      const { rows } = await pool.query(
        "SELECT * FROM hub_users WHERE lower(email) = $1 AND is_active",
        [email],
      );
      const user = rows[0];
      const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
      if (!user || !ok) {
        recordFailure(key);
        return res.status(401).json({ success: false, error: "Email or password is incorrect." });
      }
      failures.delete(key);

      const token = randomBytes(32).toString("base64url");
      await pool.query(
        "INSERT INTO hub_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3 * interval '1 millisecond')",
        [sha256(token), user.user_id, SESSION_TTL_MS],
      );
      // Opportunistic cleanup keeps the table small without a cron job.
      void pool.query("DELETE FROM hub_sessions WHERE expires_at < now()").catch(() => {});

      res.setHeader("Set-Cookie", sessionCookie(token, SESSION_TTL_MS));
      res.json({ success: true, user: publicUser(user) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      await pool.query("DELETE FROM hub_sessions WHERE token_hash = $1", [sha256(token)]).catch(() => {});
    }
    res.setHeader("Set-Cookie", sessionCookie("", 0));
    res.json({ success: true });
  });

  async function requireAuth(req, res, next) {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return res.status(401).json({ success: false, error: "Sign in required." });
    try {
      const { rows } = await pool.query(
        `SELECT u.* FROM hub_sessions s JOIN hub_users u USING (user_id)
          WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`,
        [sha256(token)],
      );
      if (!rows[0]) {
        res.setHeader("Set-Cookie", sessionCookie("", 0));
        return res.status(401).json({ success: false, error: "Session expired. Sign in again." });
      }
      req.user = publicUser(rows[0]);
      next();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  return requireAuth;
}
