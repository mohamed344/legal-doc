import type { Metadata } from "next";
import { Fraunces, Noto_Kufi_Arabic } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Toaster } from "sonner";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/context/auth-context";
import { routing, type Locale } from "@/i18n/routing";
import "../globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
});

const notoKufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Commitforce — Gestion documentaire juridique",
  description: "Plateforme moderne de gestion documentaire pour les cabinets d'avocats",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  // Use getSession (cookie-only, no refresh) instead of getUser. Calling
  // getUser in a Server Component triggers a token-refresh whose new
  // cookies cannot be persisted (Server Components are read-only for
  // cookies), which then burns the refresh token and causes /api/me to
  // 401 on the next request. Middleware is responsible for refreshing.
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${GeistSans.variable} ${fraunces.variable} ${notoKufi.variable}`}
      style={{ ["--font-sans" as string]: GeistSans.style.fontFamily }}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <AuthProvider initialUser={user}>{children}</AuthProvider>
          <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} richColors closeButton />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
