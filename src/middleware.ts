import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_PATHS = ["/login", "/signup", "/reset-password", "/auth/callback"];

function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  const pathname = request.nextUrl.pathname;
  const localeStripped = stripLocale(pathname);
  const isPublic = PUBLIC_PATHS.some((p) => localeStripped === p || localeStripped.startsWith(`${p}/`));

  // Unauthenticated users hitting protected routes → /login
  if (!user && !isPublic) {
    const localeMatch = pathname.match(/^\/(fr|ar)(\/|$)/);
    const locale = localeMatch?.[1] ?? routing.defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    return NextResponse.redirect(url);
  }

  // Authenticated users hitting auth pages → dashboard
  if (user && isPublic && localeStripped !== "/auth/callback") {
    const localeMatch = pathname.match(/^\/(fr|ar)(\/|$)/);
    const locale = localeMatch?.[1] ?? routing.defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    return NextResponse.redirect(url);
  }

  // Run intl middleware and merge its cookies/headers into the Supabase response
  const intlResponse = intlMiddleware(request);
  intlResponse.cookies.getAll().forEach((c) => supabaseResponse.cookies.set(c.name, c.value));
  intlResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "x-middleware-rewrite" || key.toLowerCase() === "location") {
      supabaseResponse.headers.set(key, value);
    }
  });

  // If intl is redirecting (missing locale prefix), return its response directly
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
