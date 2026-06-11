import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Runtime-read assets the PDF routes need bundled into their serverless
// functions (see outputFileTracingIncludes below).
const PDF_TRACE_INCLUDES = [
  "./node_modules/@sparticuz/chromium/bin/**/*",
  "./node_modules/@fontsource/amiri/files/*-arabic-*-normal.woff2",
  "./node_modules/@fontsource/noto-naskh-arabic/files/*-arabic-*-normal.woff2",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "puppeteer"],
    // These files are read from disk at runtime (not statically imported), so
    // Next's file tracing leaves them out of the serverless function bundle:
    //  - @sparticuz/chromium reads its brotli binary (bin/*.br) — without it the
    //    launch fails with "input directory .../bin does not exist".
    //  - src/lib/pdf/fonts.ts readFileSync's the @fontsource Arabic .woff2 files
    //    to embed them as base64 @font-face — without them Arabic text renders
    //    blank in the PDF (the minimal Chromium has no system Arabic fonts).
    // Force-include all of them for every route that renders a PDF.
    outputFileTracingIncludes: {
      "/api/documents/[id]/pdf": PDF_TRACE_INCLUDES,
      "/api/documents/preview/pdf": PDF_TRACE_INCLUDES,
      "/api/documents/bulk/pdf": PDF_TRACE_INCLUDES,
      "/api/invoices/[id]/pdf": PDF_TRACE_INCLUDES,
    },
  },
};

export default withNextIntl(nextConfig);
