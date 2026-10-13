import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseConfig } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on every request.
 * If Supabase env is missing or unusable (fresh clone, a blank paste) this is
 * a no-op so the app still boots and renders the auth pages.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!hasSupabaseConfig()) return response;

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
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
  // checks the token locally when it's signed with the project's asymmetric
  // key (the key set is fetched about every 10 minutes per warm instance, and
  // on each cold start); a symmetric-signed token, an unknown key id or no
  // WebCrypto falls back to asking Supabase. Who the user is stays the page's
  // job: getAuthUser() still asks Supabase (lib/auth.ts), so a revoked
  // session is refused there even though its cookies linger here until the
  // token expires.
  try {
    await supabase.auth.getClaims();
  } catch (e) {
    // A malformed token in the cookie makes getClaims throw (getUser didn't):
    // leave it to the page's check rather than fail every request. Logged by
    // type only (never the token), so a fault on every request still shows.
    console.warn(`[turfcut] session check skipped: ${e instanceof Error ? e.name : typeof e}`);
  }

  return response;
}
