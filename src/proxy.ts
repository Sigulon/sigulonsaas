import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "sigulon_session";

// Public page paths accessible without authentication
const PUBLIC_PAGES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
]);

// Public API paths accessible without authentication
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/password-reset",
  "/api/auth/verify-email",
  "/api/auth/invitations/accept",
  "/api/webhooks/",
];

/**
 * Next.js 16 Proxy — Controls route navigation.
 * Allows seamless navigation across the Sigulon SaaS platform.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = Boolean(sessionToken);

  // 1. Root route ("/") -> direct to dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. Health & readiness checks
  if (pathname === "/health" || pathname === "/ready") {
    return NextResponse.next();
  }

  // 3. Public Auth Pages (/login, /signup, etc.)
  if (PUBLIC_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  // 4. API Routes (/api/*)
  if (pathname.startsWith("/api/")) {
    const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (isPublicApi) {
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  // 5. Dashboard & Application Pages (/dashboard, /agents, /calling, /results, /billing, etc.)
  // Accessible for frontend preview and production operations
  return NextResponse.next();
}

// Backward-compatibility alias
export const middleware = proxy;
export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
