import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const isAdminPath = (pathname: string) =>
  pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/") || pathname.startsWith("/api/export/");

const isClientPath = (pathname: string) =>
  pathname === "/client" || pathname.startsWith("/client/") || pathname.startsWith("/api/invoices");

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const wantsAdmin = isAdminPath(pathname);
  const wantsClient = isClientPath(pathname);

  if (!wantsAdmin && !wantsClient) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const role = (token as unknown as { role?: string }).role;

  if (wantsAdmin && role !== "ADMIN") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/client";
    return NextResponse.redirect(url);
  }

  if (wantsClient && role !== "CLIENT") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/client/:path*", "/api/admin/:path*", "/api/invoices/:path*", "/api/export/:path*"],
};
