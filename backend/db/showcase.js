/**
 * Showcase inventory and the auto-heal that keeps it present.
 *
 * A Demo Manager can delete rows, so the hub restores this baseline whenever any of it is
 * missing: on boot (covers Render cold starts), hourly, and before each demo session starts
 * (so the next visitor never lands on an empty grid even inside the hourly window).
 *
 * Idempotent: rows are keyed by SKU and inserted with ON CONFLICT DO NOTHING, so surviving
 * items are never duplicated or overwritten. Edited items are left as they are.
 */

export const SHOWCASE_ITEMS = [
  ["VX-DL7420-A", "Dell Latitude 7420 (Grade A)", "Pallet of 40, i5 / 16GB / 256GB", "Laptops", "listed", 310, 520, 38],
  ["VX-HMAER-B", "Herman Miller Aeron, size B", "Office closure lot", "Furniture", "staged", 420, 1100, 22],
  ["VX-C9300-48P", "Cisco Catalyst 9300-48P", "Data-centre decommission", "Networking", "reserved", 1450, 6200, 6],
  ["VX-SM27Q-L2", "Samsung 27\" QHD monitors", "Mixed grade B/C", "Monitors", "listed", 95, 240, 120],
  ["VX-LEAP2", "Steelcase Leap V2", "Sold to regional reseller", "Furniture", "liquidated", 260, 780, 0],
  ["VX-M507", "HP LaserJet M507", "Toner low on 12 units", "Printers", "written_off", 40, 410, 14],
  ["VX-SMT3K", "APC Smart-UPS 3000", "Batteries replaced 2025", "Power", "staged", 380, 1350, 4],
  ["VX-MBP14-M1", "MacBook Pro 14\" M1 Pro", "Lease return, Grade A-", "Laptops", "listed", 890, 1650, 17],
];

/** Below this many products in total, the check also logs a low-inventory warning. */
export const MIN_PRODUCTS = 5;

let running = null;

/**
 * Restores any missing showcase SKUs. Returns { total, restored } and never throws, so a
 * database blip during boot or a timer tick is logged instead of crashing the server.
 * Concurrent calls share one run.
 */
export function ensureDefaultInventory(pool, reason = "check") {
  running ??= heal(pool, reason).finally(() => {
    running = null;
  });
  return running;
}

async function heal(pool, reason) {
  try {
    const skus = SHOWCASE_ITEMS.map((item) => item[0]);
    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM products) AS total,
              (SELECT count(*)::int FROM products WHERE sku = ANY($1)) AS present`,
      [skus],
    );
    const { total, present } = rows[0];
    if (present === skus.length && total >= MIN_PRODUCTS) return { total, restored: 0 };

    const values = [];
    const tuples = SHOWCASE_ITEMS.map((item, i) => {
      values.push(...item);
      const b = i * 8;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, '{"showcase": true}'::jsonb)`;
    });
    const inserted = await pool.query(
      `INSERT INTO products (sku, name, description, category, liquidation_status, base_price, cost_basis, stock, metadata)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (sku) WHERE sku IS NOT NULL DO NOTHING`,
      values,
    );
    const restored = inserted.rowCount;
    console.warn(
      `[showcase] ${reason}: ${total} products, ${present}/${skus.length} showcase items present; restored ${restored}.`,
    );
    return { total: total + restored, restored };
  } catch (err) {
    console.error(`[showcase] ${reason}: inventory check failed, will retry:`, err.message || err.code);
    return null;
  }
}
