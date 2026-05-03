import puppeteer, { Browser } from "puppeteer";
import { getPdfFontFaceCss } from "./fonts";
import { detectDir } from "@/lib/text/direction";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  try {
    const b = await browserPromise;
    if (!b.connected) {
      browserPromise = null;
      return getBrowser();
    }
    return b;
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
}

export async function renderHtmlToPdf(
  bodyHtml: string,
  { title = "Document", rtl = "auto", fontFamily }: RenderOptions = {},
): Promise<Uint8Array> {
  const isRtl = rtl === "auto" ? detectDir(bodyHtml) === "rtl" : rtl;
  const dir = isRtl ? "rtl" : "ltr";
  const lang = isRtl ? "ar" : "fr";
  const resolvedFont =
    fontFamily ?? (isRtl ? "'Noto Naskh Arabic', 'Amiri', Georgia, serif" : "Georgia, 'Times New Roman', serif");

  const browser = await getBrowser();
  let page;
  try {
    page = await browser.newPage();
  } catch (err) {
    await recycleBrowser();
    throw err;
  }

  try {
    const html = `<!doctype html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${getPdfFontFaceCss()}
    @page { size: A4; margin: 18mm 16mm; }
    html, body { background: #fff; color: #1a1a1a; }
    body {
      font-family: ${resolvedFont};
      font-size: 12pt;
      line-height: 1.7;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3 { font-weight: 700; margin: 0.8em 0 0.4em; }
    p { margin: 0 0 0.6em; }
    table { width: 100%; border-collapse: collapse; margin: 0.6em 0; }
    table, th, td { border: 1px solid #444; padding: 4px 6px; }
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
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;

    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 5000 });

    await Promise.race([
      page.evaluate(
        () => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve(),
      ),
      new Promise((r) => setTimeout(r, 2500)),
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

    const pdf = await page.pdf({ format: "A4", printBackground: true });
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
