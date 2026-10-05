import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on every request.
 * If Supabase env is missing (fresh clone, no keys yet) this is a no-op so
 * the app still boots and renders the auth pages.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!hasSupabaseConfig()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes an expiring session into the response cookies. getClaims()
  // verifies the token locally when the project signs with asymmetric keys
  // (no round trip to Supabase Auth on every request and prefetch) and falls
  // back to asking the server otherwise. Who the user is stays the page's
  // job: getAuthUser() still asks Supabase (lib/auth.ts).
  await supabase.auth.getClaims();

  return response;
}
