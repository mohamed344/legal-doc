import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { fillTemplate } from "@/lib/render-document";
import type { Document, Template, TemplateVariable } from "@/lib/supabase/types";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single<Document>();
  if (docErr || !doc) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: tpl } = await supabase
    .from("templates")
    .select("*")
    .eq("id", doc.template_id)
    .single<Template>();

  const { data: vars } = await supabase
    .from("template_variables")
    .select("*")
    .eq("template_id", doc.template_id)
    .order("order_index", { ascending: true });

  const filled = fillTemplate(
    tpl?.body_html ?? null,
    (vars ?? []) as TemplateVariable[],
    doc.filled_data
  );

  const pdf = await renderHtmlToPdf(filled, { title: doc.name });

  const safeName = sanitize(doc.name);
  const asciiFallback = toAscii(safeName);

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${asciiFallback}.pdf"; filename*=UTF-8''${encodeURIComponent(safeName)}.pdf`,
      "cache-control": "private, no-store",
    },
  });
}

function sanitize(s: string): string {
  return s.replace(/[^\p{L}\p{N}_\- .]/gu, "_").slice(0, 120) || "document";
}

function toAscii(s: string): string {
  const stripped = s.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_").trim();
  return stripped || "document";
}
