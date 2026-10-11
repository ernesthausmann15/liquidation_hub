import express from "express";
import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { registerAuth, requireOwnerAdmin, requireWriter } from "./auth.js";
import { registerInventory } from "./inventory.js";
import { registerDemo } from "./demo.js";
import { ensureDefaultInventory } from "./db/showcase.js";
import { serverError } from "./http-errors.js";
import { createRateLimiter } from "./rate-limit.js";

dotenv.config();

const app = express();
// No CORS middleware: browsers reach this API only through the Next.js /api rewrite (same origin),
// so cross-origin requests are refused by the browser by default.
app.use(express.json({ limit: "100kb" }));

/**
 * Which proxy hops to trust for req.ip (login throttling, demo rate limit, visitor hashes).
 * Locally Next.js forwards from loopback. On Render set TRUST_PROXY to the hop count, then confirm
 * with GET /api/admin/request-info that req.ip is your real address, not a proxy's.
 */
// Render sets RENDER=true; default to one trusted hop there, loopback (local Next.js) elsewhere.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.RENDER ? "1" : "loopback");
app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

if (process.env.RENDER && process.env.NODE_ENV !== "production") {
  console.warn("Running on Render without NODE_ENV=production: session cookies are not marked Secure.");
}

// If this is undefined, throw an error right away instead of falling back to localhost
if (!process.env.DATABASE_URL) {
  throw new Error("FATAL ERROR: DATABASE_URL environment variable is missing!");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// An idle client losing its connection (database restart, network blip) emits 'error' on the pool.
// Unhandled, that event would crash the process; the pool replaces the client on next use.
pool.on("error", (err) => console.error("Postgres idle client error:", err.message || err.code));

// db/schema.sql is idempotent and is also the file to run from the pgAdmin Query Tool.
async function initDb() {
  const schema = await readFile(new URL("./db/schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
  console.log("Database schema is up to date (db/schema.sql)");
}

// The showcase baseline is only maintained in demo deployments; a real deployment's inventory
// is never touched. SHOWCASE_AUTOHEAL=false turns it off even in demo mode.
const autoHeal = () =>
  process.env.DEMO_MODE === "true" && process.env.SHOWCASE_AUTOHEAL !== "false";

/**
 * Boot sequence that survives a database that is still waking up (Render free-tier Postgres,
 * restarts): retries with backoff instead of crashing, while the HTTP server keeps answering.
 */
async function bootstrapDb(attempt = 1) {
  try {
    await initDb();
    if (autoHeal()) await ensureDefaultInventory(pool, "startup");
  } catch (err) {
    const delay = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
    console.error(`Database bootstrap failed (attempt ${attempt}), retrying in ${delay / 1000}s:`, err.message || err.code);
    setTimeout(() => void bootstrapDb(attempt + 1), delay).unref();
  }
}

const requireAuth = registerAuth(app, pool);
registerInventory(app, pool, requireAuth);
registerDemo(app, pool, requireAuth);

// Public catalog for the storefront page: customer-facing columns only (no cost basis, metadata
// or version), and only stock that is actually for sale.
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT product_id, sku, name, description, category, base_price, stock
         FROM products
        WHERE liquidation_status IN ('listed', 'reserved')
        ORDER BY product_id ASC`,
    );
    res.json({
      success: true,
      count: result.rows.length,
      products: result.rows,
    });
  } catch (err) {
    serverError(res, err, `${req.method} ${req.path}`);
  }
});

// Legacy create route; the hub uses POST /api/inventory. Same auth rules as the hub.
app.post("/api/products", requireAuth, requireWriter, async (req, res) => {
  const { name, description, base_price, stock } = req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ success: false, error: "Name is required" });
  }
  if (!base_price || typeof base_price !== "number" || base_price <= 0) {
    return res.status(400).json({ success: false, error: "Base price is required" });
  }
  if (!stock || typeof stock !== "number" || stock < 0) {
    return res.status(400).json({ success: false, error: "Stock is required" });
  }

  try {
    const query = `INSERT INTO products (name, description, base_price, stock) VALUES ($1, $2, $3, $4) RETURNING *`;
    const values = [name, description, base_price, stock];
    const result = await pool.query(query, values);
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    serverError(res, err, `${req.method} ${req.path}`);
  }
});

const PurchaseSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(1000),
  customerEmail: z.string().trim().toLowerCase().email().max(255),
});

/**
 * Buys units of a product at its active flash-sale price.
 * Request:  { productId, quantity, customerEmail }
 * Locks the flash sale, then the product (always in that order), so concurrent buyers
 * queue on the row locks and neither stock nor stock_limit can be oversold.
 */
// Public storefront route, so it is throttled per IP to stop scripted stock draining.
const purchaseLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

app.post("/api/purchases", async (req, res) => {
  if (purchaseLimit(req.ip)) {
    return res.status(429).json({ success: false, error: "Too many purchase attempts. Try again shortly." });
  }
  const parsed = PurchaseSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res
      .status(400)
      .json({ success: false, error: `${issue.path.join(".")}: ${issue.message}` });
  }
  const { productId, quantity, customerEmail } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // start_time / end_time are TIMESTAMP without time zone, so compare with LOCALTIMESTAMP.
    const saleResult = await client.query(
      `SELECT flash_sale_id, stock_limit, sold_count
         FROM flash_sales
        WHERE product_id = $1 AND status = 'active'
          AND LOCALTIMESTAMP BETWEEN start_time AND end_time
        ORDER BY end_time
        LIMIT 1
        FOR UPDATE`,
      [productId],
    );
    const sale = saleResult.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ success: false, error: "No active flash sale for this product" });
    }

    const productResult = await client.query(
      "SELECT stock FROM products WHERE product_id = $1 FOR UPDATE",
      [productId],
    );
    const product = productResult.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    const saleRemaining = sale.stock_limit - sale.sold_count;
    const available = Math.min(product.stock, saleRemaining);
    if (available < quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Out of stock! Only ${Math.max(available, 0)} items remaining`,
      });
    }

    // Bump version too, so a Liquidation Hub edit made from an older read gets a 409
    // instead of silently restoring the stock this sale just took.
    const updateResult = await client.query(
      `UPDATE products
          SET stock = stock - $2, version = version + 1, updated_at = now()
        WHERE product_id = $1
        RETURNING stock`,
      [productId, quantity],
    );
    await client.query(
      "UPDATE flash_sales SET sold_count = sold_count + $2 WHERE flash_sale_id = $1",
      [sale.flash_sale_id, quantity],
    );

    // total_paid is computed in NUMERIC by Postgres, never in JavaScript floats.
    const orderResult = await client.query(
      `INSERT INTO orders (flash_sale_id, customer_email, quantity, total_paid)
       SELECT flash_sale_id, $2, $3::int, discount_price * $3::int
         FROM flash_sales WHERE flash_sale_id = $1
       RETURNING *`,
      [sale.flash_sale_id, customerEmail, quantity],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Purchase successful",
      order: orderResult.rows[0],
      product: updateResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    serverError(res, err, `${req.method} ${req.path}`);
  } finally {
    client.release();
  }
});

