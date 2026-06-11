import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdf } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const maxDuration = 60;

// Renders an unsaved document (filled template body) to a PDF using the exact
// same pipeline as the saved-document routes (renderHtmlToPdf adds the compact
// letterhead, A4 sizing, 11pt body, and page footer). Used by the create page
// so its print/download output matches every other document.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: { html?: string; title?: string; fileNumber?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const html = typeof body.html === "string" ? body.html : "";
  if (!html.trim()) {
    return NextResponse.json({ ok: false, error: "empty_html" }, { status: 400 });
  }

  const pdf = await renderHtmlToPdf(html, {
    title: body.title || "Document",
    fileNumber: body.fileNumber ?? null,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="apercu.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
