import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { fillTemplate } from "@/lib/render-document";
import type { Document, Template, TemplateVariable } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_CONCURRENCY = 3;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "no_ids" }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ ok: false, error: "too_many_ids" }, { status: 413 });
  }

  const { data: docs, error: docErr } = await supabase
    .from("documents")
    .select("*")
    .in("id", ids);
  if (docErr || !docs || docs.length === 0) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const tplIds = [...new Set(docs.map((d) => d.template_id))];
  const { data: tpls } = await supabase.from("templates").select("*").in("id", tplIds);
  const { data: vars } = await supabase
    .from("template_variables")
    .select("*")
    .in("template_id", tplIds);

  const tplById = new Map<string, Template>((tpls ?? []).map((t: Template) => [t.id, t]));
  const varsByTpl = new Map<string, TemplateVariable[]>();
  for (const v of (vars ?? []) as TemplateVariable[]) {
    const arr = varsByTpl.get(v.template_id) ?? [];
    arr.push(v);
    varsByTpl.set(v.template_id, arr);
  }

  const zip = new JSZip();
  const used = new Set<string>();

  const work = docs.map((doc: Document) => async () => {
    const tpl = tplById.get(doc.template_id);
    const tplVars = (varsByTpl.get(doc.template_id) ?? []).sort(
      (a, b) => a.order_index - b.order_index
    );
    const html = fillTemplate(tpl?.body_html ?? null, tplVars, doc.filled_data);
    const pdf = await renderHtmlToPdf(html, { title: doc.name });
    let filename = `${sanitize(doc.name)}.pdf`;
    let n = 2;
    while (used.has(filename)) {
      filename = `${sanitize(doc.name)} (${n}).pdf`;
      n += 1;
    }
    used.add(filename);
    zip.file(filename, pdf);
  });

  await runWithConcurrency(work, MAX_CONCURRENCY);

  const buffer = await zip.generateAsync({ type: "uint8array" });
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="documents-${Date.now()}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}

async function runWithConcurrency(tasks: (() => Promise<void>)[], limit: number) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const mine = i++;
      await tasks[mine]();
    }
  });
  await Promise.all(workers);
}

function sanitize(s: string): string {
  return s.replace(/[^\p{L}\p{N}_\- .]/gu, "_").slice(0, 120) || "document";
}
