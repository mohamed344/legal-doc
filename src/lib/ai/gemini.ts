import { GoogleGenAI, Type } from "@google/genai";

export const GEMINI_MODEL = "gemini-2.5-flash";
export const MAX_BYTES = 15 * 1024 * 1024;

export const GEMINI_FALLBACK_MODELS = [
  GEMINI_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export const GEMINI_OVERLOAD_MESSAGE =
  "Le modèle IA est surchargé. Réessayez dans quelques instants.";

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server");
  return new GoogleGenAI({ apiKey });
}

export function isGeminiOverloaded(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (/\b(503|429)\b/.test(raw)) return true;
  if (
    lower.includes("unavailable") ||
    lower.includes("overload") ||
    lower.includes("high demand") ||
    lower.includes("rate limit") ||
    lower.includes("quota")
  ) {
    return true;
  }
  const anyErr = err as { status?: unknown; code?: unknown };
  const status = typeof anyErr.status === "number" ? anyErr.status : null;
  const code = typeof anyErr.code === "number" ? anyErr.code : null;
  if (status === 503 || status === 429) return true;
  if (code === 503 || code === 429) return true;
  return false;
}

type GenerateContentArgs = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GenerateContentResult = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

interface ResilientResult {
  ok: boolean;
  response?: GenerateContentResult;
  overloaded?: boolean;
  errorMessage?: string;
}

export async function callGeminiWithFallback(
  ai: GoogleGenAI,
  baseArgs: Omit<GenerateContentArgs, "model">,
  opts: { models?: string[]; maxAttempts?: number; logPrefix?: string } = {}
): Promise<ResilientResult> {
  const models = opts.models ?? GEMINI_FALLBACK_MODELS;
  const maxAttempts = opts.maxAttempts ?? 5;
  const logPrefix = opts.logPrefix ?? "[gemini]";
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let firstOverloadErr: unknown = null;
  let lastErr: unknown;

  const callWithRetry = async (model: string): Promise<GenerateContentResult> => {
    let attemptErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await ai.models.generateContent({ ...baseArgs, model });
      } catch (e) {
        attemptErr = e;
        if (!isGeminiOverloaded(e)) throw e;
        const base = Math.min(1000 * 2 ** attempt, 8000);
        const delay = base + Math.floor(Math.random() * 750);
        console.warn(
          `${logPrefix} ${model} overloaded (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms`
        );
        await sleep(delay);
      }
    }
    throw attemptErr;
  };

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isPrimary = i === 0;
    try {
      const response = await callWithRetry(model);
      return { ok: true, response };
    } catch (e) {
      lastErr = e;
      if (isGeminiOverloaded(e) && !firstOverloadErr) firstOverloadErr = e;
      if (isPrimary && !isGeminiOverloaded(e)) break;
      console.warn(
        `${logPrefix} model ${model} failed (${e instanceof Error ? e.message : String(e)}); trying next`
      );
    }
  }

  const reportErr = firstOverloadErr ?? lastErr;
  const overloaded =
    isGeminiOverloaded(reportErr) ||
    (reportErr instanceof Error &&
      (/\b(503|429)\b/.test(reportErr.message) ||
        /unavailable|overload|high demand|quota|rate/i.test(reportErr.message)));
  const rawMsg = reportErr instanceof Error ? reportErr.message : "gemini_call_failed";
  console.error(`${logPrefix} all models failed:`, rawMsg);
  return {
    ok: false,
    overloaded,
    errorMessage: rawMsg,
  };
}

export interface MediaInfo {
  kind: "document" | "image";
  mime: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
}

export function mediaTypeFor(file: File): MediaInfo | null {
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf") return { kind: "document", mime: "application/pdf" };
  if (t === "image/png") return { kind: "image", mime: "image/png" };
  if (t === "image/jpeg") return { kind: "image", mime: "image/jpeg" };
  if (t === "image/webp") return { kind: "image", mime: "image/webp" };
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return { kind: "document", mime: "application/pdf" };
  if (n.endsWith(".png")) return { kind: "image", mime: "image/png" };
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return { kind: "image", mime: "image/jpeg" };
  if (n.endsWith(".webp")) return { kind: "image", mime: "image/webp" };
  return null;
}

export const EXTRACTION_SYSTEM_PROMPT = `You are an extraction assistant for an Algerian legal practice. The user uploads a scanned form (Arabic, French, or mixed). Preserve the original script EXACTLY as written (do not translate Arabic to Latin or vice versa). Use ISO 8601 (YYYY-MM-DD) for unambiguous dates; otherwise copy the string verbatim. For numeric amounts, return plain digits without thousands separators.

STRICT RULES FOR MISSING VALUES:
- If a field is not clearly visible in the document, return "" (an empty string) EXACTLY — nothing else.
- NEVER invent, infer, paraphrase, guess, or generate a plausible value.
- NEVER reference the uploaded file's name, path, type, size, date, or any metadata.
- NEVER output placeholder phrases such as "extrait de", "extracted from", "from filename", "N/A", "non visible", "not visible", "unknown", "aucun", "none", "(from <filename>)", or anything containing a file extension like .pdf/.png/.jpg/.jpeg/.webp/.doc/.docx.
- NEVER wrap a value in parentheses to describe its source.
- Only return verbatim text that you can actually read as a filled-in value in the corresponding field on the document.`;

export { Type };
