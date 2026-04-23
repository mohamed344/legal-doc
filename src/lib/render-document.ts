import type { TemplateVariable } from "./supabase/types";

const FILENAME_ARTIFACT =
  /\b(?:extrait de|extracted from|from filename|from file|voir fichier|see file)\b/i;

function isArtifactValue(value: string): boolean {
  return FILENAME_ARTIFACT.test(value);
}

export function fillTemplate(
  bodyHtml: string | null,
  variables: Pick<TemplateVariable, "key">[],
  values: Record<string, unknown>,
  options: { placeholderForMissing?: boolean } = {}
): string {
  if (!bodyHtml) return "";
  let html = bodyHtml;
  for (const v of variables) {
    const raw = values[v.key];
    const isEmpty =
      raw === undefined ||
      raw === null ||
      raw === "" ||
      (typeof raw === "string" && isArtifactValue(raw));
    const filled = isEmpty
      ? options.placeholderForMissing
        ? `<span class="text-muted-foreground italic">{{${v.key}}}</span>`
        : ""
      : escapeHtml(String(raw));
    html = html.replaceAll(`{{${v.key}}}`, filled);
  }
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
