import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for use in Browser/Client Components.
 * Uses cookie storage to synchronize authentication state with SSR server components.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(supabaseUrl, supabaseKey);
}
