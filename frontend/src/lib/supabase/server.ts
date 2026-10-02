import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client for Server Components, Server Actions, and Route Handlers.
 * Awaits cookies() as required by Next.js 15+ / 16.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if proxy/middleware refreshes user sessions.
        }
      },
    },
  });
}

/**
 * Helper to securely get authenticated user claims on server-side.
 * Uses getClaims() and verifies the user without relying on unvalidated getSession().
 */
export async function getAuthenticatedUser() {
  const supabase = await createClient();

  try {
    // Check JWT claims locally using getClaims()
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

    if (!claimsError && claimsData?.claims?.sub) {
      // Claims verified; retrieve full user record
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!userError && userData?.user) {
        return { user: userData.user, claims: claimsData.claims, supabase };
      }
    }

    // Direct fallback verification with auth server
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userError && userData?.user) {
      return { user: userData.user, claims: null, supabase };
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }

  return { user: null, claims: null, supabase };
}
