import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirect only (no DB access here, per Next.js guidance): requests to
 * /admin or /portal without a session cookie go to /login. Real authorization happens in
 * every page (requireAdmin / requireClient) and every Server Action.
 */
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("vmh_session");
  if (!hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*", "/notifications"],
};
