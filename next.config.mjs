import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "puppeteer"],
    // @sparticuz/chromium reads its brotli binary (bin/*.br) from disk at
    // runtime, so Next's file tracing doesn't copy it into the serverless
    // function. Force-include the bin dir for every route that renders a PDF,
    // otherwise the launch fails with "input directory .../bin does not exist".
    outputFileTracingIncludes: {
      "/api/documents/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
      "/api/documents/preview/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
      "/api/documents/bulk/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
      "/api/invoices/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    },
  },
};

export default withNextIntl(nextConfig);
