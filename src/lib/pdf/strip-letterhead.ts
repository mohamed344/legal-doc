export function stripLeadingLetterhead(html: string): string {
  if (!html) return html;
  // Strip a leading block of header-like content (images, contact lines, the
  // cabinet's Arabic name) inserted at the top of imported template body_html.
  // Conservative: only the first contiguous run of qualifying elements.
  const headerSignals = [
    /data:image\//i,
    /\bcommitforce\b/i,
    /كومیتفورس|كوميت فورس|كوميتفورس/,
    /\+?\d{1,3}[\s\-.()]?\d/,
    /[\w.+-]+@[\w-]+\.[\w.-]+/,
    /\bcabinet\s+d'?avocats?\b/i,
    /\bavocat\b/i,
    /<img\b/i,
  ];
  const blockTag = /<(p|div|header|section|h1|h2|h3|table|figure)\b[^>]*>[\s\S]*?<\/\1>\s*/i;
  const standaloneImg = /<img\b[^>]*>\s*/i;
  const hrTag = /<hr\b[^>]*>\s*/i;

  let rest = html.trimStart();
  let consumed = 0;
  for (let i = 0; i < 6; i++) {
    const hr = rest.match(hrTag);
    if (hr && hr.index === 0) {
      return rest.slice(hr[0].length).trimStart();
    }
    const img = rest.match(standaloneImg);
    if (img && img.index === 0) {
      rest = rest.slice(img[0].length).trimStart();
      consumed++;
      continue;
    }
    const block = rest.match(blockTag);
    if (!block || block.index !== 0) break;
    const looksLikeHeader = headerSignals.some((re) => re.test(block[0]));
    if (!looksLikeHeader) break;
    rest = rest.slice(block[0].length).trimStart();
    consumed++;
  }
  return consumed > 0 ? rest : html;
}
