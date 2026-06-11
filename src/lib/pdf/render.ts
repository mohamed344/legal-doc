import type { Browser } from "puppeteer-core";
import { getPdfFontFaceCss } from "./fonts";
import { LETTERHEAD_HTML } from "./letterhead";
import { injectFileNumber } from "./letterhead-fill";
import { stripLeadingLetterhead } from "./strip-letterhead";
import { detectDir } from "@/lib/text/direction";

export { stripLeadingLetterhead };

let browserPromise: Promise<Browser> | null = null;

// On AWS Lambda / Vercel the bundled Chrome is unavailable, so use
// puppeteer-core + @sparticuz/chromium. Locally, fall back to full puppeteer.
// NODE_ENV is set to "production" on every Vercel deployment and to
// "development" under `next dev`, so it is the dependable signal — Vercel does
// not reliably expose VERCEL/AWS_* env vars to the function at runtime (e.g.
// when "Automatically expose System Environment Variables" is off).
const isServerless =
  process.env.NODE_ENV === "production" ||
  !!process.env.AWS_LAMBDA_FUNCTION_VERSION ||
  !!process.env.VERCEL;

async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteerCore = (await import("puppeteer-core")).default;
    return puppeteerCore.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const puppeteer = (await import("puppeteer")).default;
  return (await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })) as unknown as Browser;
}

