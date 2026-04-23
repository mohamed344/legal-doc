import puppeteer, { Browser } from "puppeteer";

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

export interface RenderOptions {
  title?: string;
  rtl?: boolean;
  fontFamily?: string;
}

export async function renderHtmlToPdf(
  bodyHtml: string,
  { title = "Document", rtl = true, fontFamily = "'Noto Naskh Arabic', 'Amiri', Georgia, serif" }: RenderOptions = {}
): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const dir = rtl ? "rtl" : "ltr";
    const lang = rtl ? "ar" : "fr";
    const html = `<!doctype html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    html, body { background: #fff; color: #1a1a1a; }
    body {
      font-family: ${fontFamily};
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
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;

    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return pdf;
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
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close().catch(() => {});
  }
}
