import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  EXTRACTION_SYSTEM_PROMPT,
  GEMINI_OVERLOAD_MESSAGE,
  MAX_BYTES,
  Type,
  callGeminiWithFallback,
  getGeminiClient,
  mediaTypeFor,
} from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

type PerRowVar = {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "select" | "checkbox";
};

function buildResponseSchema(vars: PerRowVar[]) {
  const rowProperties: Record<string, { type: typeof Type.STRING; description: string }> = {};
  for (const v of vars) {
    rowProperties[v.key] = { type: Type.STRING, description: v.label };
  }
  return {
    type: Type.OBJECT,
    properties: {
      rows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: rowProperties,
          required: vars.map((v) => v.key),
          propertyOrdering: vars.map((v) => v.key),
        },
      },
    },
    required: ["rows"],
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const templateId = form.get("template_id");

  if (!(file instanceof File) || typeof templateId !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const media = mediaTypeFor(file);
  if (!media) {
    return NextResponse.json({ ok: false, error: "unsupported_media_type" }, { status: 415 });
  }

  const { data: tpl, error: tplErr } = await supabase
    .from("templates")
    .select("id, name")
    .eq("id", templateId)
    .single();
  if (tplErr || !tpl) {
    return NextResponse.json({ ok: false, error: "template_not_found" }, { status: 404 });
  }

  const { data: varRows } = await supabase
    .from("template_variables")
    .select("key, label, type, scope")
    .eq("template_id", templateId)
    .eq("scope", "per_row")
    .order("order_index", { ascending: true });

  const perRow = (varRows ?? []) as PerRowVar[];
  if (perRow.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_per_row_variables",
        message: "This template has no per-row variables to extract.",
      },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  let ai;
  try {
    ai = getGeminiClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "no_api_key" },
      { status: 500 }
    );
  }

  const result = await callGeminiWithFallback(
    ai,
    {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: media.mime, data: base64 } },
            {
              text: `Template: ${tpl.name}
Expected per-row fields: ${perRow.map((v) => `${v.key} (${v.label})`).join(", ")}

Extract EVERY person/row visible in the document. Return an object with a "rows" array; each item contains the listed fields. If a field is not visible for a given row, return an empty string for it.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: buildResponseSchema(perRow),
        temperature: 0.1,
      },
    },
    { logPrefix: "[extract-rows]" }
  );

  if (!result.ok || !result.response) {
    return NextResponse.json(
      {
        ok: false,
        error: result.overloaded ? "gemini_overloaded" : result.errorMessage ?? "gemini_call_failed",
        message: result.overloaded
          ? GEMINI_OVERLOAD_MESSAGE
          : "Erreur lors de l'analyse du document. Réessayez.",
      },
      { status: result.overloaded ? 503 : 502 }
    );
  }
  const resp = result.response;

  const text = resp.text;
  if (!text) {
    return NextResponse.json({ ok: false, error: "gemini_empty_response" }, { status: 502 });
  }

  let parsed: { rows?: unknown };
  try {
    parsed = JSON.parse(text) as { rows?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "gemini_invalid_json", raw: text.slice(0, 400) },
      { status: 502 }
    );
  }

  const rawRows = Array.isArray(parsed.rows) ? (parsed.rows as unknown[]) : [];
  const cleaned = rawRows.map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const v of perRow) {
      const raw = row[v.key];
      out[v.key] = typeof raw === "string" ? raw : raw === undefined || raw === null ? "" : String(raw);
    }
    return out;
  });

  return NextResponse.json({
    ok: true,
    template: { id: tpl.id, name: tpl.name },
    rows: cleaned,
    variables: perRow,
  });
}