async function pingBrowser(b: Browser): Promise<boolean> {
  if (!b.connected) return false;
  try {
    await Promise.race([
      b.version(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("ping_timeout")), 500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (await pingBrowser(existing)) return existing;
    } catch {
      // fall through to relaunch
    }
    await recycleBrowser();
  }
  browserPromise = launchBrowser();
  try {
    return await browserPromise;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
}

async function recycleBrowser() {
  const p = browserPromise;
  browserPromise = null;
  if (p) {
    const b = await p.catch(() => null);
    await b?.close().catch(() => {});
  }
}

export interface RenderOptions {
  title?: string;
  rtl?: boolean | "auto";
  fontFamily?: string;
  fileNumber?: string | null;
}

// Manually-built (Tiptap) templates can carry oversized inline font sizes and
// stacks of empty paragraphs/<br> that blow a short document onto a second page.
// AI-imported templates don't (their inline styles are stripped on import), so
// they render compactly at the 11pt body size. Normalise every body the same
// way: clamp big inline fonts down, drop empty spacing — so all documents stay
// compact and consistent.
function compactBody(html: string): string {
  return html
    // inline pt font sizes above 12pt → 12pt
    .replace(/font-size\s*:\s*(\d+(?:\.\d+)?)pt/gi, (m, n) =>
      parseFloat(n) > 12 ? "font-size:12pt" : m,
    )
    // inline px font sizes above 16px → 12pt
    .replace(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi, (m, n) =>
      parseFloat(n) > 16 ? "font-size:12pt" : m,
    )
    // drop empty paragraphs (whitespace / &nbsp; / <br> only)
    .replace(/<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    // collapse runs of consecutive <br> into a single break
    .replace(/(?:<br\s*\/?>\s*){2,}/gi, "<br />");
}

export async function renderHtmlToPdf(
  bodyHtml: string,
  { title = "Document", rtl = "auto", fontFamily, fileNumber }: RenderOptions = {},
): Promise<Uint8Array> {
  const cleanedBody = compactBody(stripLeadingLetterhead(bodyHtml ?? ""));
  const isRtl = rtl === "auto" ? detectDir(cleanedBody) === "rtl" : rtl;
  const dir = isRtl ? "rtl" : "ltr";
  const lang = isRtl ? "ar" : "fr";
  const resolvedFont =
    fontFamily ?? (isRtl ? "'Noto Naskh Arabic', 'Amiri', Georgia, serif" : "Georgia, 'Times New Roman', serif");

  let page;
  let browser = await getBrowser();
  try {
    page = await browser.newPage();
  } catch {
    await recycleBrowser();
    browser = await getBrowser();
    page = await browser.newPage();
  }

  try {
    const html = `<!doctype html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${getPdfFontFaceCss()}
    @page { size: A4; margin: 10mm 12mm 12mm; }
    html, body { background: #fff; color: #1a1a1a; }
    body {
      font-family: ${resolvedFont};
      font-size: 10.5pt;
      line-height: 1.32;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3 { font-weight: 700; margin: 0.35em 0 0.15em; }
    p { margin: 0 0 0.3em; }
    ul, ol { margin: 0.3em 0; padding-inline-start: 1.4em; }
    li { margin: 0.08em 0; }
    table { width: 100%; border-collapse: collapse; margin: 0.35em 0; }
    th { border-bottom: 1px solid #888; padding: 4px 6px; text-align: inherit; }
    td { padding: 4px 6px; }
    .legal-document { max-width: 100%; }
    img { max-width: 100%; height: auto; }
    [style*="text-align: center"] { text-align: center; }
    [style*="text-align: right"]  { text-align: right; }
    [style*="text-align: left"]   { text-align: left; }
    [style*="text-align: justify"] { text-align: justify; }
    mark { background-color: #fff59d; padding: 0 2px; }
    sub, sup { font-size: 0.75em; line-height: 0; }
    u { text-decoration: underline; }
    a { color: #1a4f8a; text-decoration: underline; }
    /* Letterhead — rendered once at the top of page 1, matching the docx.
       Kept compact so the header band matches the on-screen letterhead. */
    .pdf-letterhead { margin: 0 0 3mm; font-size: 9pt; line-height: 1.2; }
    .pdf-letterhead table { table-layout: fixed; width: 100%; border-collapse: collapse; }
    .pdf-letterhead td { padding: 0 4px; vertical-align: top; }
    .pdf-letterhead p { margin: 0.04em 0; }
    .pdf-letterhead h1 { font-size: 13pt; margin: 0.12em 0; }
    .pdf-letterhead img { max-width: 100%; height: auto; max-height: 20mm; }
    .pdf-letterhead-rule { border: none; border-bottom: 1px solid #999; margin: 0 0 2mm; }
  </style>
</head>
<body><div class="pdf-letterhead">${injectFileNumber(LETTERHEAD_HTML, fileNumber)}</div><hr class="pdf-letterhead-rule" />${cleanedBody}</body>
</html>`;

    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });

    // Explicitly force-load the embedded Arabic faces, then wait for the font
    // set to settle. With font-display:block the glyphs stay unpainted until
    // the woff2 decodes; on a cold serverless function that can take a couple
    // of seconds, so give it a generous cap (the route's maxDuration is 60s)
    // rather than the previous 2.5s race that could capture blank Arabic.
    await Promise.race([
      page.evaluate(async () => {
        const fonts = (document as unknown as {
          fonts?: { ready: Promise<unknown>; load: (f: string) => Promise<unknown> };
        }).fonts;
        if (!fonts) return;
        await Promise.all([
          fonts.load("400 16px 'Noto Naskh Arabic'"),
          fonts.load("700 16px 'Noto Naskh Arabic'"),
          fonts.load("400 16px 'Amiri'"),
          fonts.load("700 16px 'Amiri'"),
        ]).catch(() => {});
        await fonts.ready;
      }),
      new Promise((r) => setTimeout(r, 10000)),
    ]);

    await Promise.race([
      page.evaluate(() =>
        Promise.all(
          Array.from(document.images).map((i) =>
            i.complete
              ? null
              : new Promise<void>((res) => {
                  i.onload = () => res();
                  i.onerror = () => res();
                }),
          ),
        ),
      ),
      new Promise((r) => setTimeout(r, 3000)),
    ]);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: "10mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return pdf;
  } catch (err) {
    await recycleBrowser();
    throw err;
  } finally {
    await page.close().catch(() => {});
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function shutdownBrowser() {
  await recycleBrowser();
}
