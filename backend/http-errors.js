import { randomUUID } from "node:crypto";

/**
 * Logs the real error server-side and sends the client a generic message with a reference id,
 * so Postgres/OpenAI internals (table names, constraint names, hosts) never reach the browser.
 */
export function serverError(res, err, context = "request") {
  const ref = randomUUID().slice(0, 8);
  console.error(`[${ref}] ${context} failed:`, err);
  res.status(500).json({ success: false, error: `Something went wrong (ref ${ref}). Try again shortly.` });
}
