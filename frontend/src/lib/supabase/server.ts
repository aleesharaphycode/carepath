import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withTimeout } from "@/lib/utils";

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
  console.log("[CarePath Workspace] initialization started");
  console.log("[CarePath Workspace] auth started");
  const authStart = Date.now();
  const supabase = await createClient();

  try {
    const claimsStart = Date.now();
    // Check JWT claims locally using getClaims() if available
    let claimsData = null;
    let claimsError = null;
    
    if (typeof supabase.auth.getClaims === 'function') {
        const res = await supabase.auth.getClaims();
        claimsData = res.data;
        claimsError = res.error;
    } else {
        claimsError = new Error("getClaims not available");
    }
    
    console.log(`[CarePath Workspace] auth getClaims completed in ${Date.now() - claimsStart}ms`);

    if (!claimsError && claimsData?.claims?.sub) {
      // Claims verified; retrieve full user record
      const userStart = Date.now();
      const { data: userData, error: userError } = await withTimeout(
        supabase.auth.getUser(),
        5000,
        "Auth getUser"
      );
      console.log(`[CarePath Workspace] auth getUser completed in ${Date.now() - userStart}ms`);
      
      if (!userError && userData?.user) {
        console.log(`[CarePath Workspace] auth completed in ${Date.now() - authStart}ms`);
        return { user: userData.user, claims: claimsData.claims, supabase };
      }
    }

    // Direct fallback verification with auth server
    const fallbackStart = Date.now();
    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      5000,
      "Auth fallback getUser"
    );
    console.log(`[CarePath Workspace] auth fallback getUser completed in ${Date.now() - fallbackStart}ms`);
    
    if (!userError && userData?.user) {
      console.log(`[CarePath Workspace] auth completed in ${Date.now() - authStart}ms`);
      return { user: userData.user, claims: null, supabase };
    }
  } catch (err) {
    console.error("[CarePath Workspace] FAILED: auth", err);
  }

  console.log(`[CarePath Workspace] auth completed (failed) in ${Date.now() - authStart}ms`);
  return { user: null, claims: null, supabase };
}
