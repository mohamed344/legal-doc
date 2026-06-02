// The static letterhead (LETTERHEAD_HTML) carries a "رقم الملف: ......" line
// with a dotted blank. This replaces that blank with the document's generated
// file number (YEAR/0001) at render time. Returns the html unchanged when no
// number is available (e.g. before migration 0013 is applied).
export function injectFileNumber(letterheadHtml: string, fileNumber?: string | null): string {
  if (!fileNumber) return letterheadHtml;
  // الملف may contain tatweel (ـ) elongation characters; match either spelling,
  // then the colon and the dotted blank that follows it.
  return letterheadHtml.replace(/(المل[ـ]*ف\s*:\s*)\.{3,}/u, `$1${fileNumber}`);
}
