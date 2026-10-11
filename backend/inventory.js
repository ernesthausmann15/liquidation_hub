import { z } from "zod";

import { requireWriter } from "./auth.js";

export const LIQUIDATION_STATUSES = ["staged", "listed", "reserved", "liquidated", "written_off"];

// NUMERIC(10,2) fits a float8 exactly enough for display, so the API returns numbers
// instead of node-pg's strings and the client never has to re-parse money.
const COLUMNS = `
  product_id, sku, name, description, category, liquidation_status,
  base_price::float8 AS base_price, cost_basis::float8 AS cost_basis, stock,
  metadata, created_at, updated_at, version`;

const money = z.number().finite().min(0).max(99_999_999.99);

const ItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  sku: z
    .string()
    .trim()
    .max(64)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  category: z.string().trim().min(1).max(80).default("Uncategorized"),
  liquidation_status: z.enum(LIQUIDATION_STATUSES).default("staged"),
  base_price: money,
  cost_basis: money.nullable().optional(),
  stock: z.number().int().min(0).max(2_147_483_647),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

// PATCH names only the fields it changes, plus the version it read.
const PatchSchema = ItemSchema.partial().extend({ version: z.number().int().positive() });

const EDITABLE = Object.keys(ItemSchema.shape);

const FilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  status: z.enum(LIQUIDATION_STATUSES).optional(),
});

function zodError(res, error) {
  const issue = error.issues[0];
  const field = issue.path.join(".");
  return res
    .status(400)
    .json({ success: false, error: field ? `${field}: ${issue.message}` : issue.message });
}

