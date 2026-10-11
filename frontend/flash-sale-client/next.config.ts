import type { NextConfig } from "next";

import { backendUrl } from "./lib/backend-url";

/**
 * The browser only ever talks to this origin. /api/* is forwarded to Express, so the
 * HttpOnly session cookie stays first-party (SameSite=Strict) and no CORS credentials
 * are needed. BACKEND_URL is server-side only; it never ships to the client bundle.
 */
const BACKEND_URL = backendUrl();

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
