import { type NextRequest } from "next/server";
import { updateSession as betterAuthUpdateSession } from "@/lib/auth/middleware";

export const runtime = "nodejs";

export async function middleware(request: NextRequest) {
  return await betterAuthUpdateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - _vercel (platform routes, incl. Web Analytics beacons — no session
     *   lookup should be paid for a page view)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
