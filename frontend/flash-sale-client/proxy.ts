import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast path only: bounce visitors without a session cookie to /login before the dashboard
 * renders. The cookie is validated by Express on every /api call, which is the real check.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("vx_session")) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/inventory/:path*"],
};