/** Maps Postgres constraint errors onto HTTP so the grid can show a precise message. */
function pgError(res, err) {
  if (err.code === "23505") {
    return res.status(409).json({ success: false, error: "That SKU is already in use." });
  }
  if (err.code === "23503") {
    return res.status(409).json({
      success: false,
      error: "This item is referenced by a flash sale. Mark it written off instead of deleting it.",
    });
  }
  if (err.code === "23514") {
    return res.status(400).json({ success: false, error: "Value violates a database constraint." });
  }
  return res.status(500).json({ success: false, error: err.message });
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function registerInventory(app, pool, requireAuth) {
  app.get("/api/inventory", requireAuth, async (req, res) => {
    const filters = FilterSchema.safeParse(req.query);
    if (!filters.success) return zodError(res, filters.error);
    const { q, category, status } = filters.data;

    const where = [];
    const values = [];
    if (q) {
      values.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
      where.push(`(name ILIKE $${values.length} OR sku ILIKE $${values.length})`);
    }
    if (category) {
      values.push(category);
      where.push(`category = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`liquidation_status = $${values.length}`);
    }

    try {
      const [items, categories] = await Promise.all([
        pool.query(
          `SELECT ${COLUMNS} FROM products
           ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
           ORDER BY updated_at DESC, product_id DESC
           LIMIT 500`,
          values,
        ),
        pool.query("SELECT DISTINCT category FROM products ORDER BY category"),
      ]);
      res.json({
        success: true,
        items: items.rows,
        categories: categories.rows.map((r) => r.category),
      });
    } catch (err) {
      pgError(res, err);
    }
  });

  /**
   * Valuation. Recovery value counts only units still to be sold (staged, listed, reserved);
   * book value is the acquisition cost of the same units, so recovery / book is the expected
   * recovery rate on the open portfolio.
   */
  app.get("/api/inventory/summary", requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT liquidation_status AS status,
               count(*)::int AS items,
               coalesce(sum(stock), 0)::int AS units,
               coalesce(sum(stock * base_price), 0)::float8 AS recovery_value,
               coalesce(sum(stock * cost_basis), 0)::float8 AS book_value,
               -- Recovery value of only the rows with a cost basis, so recovery / book compares like with like.
               coalesce(sum(stock * base_price) FILTER (WHERE cost_basis IS NOT NULL), 0)::float8 AS costed_recovery_value,
               count(*) FILTER (WHERE stock BETWEEN 1 AND 5)::int AS low_stock
          FROM products
         GROUP BY liquidation_status`);

      const open = rows.filter((r) => ["staged", "listed", "reserved"].includes(r.status));
      const sum = (list, key) => list.reduce((acc, r) => acc + r[key], 0);
      res.json({
        success: true,
        summary: {
          open_recovery_value: sum(open, "recovery_value"),
          open_book_value: sum(open, "book_value"),
          open_costed_recovery_value: sum(open, "costed_recovery_value"),
          open_units: sum(open, "units"),
          total_items: sum(rows, "items"),
          low_stock_items: sum(open, "low_stock"),
          by_status: LIQUIDATION_STATUSES.map(
            (status) =>
              rows.find((r) => r.status === status) ?? {
                status,
                items: 0,
                units: 0,
                recovery_value: 0,
                book_value: 0,
                costed_recovery_value: 0,
                low_stock: 0,
              },
          ),
        },
      });
    } catch (err) {
      pgError(res, err);
    }
  });

  app.post("/api/inventory", requireAuth, requireWriter, async (req, res) => {
    const parsed = ItemSchema.safeParse(req.body ?? {});
    if (!parsed.success) return zodError(res, parsed.error);
    const item = parsed.data;

    try {
      const { rows } = await pool.query(
        `INSERT INTO products
           (name, sku, description, category, liquidation_status, base_price, cost_basis, stock, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${COLUMNS}`,
        [
          item.name,
          item.sku ?? null,
          item.description ?? null,
          item.category,
          item.liquidation_status,
          item.base_price,
          item.cost_basis ?? null,
          item.stock,
          item.metadata,
        ],
      );
      res.status(201).json({ success: true, item: rows[0] });
    } catch (err) {
      pgError(res, err);
    }
  });

  /**
   * Optimistic concurrency: the UPDATE only matches if the row is still at the version the
   * client read. Zero rows means someone else saved first (409, with their row so the grid
   * can refresh) or the item is gone (404).
   */
  app.patch("/api/inventory/:id", requireAuth, requireWriter, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "Invalid item id" });

    // Only fields present in the request body are updated; zod defaults must not sneak in.
    const body = req.body ?? {};
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return zodError(res, parsed.error);
    const { version, ...patch } = parsed.data;
    const fields = EDITABLE.filter((key) => key in body && key in patch);
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: "Nothing to update" });
    }

    const values = fields.map((key) => patch[key] ?? null);
    const sets = fields.map((key, i) => `${key} = $${i + 1}`);
    values.push(id, version);

    try {
      const { rows } = await pool.query(
        `UPDATE products
            SET ${sets.join(", ")}, version = version + 1, updated_at = now()
          WHERE product_id = $${values.length - 1} AND version = $${values.length}
          RETURNING ${COLUMNS}`,
        values,
      );
      if (rows[0]) return res.json({ success: true, item: rows[0] });

      const current = await pool.query(`SELECT ${COLUMNS} FROM products WHERE product_id = $1`, [id]);
      if (!current.rows[0]) return res.status(404).json({ success: false, error: "Item not found" });
      res.status(409).json({
        success: false,
        error: "Someone else changed this item. The grid now shows their version.",
        item: current.rows[0],
      });
    } catch (err) {
      pgError(res, err);
    }
  });

  app.delete("/api/inventory/:id", requireAuth, requireWriter, async (req, res) => {
    const id = parseId(req.params.id);
    const version = parseId(req.query.version);
    if (!id || !version) {
      return res.status(400).json({ success: false, error: "Item id and version are required" });
    }
    try {
      const { rowCount } = await pool.query(
        "DELETE FROM products WHERE product_id = $1 AND version = $2",
        [id, version],
      );
      if (rowCount) return res.json({ success: true });

      const current = await pool.query(`SELECT ${COLUMNS} FROM products WHERE product_id = $1`, [id]);
      if (!current.rows[0]) return res.status(404).json({ success: false, error: "Item not found" });
      res.status(409).json({
        success: false,
        error: "This item changed since you loaded it. Review it before deleting.",
        item: current.rows[0],
      });
    } catch (err) {
      pgError(res, err);
    }
  });
}
