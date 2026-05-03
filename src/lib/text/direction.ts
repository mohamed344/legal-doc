// Single source of truth for RTL detection.
// Range covers: Arabic (U+0600-06FF), Arabic Supplement (U+0750-077F),
// Arabic Extended-A/B (U+08A0-08FF, U+0870-089F), Syriac (U+0700-074F),
// Arabic Presentation Forms-A (U+FB50-FDFF) and Forms-B (U+FE70-FEFF).
const RTL_CHAR_RE =
  /[؀-ۿݐ-ݿࡰ-࢟ࢠ-ࣿ܀-ݏﭐ-﷿ﹰ-﻿]/;

export function isArabic(text: string | null | undefined): boolean {
  if (!text) return false;
  return RTL_CHAR_RE.test(text);
}

export function detectDir(
  text: string | null | undefined,
  locale?: string,
): "ltr" | "rtl" {
  if (locale === "ar") return "rtl";
  return isArabic(text) ? "rtl" : "ltr";
}
