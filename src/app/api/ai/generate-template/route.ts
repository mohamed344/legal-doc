import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";
import { GEMINI_MODEL, MAX_BYTES, Type, getGeminiClient } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const VARIABLE_TYPES = ["text", "date", "number", "select", "checkbox"] as const;

const TEMPLATE_GENERATION_PROMPT = `You are building a reusable legal-document template for an Algerian lawyer's practice.

You will receive a single filled-in legal document (Arabic, French, or mixed). Your job:

1. Rewrite the document content as reusable HTML, replacing every piece of client-, case-, date-, or amount-specific data with a variable placeholder of the form \`{{variable_key}}\`. Keep structural formatting: headings (<h1>, <h2>, <h3>), paragraphs (<p>), line breaks (<br>), bold (<strong>), and italics (<em>). Do NOT emit <script>, <style>, <img>, or inline style/class attributes.
2. Preserve the ORIGINAL script exactly (Arabic stays Arabic, French stays French — do NOT translate).
3. A "variable" is a field that would change from one client/case to the next: names, addresses, phone numbers, national IDs, case numbers, dates, amounts, subject of the case, etc. Fixed legal boilerplate (article numbers, standard clauses) is NOT a variable.
4. Variable keys: lowercase snake_case ASCII only (e.g. \`nom_client\`, \`date_signature\`, \`montant_honoraires\`). No accents, no spaces.
5. For each variable, suggest:
   - key (snake_case)
   - label (human-readable, in the document's dominant language)
   - type — one of: "text", "date", "number", "select", "checkbox"
   - required — true for obviously-required fields, false otherwise
   - category — short grouping label like "Client", "Cabinet", "Affaire", "Dates", "Financier" (one word is fine)
   - value — the ORIGINAL filled-in value for this variable as it actually appears in the uploaded document. Preserve the source script exactly (Arabic stays Arabic, French stays French). Dates: prefer ISO 8601 (YYYY-MM-DD) only when unambiguous, otherwise copy verbatim. Numbers: plain digits, no thousands separators. If the value is genuinely blank in the source, return "" — do NOT invent, infer, or reference the file name.
6. Also suggest a short template \`name\` (3-8 words) summarising what this document is, and a short \`category\` (e.g. "Contrat", "Procuration", "Mise en demeure", "Requête").

Return STRICT JSON matching the provided schema. No markdown, no backticks around the JSON.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Short template name" },
    category: { type: Type.STRING, description: "Template category" },
    bodyHtml: {
      type: Type.STRING,
      description: "Template body as HTML with {{key}} placeholders",
    },
    variables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          label: { type: Type.STRING },
          type: { type: Type.STRING },
          required: { type: Type.BOOLEAN },
          category: { type: Type.STRING },
          value: { type: Type.STRING },
        },
        required: ["key", "label", "type", "required", "category", "value"],
        propertyOrdering: ["key", "label", "type", "required", "category", "value"],
      },
    },
  },
  required: ["name", "category", "bodyHtml", "variables"],
  propertyOrdering: ["name", "category", "bodyHtml", "variables"],
};

function detectKind(file: File): "pdf" | "docx" | null {
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf") return "pdf";
  if (
    t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    t === "application/msword"
  ) {
    return "docx";
  }
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx") || n.endsWith(".doc")) return "docx";
  return null;
}

function sanitizeKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

type GeminiVariable = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  category: string;
  value: string;
};

const ROUTE_VERSION = "v3";

export async function POST(request: Request) {
  console.log(`[generate-template] ${ROUTE_VERSION} invoked`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", v: ROUTE_VERSION },
      { status: 401 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const kind = detectKind(file);
  if (!kind) {
    return NextResponse.json({ ok: false, error: "unsupported_media_type" }, { status: 415 });
  }

  let ai;
  try {
    ai = getGeminiClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "no_api_key" },
      { status: 500 }
    );
  }

  let userParts: Array<
    { inlineData: { mimeType: string; data: string } } | { text: string }
  >;
  if (kind === "pdf") {
    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");
    userParts = [
      { inlineData: { mimeType: "application/pdf", data: base64 } },
      {
        text: `Here is the filled legal document. Turn it into a reusable template per the rules.`,
      },
    ];
  } else {
    let html: string;
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const { value } = await mammoth.convertToHtml({ buffer: buf });
      html = value;
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "docx_parse_failed" },
        { status: 400 }
      );
    }
    userParts = [
      {
        text: `Here is the filled legal document as HTML (parsed from a .docx). Turn it into a reusable template per the rules.\n\n${html}`,
      },
    ];
  }

  const isOverloaded = (err: unknown): boolean => {
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
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const MAX_ATTEMPTS = 5;

  const callWithRetry = async (model: string) => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: userParts }],
          config: {
            systemInstruction: TEMPLATE_GENERATION_PROMPT,
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.2,
            maxOutputTokens: 32768,
          },
        });
      } catch (e) {
        lastErr = e;
        if (!isOverloaded(e)) throw e;
        const base = Math.min(1000 * 2 ** attempt, 8000);
        const delay = base + Math.floor(Math.random() * 750);
        console.warn(
          `[generate-template] ${model} overloaded (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${delay}ms`
        );
        await sleep(delay);
      }
    }
    throw lastErr;
  };

  const FALLBACK_MODELS = [
    GEMINI_MODEL,
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ];

  let resp;
  let firstOverloadErr: unknown = null;
  let lastErr: unknown;
  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const model = FALLBACK_MODELS[i];
    const isPrimary = i === 0;
    try {
      resp = await callWithRetry(model);
      break;
    } catch (e) {
      lastErr = e;
      if (isOverloaded(e) && !firstOverloadErr) firstOverloadErr = e;
      if (isPrimary && !isOverloaded(e)) break;
      console.warn(
        `[generate-template] model ${model} failed (${e instanceof Error ? e.message : String(e)}); trying next`
      );
    }
  }
  if (!resp) {
    const reportErr = firstOverloadErr ?? lastErr;
    const overloaded = isOverloaded(reportErr);
    const rawMsg = reportErr instanceof Error ? reportErr.message : "gemini_call_failed";
    const looksLikeCapacity =
      overloaded ||
      /\b(503|429)\b/.test(rawMsg) ||
      /unavailable|overload|high demand|quota|rate/i.test(rawMsg);
    console.error(`[generate-template] ${ROUTE_VERSION} all models failed:`, rawMsg);
    return NextResponse.json(
      {
        ok: false,
        v: ROUTE_VERSION,
        error: looksLikeCapacity ? "gemini_overloaded" : rawMsg,
        message: looksLikeCapacity
          ? "Le modèle IA est surchargé. Réessayez dans quelques instants."
          : "Erreur lors de l'analyse du document. Réessayez.",
      },
      { status: looksLikeCapacity ? 503 : 502 }
    );
  }

  const text = resp.text;
  if (!text) {
    console.error(
      "[generate-template] Gemini returned empty text. finishReason:",
      resp.candidates?.[0]?.finishReason,
      "promptFeedback:",
      resp.promptFeedback
    );
    return NextResponse.json(
      {
        ok: false,
        error: "gemini_empty_response",
        finishReason: resp.candidates?.[0]?.finishReason ?? null,
      },
      { status: 502 }
    );
  }

  let parsed: {
    name?: unknown;
    category?: unknown;
    bodyHtml?: unknown;
    variables?: unknown;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[generate-template] Gemini returned invalid JSON:", text.slice(0, 400));
    return NextResponse.json(
      { ok: false, error: "gemini_invalid_json", raw: text.slice(0, 400) },
      { status: 502 }
    );
  }

  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const category = typeof parsed.category === "string" ? parsed.category.trim() : "";
  const bodyHtml = typeof parsed.bodyHtml === "string" ? parsed.bodyHtml : "";
  const rawVars = Array.isArray(parsed.variables) ? (parsed.variables as unknown[]) : [];

  const seenKeys = new Set<string>();
  const variables: GeminiVariable[] = [];
  for (const r of rawVars) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const rawKey = typeof v.key === "string" ? v.key : "";
    const key = sanitizeKey(rawKey);
    if (!key || seenKeys.has(key)) continue;
    const label = typeof v.label === "string" && v.label.trim() ? v.label.trim() : key;
    const rawType = typeof v.type === "string" ? v.type.toLowerCase() : "text";
    const type = (VARIABLE_TYPES as readonly string[]).includes(rawType) ? rawType : "text";
    const required = v.required === true;
    const cat = typeof v.category === "string" ? v.category.trim() : "";
    const value = typeof v.value === "string" ? v.value : "";
    seenKeys.add(key);
    variables.push({ key, label, type, required, category: cat, value });
  }

  return NextResponse.json({
    ok: true,
    v: ROUTE_VERSION,
    name,
    category,
    bodyHtml,
    variables,
  });
}
