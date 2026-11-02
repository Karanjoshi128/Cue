import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/supabase/server";

/*
 * Keeps the Supabase session fresh. Access tokens expire after an hour, and a
 * Server Component can't write cookies, so without this every render after
 * that hour refreshed the token again and threw the result away. A page's
 * link prefetches then spent Supabase's refresh rate limit in seconds and the
 * page failed as signed out. Here the refresh happens once, and the new
 * cookies go to both the page being rendered and the browser.
 *
 * It only refreshes; who may see what is still decided by getAuth.
 */
export async function proxy(request: NextRequest) {
  // Signed-out visitors (the marketing site) have nothing to refresh.
  if (!isSupabaseConfigured() || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Cache-busting headers, so a CDN never serves one person's cookies to another.
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );
  // Refreshes the session only when the token has expired.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    // Pages and the OAuth routes. Not static files, images, or the cron and
    // API-key endpoints, which don't use the browser session.
    "/((?!_next/static|_next/image|api/cron|api/v1|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|mp4)$).*)",
  ],
};
