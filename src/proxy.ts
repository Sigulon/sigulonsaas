import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get("sigulon_session")?.value;
  const pathname = request.nextUrl.pathname;

  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/signup");

  const isPublicApi =
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/internal/") ||
    pathname.startsWith("/api/readyz") ||
    pathname.startsWith("/api/healthz") ||
    pathname === "/health" ||
    pathname === "/ready";

  const isStaticOrAsset =
    pathname.startsWith("/_next") ||
    pathname.includes("favicon.ico") ||
    pathname.includes(".");

  if (isStaticOrAsset) {
    return NextResponse.next();
  }

  // In development, allow requests to proceed so MongoDB data can be accessed seamlessly.
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  // Protect all dashboard pages and non-public API routes
  if (!sessionToken && !isAuthPage && !isPublicApi && pathname !== "/") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If already logged in, redirect away from login/signup to dashboard
  if (sessionToken && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
