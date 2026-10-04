import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16: `middleware.ts` is deprecated, renamed to `proxy.ts`.
 * Same behavior — runs before routes render. We only refresh the Supabase
 * session cookie here; authz decisions happen in pages/layouts via
 * requireRole() in src/lib/auth.ts.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Stripe webhooks carry no session, and the service worker script is a
    // static file: skip the session refresh for them.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|api/stripe/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
