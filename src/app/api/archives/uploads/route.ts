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

function extFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "bin";
  return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const rawTemplateId = form.get("template_id");
  const rawBatchId = form.get("batch_id");
  const rawName = form.get("name");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const templateId =
    typeof rawTemplateId === "string" && rawTemplateId.trim() ? rawTemplateId.trim() : null;
  const batchId =
    typeof rawBatchId === "string" && rawBatchId.trim() ? rawBatchId.trim() : null;
  if (batchId && !UUID_RE.test(batchId)) {
    return NextResponse.json({ ok: false, error: "invalid_batch_id" }, { status: 400 });
  }

  const media = mediaTypeFor(file);
  if (!media) {
    return NextResponse.json({ ok: false, error: "unsupported_media_type" }, { status: 415 });
  }

  let tpl: { id: string; name: string } | null = null;
  let varList: Var[] = [];
  if (templateId) {
    const { data: tplRow } = await supabase
      .from("templates")
      .select("id, name")
      .eq("id", templateId)
      .single();
    if (!tplRow) {
      return NextResponse.json({ ok: false, error: "template_not_found" }, { status: 404 });
    }
    tpl = tplRow as { id: string; name: string };

    const { data: varRows } = await supabase
      .from("template_variables")
      .select("id, key, label, type")
      .eq("template_id", templateId)
      .order("order_index", { ascending: true });
    varList = (varRows ?? []) as Var[];
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let extracted: Record<string, string> = {};

  if (tpl && varList.length > 0) {
    let ai;
    try {
      ai = getGeminiClient();
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "no_api_key" },
        { status: 500 },
      );
    }

    const base64 = buf.toString("base64");
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
      { logPrefix: "[archives-upload]" },
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
        { status: result.overloaded ? 503 : 502 },
      );
    }

    const text = result.response.text;
    if (!text) {
      return NextResponse.json({ ok: false, error: "gemini_empty_response" }, { status: 502 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "gemini_invalid_json", raw: text.slice(0, 400) },
        { status: 502 },
      );
    }

    for (const v of varList) {
      const raw = parsed[v.key];
      extracted[v.key] =
        typeof raw === "string" ? raw : raw === undefined || raw === null ? "" : String(raw);
    }
  }

  const ext = extFromName(file.name);
  const filePath = `${user.id}/archives/${crypto.randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("document-imports")
    .upload(filePath, buf, { contentType: media.mime, upsert: false });
  if (uploadErr) {
    return NextResponse.json(
      { ok: false, error: "storage_upload_failed", message: uploadErr.message },
      { status: 500 },
    );
  }

  const archiveName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : file.name;

  const { data: inserted, error: insertErr } = await supabase
    .from("archived_uploads")
    .insert({
      template_id: tpl?.id ?? null,
      name: archiveName,
      file_path: filePath,
      file_name: file.name,
      file_mime_type: media.mime,
      file_size: file.size,
      extracted_data: extracted,
      batch_id: batchId,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    await supabase.storage.from("document-imports").remove([filePath]);
    return NextResponse.json(
      { ok: false, error: "insert_failed", message: insertErr?.message ?? "unknown" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    upload: inserted,
    template: tpl ? { id: tpl.id, name: tpl.name } : null,
    variables: varList,
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data: row, error } = await supabase
    .from("archived_uploads")
    .select("file_path, file_name")
    .eq("id", id)
    .single();
  if (error || !row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("document-imports")
    .createSignedUrl(row.file_path, 60 * 10, { download: row.file_name });
  if (signErr || !signed) {
    return NextResponse.json(
      { ok: false, error: "sign_failed", message: signErr?.message },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const batchId = url.searchParams.get("batch_id");

  if (batchId) {
    if (!UUID_RE.test(batchId)) {
      return NextResponse.json({ ok: false, error: "invalid_batch_id" }, { status: 400 });
    }

    const { data: rows } = await supabase
      .from("archived_uploads")
      .select("id, file_path")
      .eq("batch_id", batchId);

    const targetRows = (rows as { id: string; file_path: string }[] | null) ?? [];
    if (targetRows.length === 0) {
      return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 403 });
    }

    const { error: delErr, data: deleted } = await supabase
      .from("archived_uploads")
      .delete()
      .eq("batch_id", batchId)
      .select("id");
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 403 });
    }

    const paths = targetRows.map((r) => r.file_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("document-imports").remove(paths);
    }

    return NextResponse.json({ ok: true, deleted: deleted.length });
  }

  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data: row } = await supabase
    .from("archived_uploads")
    .select("file_path")
    .eq("id", id)
    .single();

  const { error: delErr, data: deleted } = await supabase
    .from("archived_uploads")
    .delete()
    .eq("id", id)
    .select("id");
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 403 });
  }

  if (row?.file_path) {
    await supabase.storage.from("document-imports").remove([row.file_path]);
  }

  return NextResponse.json({ ok: true });
}
