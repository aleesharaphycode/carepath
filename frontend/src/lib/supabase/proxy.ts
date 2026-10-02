import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Handles cookie session refreshing and route protection for Next.js 16 SSR.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Do not run code between createServerClient and getUser().
  // A simple mistake could lead to random logouts.
  let user = null;
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    if (claimsData?.claims?.sub) {
      const { data: userData } = await supabase.auth.getUser();
      user = userData?.user ?? null;
    } else {
      const { data: userData } = await supabase.auth.getUser();
      user = userData?.user ?? null;
    }
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;

  const isProtectedPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/documents") ||
    pathname.startsWith("/timeline") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/family") ||
    pathname.startsWith("/consent") ||
    pathname.startsWith("/subscription");
  const isAuthPath = pathname === "/login" || pathname === "/register";

  // Redirect unauthenticated users trying to access protected paths
  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  // Redirect authenticated users away from login/register to dashboard
  if (isAuthPath && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
