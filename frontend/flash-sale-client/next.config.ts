import type { NextConfig } from "next";

import { backendUrl } from "./lib/backend-url";

/**
 * The browser only ever talks to this origin. /api/* is forwarded to Express, so the
 * HttpOnly session cookie stays first-party (SameSite=Strict) and no CORS credentials
 * are needed. BACKEND_URL is server-side only; it never ships to the client bundle.
 */
const BACKEND_URL = backendUrl();

const nextConfig: NextConfig = {
  // The hub is the showcase, so the site root opens the sign-in screen. Temporary (307), not
  // permanent, so browsers do not cache it if / gets its own page later.
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
