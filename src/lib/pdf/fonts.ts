import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const req = createRequire(import.meta.url);

interface FontFace {
  family: string;
  weight: number;
  pkg: string;
  file: string;
}

const FONTS: FontFace[] = [
  { family: "Amiri", weight: 400, pkg: "@fontsource/amiri/files/amiri-arabic-400-normal.woff2", file: "amiri-arabic-400-normal.woff2" },
  { family: "Amiri", weight: 700, pkg: "@fontsource/amiri/files/amiri-arabic-700-normal.woff2", file: "amiri-arabic-700-normal.woff2" },
  { family: "Noto Naskh Arabic", weight: 400, pkg: "@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2", file: "noto-naskh-arabic-arabic-400-normal.woff2" },
  { family: "Noto Naskh Arabic", weight: 700, pkg: "@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-700-normal.woff2", file: "noto-naskh-arabic-arabic-700-normal.woff2" },
];

// Read a font file by trying Node's resolver first (works locally and in any
// env where the bundled chunk resolves node_modules correctly), then falling
// back to a path relative to the function root (/var/task on Vercel). Without
// this fallback a single bundler quirk would make readFileSync throw, the
// @font-face CSS would come out empty, and Arabic text would render blank in
// the serverless Chromium (which ships no system Arabic fonts).
function readFont(f: FontFace): Buffer | null {
  try {
    return readFileSync(req.resolve(f.pkg));
  } catch {
    // fall through to the cwd-relative path
  }
  try {
    return readFileSync(path.join(process.cwd(), "node_modules", f.pkg));
  } catch (err) {
    console.warn(`[pdf/fonts] failed to load ${f.file}:`, err);
    return null;
  }
}

let cachedCss: string | null = null;

export function getPdfFontFaceCss(): string {
  if (cachedCss !== null) return cachedCss;
  const blocks: string[] = [];
  for (const f of FONTS) {
    const buf = readFont(f);
    if (!buf) continue;
    const b64 = buf.toString("base64");
    blocks.push(
      // font-display: block — keep glyphs unpainted until the embedded font is
      // ready instead of flashing a (missing) fallback, so a slow cold-start
      // decode never bakes blank Arabic into the PDF.
      `@font-face { font-family: '${f.family}'; font-style: normal; font-weight: ${f.weight}; font-display: block; src: url(data:font/woff2;base64,${b64}) format('woff2'); }`,
    );
  }
  if (blocks.length < FONTS.length) {
    console.warn(`[pdf/fonts] embedded ${blocks.length}/${FONTS.length} font faces`);
  }
  cachedCss = blocks.join("\n");
  return cachedCss;
}
