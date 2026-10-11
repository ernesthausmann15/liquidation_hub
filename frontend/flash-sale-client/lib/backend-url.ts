/**
 * Express base URL for server-side code (the /api rewrite and the login page's demo check).
 * Accepts Render's fromService "hostport" value ("name:port", no scheme) as well as full URLs.
 */
export function backendUrl() {
  const raw = process.env.BACKEND_URL ?? "http://localhost:4000";
  return /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
}
