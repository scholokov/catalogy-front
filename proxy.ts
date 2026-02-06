// Next.js 16+ uses proxy.ts as the sole edge entrypoint; middleware.ts is intentionally absent.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const hasSupabaseAuthCookie = (request: NextRequest) => {
  const cookies = request.cookies.getAll();
  return cookies.some(({ name, value }) => {
    if (!value) return false;
    if (name === "sb-access-token" || name === "sb-refresh-token") return true;
    return name.includes("sb-") && name.endsWith("auth-token");
  });
};

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  if (!hasSupabaseAuthCookie(request)) {
    const redirectUrl = request.nextUrl.clone();
    const redirectTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    redirectUrl.pathname = "/auth";
    redirectUrl.searchParams.set("redirect", redirectTarget);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api).*)"],
};
