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

type Var = {
  id: string;
  key: string;
  label: string;
  type: "text" | "date" | "number" | "select" | "checkbox";
};

function buildResponseSchema(vars: Var[]) {
  const properties: Record<string, { type: typeof Type.STRING; description: string }> = {};
  for (const v of vars) {
    properties[v.key] = { type: Type.STRING, description: v.label };
  }
  return {
    type: Type.OBJECT,
    properties,
    required: vars.map((v) => v.key),
    propertyOrdering: vars.map((v) => v.key),
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

  const { data: tpl } = await supabase
    .from("templates")
    .select("id, name")
    .eq("id", templateId)
    .single();
  if (!tpl) {
    return NextResponse.json({ ok: false, error: "template_not_found" }, { status: 404 });
  }

  const { data: vars } = await supabase
    .from("template_variables")
    .select("id, key, label, type")
    .eq("template_id", templateId)
    .order("order_index", { ascending: true });

  const varList = (vars ?? []) as Var[];
  if (varList.length === 0) {
    return NextResponse.json({
      ok: true,
      template: { id: tpl.id, name: tpl.name },
      values: {},
      variables: [],
    });
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
Fields: ${varList.map((v) => `${v.key} (${v.label}, type=${v.type})`).join(", ")}

Extract the single set of values for this template from the uploaded document. If a field is not visible, return an empty string for it.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: buildResponseSchema(varList),
        temperature: 0.1,
      },
    },
    { logPrefix: "[extract-fields]" }
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

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "gemini_invalid_json", raw: text.slice(0, 400) },
      { status: 502 }
    );
  }

  const values: Record<string, string> = {};
  for (const v of varList) {
    const raw = parsed[v.key];
    values[v.key] =
      typeof raw === "string" ? raw : raw === undefined || raw === null ? "" : String(raw);
  }

  return NextResponse.json({
    ok: true,
    template: { id: tpl.id, name: tpl.name },
    values,
    variables: varList,
  });
}