app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    const query = `SELECT o.order_id, o.quantity, o.total_paid, o.created_at AS order_date, f.flash_sale_id, f.discount_price, f.stock_limit, f.sold_count, f.status, f.start_time, f.end_time FROM orders o JOIN flash_sales f ON o.flash_sale_id = f.flash_sale_id ORDER BY o.created_at DESC`;
    const result = await pool.query(query);
    res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows,
    });
  } catch (err) {
    serverError(res, err, `${req.method} ${req.path}`);
  }
});

// Orders are customer records: only the owner can delete them, never a demo account.
app.delete("/api/orders/:order_id", requireAuth, requireOwnerAdmin, async (req, res) => {
  const orderId = Number(req.params.order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ success: false, error: "Invalid order id" });
  }
  try {
    const { rowCount } = await pool.query("DELETE FROM orders WHERE order_id = $1", [orderId]);
    if (!rowCount) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, message: "Order deleted successfully" });
  } catch (err) {
    serverError(res, err, `${req.method} ${req.path}`);
  }
});

app.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const query = `SELECT SUM(quantity) AS total_quantity, SUM(total_paid) AS total_revenue FROM orders`;
    const result = await pool.query(query);
    res.json({
      success: true,
      total_quantity: result.rows[0].total_quantity,
      total_revenue: result.rows[0].total_revenue,
    });
  } catch (err) {
    serverError(res, err, `${req.method} ${req.path}`);
  }
});

