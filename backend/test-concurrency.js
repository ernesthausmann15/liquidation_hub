// Fires 10 simultaneous purchases at a flash sale with one unit and expects exactly one to win.
//   node test-concurrency.js        (API on PORT from .env, default 4000)
// There is no API for creating flash sales, so setup and cleanup go straight to Postgres.
import pkg from "pg";
import dotenv from "dotenv";

const { Pool } = pkg;
dotenv.config();

const BASE_URL = process.env.API_URL ?? `http://localhost:${process.env.PORT || 4000}/api`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setup() {
  const product = await pool.query(
    `INSERT INTO products (name, description, base_price, stock, liquidation_status)
     VALUES ('Concurrency test item', 'Created by test-concurrency.js', 100, 1, 'listed')
     RETURNING product_id`,
  );
  const productId = product.rows[0].product_id;
  const sale = await pool.query(
    `INSERT INTO flash_sales (product_id, discount_price, stock_limit, start_time, end_time)
     VALUES ($1, 79.99, 1, LOCALTIMESTAMP - interval '1 minute', LOCALTIMESTAMP + interval '1 hour')
     RETURNING flash_sale_id`,
    [productId],
  );
  return { productId, flashSaleId: sale.rows[0].flash_sale_id };
}

async function cleanup({ productId, flashSaleId }) {
  await pool.query("DELETE FROM orders WHERE flash_sale_id = $1", [flashSaleId]);
  await pool.query("DELETE FROM flash_sales WHERE flash_sale_id = $1", [flashSaleId]);
  await pool.query("DELETE FROM products WHERE product_id = $1", [productId]);
}

async function runTest() {
  console.log("--- STARTING FLASH-SALE CONCURRENCY TEST ---");
  const ids = await setup();
  console.log(`Product ${ids.productId} (stock 1) on flash sale ${ids.flashSaleId} (limit 1)`);

  try {
    const numConcurrentPurchases = 10;
    const results = await Promise.all(
      Array.from({ length: numConcurrentPurchases }, (_, i) =>
        fetch(`${BASE_URL}/purchases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: ids.productId,
            quantity: 1,
            customerEmail: `buyer${i}@example.com`,
          }),
        })
          .then(async (res) => ({ user: i, status: res.status, body: await res.json() }))
          .catch((err) => ({ user: i, status: 0, body: { error: err.message } })),
      ),
    );

    console.log("\n--- TEST RESULTS ---");
    for (const r of results) {
      console.log(`User ${r.user}: ${r.status} ${r.body.success ? "bought the item" : r.body.error}`);
    }

    const successCount = results.filter((r) => r.status === 200).length;
    const outOfStockCount = results.filter((r) => r.status === 400).length;
    const state = await pool.query(
      `SELECT p.stock, f.sold_count,
              (SELECT count(*)::int FROM orders WHERE flash_sale_id = f.flash_sale_id) AS orders,
              (SELECT total_paid FROM orders WHERE flash_sale_id = f.flash_sale_id LIMIT 1) AS total_paid
         FROM products p JOIN flash_sales f USING (product_id)
        WHERE f.flash_sale_id = $1`,
      [ids.flashSaleId],
    );
    const row = state.rows[0];

    console.log("\n--- SUMMARY ---");
    console.log(`Successful purchases: ${successCount} (expected 1)`);
    console.log(`Rejected as out of stock: ${outOfStockCount} (expected 9)`);
    console.log(
      `Database: stock ${row.stock}, sold_count ${row.sold_count}, orders ${row.orders}, total_paid ${row.total_paid}`,
    );

    const passed =
      successCount === 1 &&
      outOfStockCount === 9 &&
      row.stock === 0 &&
      row.sold_count === 1 &&
      row.orders === 1 &&
      row.total_paid === "79.99";
    console.log(
      passed
        ? "\nCONCURRENCY TEST PASSED: row locks prevented overselling."
        : "\nCONCURRENCY TEST FAILED: overselling or unexpected responses.",
    );
    if (!passed) process.exitCode = 1;
  } finally {
    await cleanup(ids);
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error("Error running test:", err);
  process.exitCode = 1;
  return pool.end();
});
