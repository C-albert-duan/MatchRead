import { type NextRequest, NextResponse } from "next/server";
import { isBindHostname } from "@/lib/site-origin";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (isBindHostname(host)) {
    const url = request.nextUrl.clone();
    url.hostname = "localhost";
    return NextResponse.redirect(url, 308);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
