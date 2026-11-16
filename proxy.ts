import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

/**
 * Refreshes the Supabase session cookie and redirects anonymous visitors away from private pages.
 * This is an optimistic check only: every private page and action verifies the user again.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, searchParams } = request.nextUrl;

  // Supabase falls back to the Site URL ("/?code=…") when a redirect is not on its allow list:
  // finish the confirmation where it belongs instead of showing the landing page.
  if (pathname === "/" && (searchParams.has("code") || searchParams.has("token_hash"))) {
    const confirm = request.nextUrl.clone();
    confirm.pathname = "/auth/confirm";
    return NextResponse.redirect(confirm);
  }

  if (!signedIn && !isPublic(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }
  if (signedIn && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    const home = request.nextUrl.clone();
    home.pathname = "/overview";
    home.search = "";
    return NextResponse.redirect(home);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // API routes authenticate themselves (session, HMAC or webhook secret).
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
