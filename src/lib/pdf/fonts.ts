import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

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

let cachedCss: string | null = null;

export function getPdfFontFaceCss(): string {
  if (cachedCss !== null) return cachedCss;
  const blocks: string[] = [];
  for (const f of FONTS) {
    try {
      const path = req.resolve(f.pkg);
      const buf = readFileSync(path);
      const b64 = buf.toString("base64");
      blocks.push(
        `@font-face { font-family: '${f.family}'; font-style: normal; font-weight: ${f.weight}; font-display: swap; src: url(data:font/woff2;base64,${b64}) format('woff2'); }`,
      );
    } catch (err) {
      console.warn(`[pdf/fonts] failed to load ${f.file}:`, err);
    }
  }
  cachedCss = blocks.join("\n");
  return cachedCss;
}
