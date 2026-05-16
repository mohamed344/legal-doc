import puppeteer, { Browser } from "puppeteer";
import { getPdfFontFaceCss } from "./fonts";
import { LETTERHEAD_HTML } from "./letterhead";
import { stripLeadingLetterhead } from "./strip-letterhead";
import { detectDir } from "@/lib/text/direction";

export { stripLeadingLetterhead };

let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
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
}

function buildFooterTemplate(): string {
  return `<div style="
    width:100%;
    padding:0 14mm 3mm;
    font-size:8pt;
    color:#888;
    text-align:center;
    font-family:Georgia,'Times New Roman',serif;
    box-sizing:border-box;
  "><span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
}

export async function renderHtmlToPdf(
  bodyHtml: string,
  { title = "Document", rtl = "auto", fontFamily }: RenderOptions = {},
): Promise<Uint8Array> {
  const cleanedBody = stripLeadingLetterhead(bodyHtml ?? "");
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
    @page { size: A4; margin: 16mm 14mm 18mm; }
    html, body { background: #fff; color: #1a1a1a; }
    body {
      font-family: ${resolvedFont};
      font-size: 11pt;
      line-height: 1.5;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3 { font-weight: 700; margin: 0.5em 0 0.25em; }
    p { margin: 0 0 0.45em; }
    table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
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
    /* Letterhead — rendered once at the top of page 1, matching the docx. */
    .pdf-letterhead { margin: 0 0 10mm; }
    .pdf-letterhead table { table-layout: fixed; width: 100%; border-collapse: collapse; }
    .pdf-letterhead td { padding: 0 4px; vertical-align: top; }
    .pdf-letterhead p { margin: 0.1em 0; }
    .pdf-letterhead h1 { font-size: 18pt; margin: 0.25em 0; }
    .pdf-letterhead img { max-width: 100%; height: auto; max-height: 30mm; }
    .pdf-letterhead-rule { border: none; border-bottom: 1px solid #999; margin: 0 0 6mm; }
  </style>
</head>
<body><div class="pdf-letterhead">${LETTERHEAD_HTML}</div><hr class="pdf-letterhead-rule" />${cleanedBody}</body>
</html>`;

    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });

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

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: buildFooterTemplate(),
      margin: { top: "16mm", right: "14mm", bottom: "18mm", left: "14mm" },
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