app.get("/api/stats/flash_sale/:flash_sale_id", requireAuth, async (req, res) => {
  const { flash_sale_id } = req.params;
  try {
    const query = `SELECT SUM(quantity) AS total_quantity, SUM(total_paid) AS total_revenue FROM orders WHERE flash_sale_id = $1`;
    const result = await pool.query(query, [flash_sale_id]);
    res.json({
      success: true,
      total_quantity: result.rows[0].total_quantity,
      total_revenue: result.rows[0].total_revenue,
    });
  } catch (err) {
    serverError(res, err, `${req.method} ${req.path}`);
  }
});

// The form sends this shape, and OpenAI must return the same three fields
// the products table stores. stock is an integer because the column is INT.
const ProductCommandSchema = z.object({
  name: z.string(),
  base_price: z.number(),
  stock: z.number().int(),
});

/**
 * Natural-language inventory command.
 * Request:  { commandText: string }
 * Response: { success: true, extracted: { name, base_price, stock }, dbRow }
 *           or { success: false, error }
 *
 * openai 7 moved structured parsing off beta.chat and onto
 * chat.completions.parse. zodResponseFormat still builds the JSON schema.
 */
// Every call spends OpenAI credits, so only the owner may use it (not demo accounts).
app.post("/api/add-product", requireAuth, requireOwnerAdmin, async (req, res) => {
  const commandText = req.body?.commandText;

  if (typeof commandText !== "string" || commandText.trim() === "") {
    return res
      .status(400)
      .json({ success: false, error: "commandText is required" });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ success: false, error: "OPENAI_API_KEY is missing" });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.parse({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an inventory assistant. Extract the product name, unit price, and stock quantity from the manager statement.",
        },
        { role: "user", content: commandText.trim() },
      ],
      response_format: zodResponseFormat(ProductCommandSchema, "product"),
    });

    const extracted = completion.choices[0]?.message.parsed;
    if (!extracted) {
      return res.status(422).json({
        success: false,
        error: "The model did not return a product.",
      });
    }

    const name = extracted.name.trim();
    const base_price = extracted.base_price;
    const stock = extracted.stock;
    if (!name || typeof name !== "string" || name.trim() === "" || !Number.isFinite(base_price) || base_price <= 0 || !Number.isInteger(stock) || stock < 0 || typeof stock !== "number" || stock < 0) {
      return res.status(422).json({ success: false, error: "Extracted product was incomplete." });
    }

    const inserted = await pool.query(
      `INSERT INTO products (name, description, base_price, stock) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, "Default description", base_price, stock],
    );

    res.json({
      success: true,
      extracted: { name, base_price, stock },
      dbRow: inserted.rows[0],
    });
  } catch (err) {
    serverError(res, err, "add-product");
  }
});

// A browser visit to http://localhost:5000/ requests GET /. Without this
// route Express has nothing to send and replies with its default "Cannot GET /".
app.get("/", (req, res) => {
  res.json({
    message: "Flash sale API is running",
    endpoints: {
      products: "/api/products",
      addProduct: "/api/add-product",
      purchases: "/api/purchases",
      orders: "/api/orders",
      stats: "/api/stats",
    },
  });
});

// Health check (point Render's health check path here). 503 while the database is unreachable.
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Health check: database unreachable:", err.message || err.code);
    res.status(503).json({ status: "degraded" });
  }
});

// Calibrates TRUST_PROXY: req.ip must be the visitor's address, not a proxy's.
app.get("/api/admin/request-info", requireAuth, requireOwnerAdmin, (req, res) => {
  res.json({ success: true, ip: req.ip, ips: req.ips, forwardedFor: req.get("x-forwarded-for") ?? null });
});

// Last resort: malformed JSON, oversized bodies and anything thrown past a route answer in JSON
// without a stack trace.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: "Request body is not valid JSON." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, error: "Request body is too large." });
  }
  serverError(res, err, `${req.method} ${req.path}`);
});

const PORT = process.env.PORT || 4000;
const HEAL_INTERVAL_MS = 60 * 60 * 1000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  void bootstrapDb();
  // Hourly safety net for long-running instances (paid Render plans never cold-start).
  setInterval(() => {
    if (autoHeal()) void ensureDefaultInventory(pool, "hourly");
  }, HEAL_INTERVAL_MS).unref();
});
