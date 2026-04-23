import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface BulkBody {
  template_id: string;
  client_id?: string | null;
  name_prefix?: string;
  name_field?: string;
  batch_fields: Record<string, string | number | boolean>;
  rows: Record<string, string | number | boolean>[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: BulkBody;
  try {
    body = (await request.json()) as BulkBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.template_id || !Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (body.rows.length > 200) {
    return NextResponse.json({ ok: false, error: "too_many_rows" }, { status: 413 });
  }

  const { data: tpl, error: tplErr } = await supabase
    .from("templates")
    .select("id, name")
    .eq("id", body.template_id)
    .single();
  if (tplErr || !tpl) {
    return NextResponse.json({ ok: false, error: "template_not_found" }, { status: 404 });
  }

  const prefix = body.name_prefix?.trim() || tpl.name;
  const nameField = body.name_field;

  const payload = body.rows.map((row, i) => {
    const filled_data = { ...(body.batch_fields ?? {}), ...row };
    const perRowLabel =
      nameField && typeof row[nameField] === "string" && (row[nameField] as string).trim()
        ? (row[nameField] as string).trim()
        : `#${i + 1}`;
    return {
      template_id: body.template_id,
      client_id: body.client_id ?? null,
      name: `${prefix} — ${perRowLabel}`,
      status: "valide" as const,
      filled_data,
      created_by: user.id,
    };
  });

  const { data, error } = await supabase
    .from("documents")
    .insert(payload)
    .select("id, name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    template: { id: tpl.id, name: tpl.name },
    documents: data,
  });
}
