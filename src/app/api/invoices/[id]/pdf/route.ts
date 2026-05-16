import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import type {
  Invoice,
  InvoiceCustomField,
  InvoiceLine,
  InvoiceLineColumn,
  Client,
} from "@/lib/supabase/types";

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDA(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(n)} د.ج`;
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("ar-DZ", { day: "2-digit", month: "long", year: "numeric" });
}

function formatCustomFieldValue(f: InvoiceCustomField): string {
  if (!f.value) return "—";
  if (f.type === "number") {
    const n = Number(f.value);
    return Number.isFinite(n) ? new Intl.NumberFormat("fr-FR").format(n) : f.value;
  }
  if (f.type === "date") return fmtDate(f.value);
  return f.value;
}

function renderCustomFields(fields: InvoiceCustomField[]): string {
  if (fields.length === 0) return "";
  const inline = fields.filter((f) => f.display === "inline");
  const block = fields.filter((f) => f.display === "block");
  const table = fields.filter((f) => f.display === "table");

  let out = "";
  if (inline.length) {
    out += `<div style="display:flex;flex-wrap:wrap;gap:14px 28px;margin:10px 0;">`;
    for (const f of inline) {
      out += `<div style="min-width:120px;"><div style="font-size:8pt;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;">${esc(f.label)}</div><div style="font-size:11pt;">${esc(formatCustomFieldValue(f))}</div></div>`;
    }
    out += `</div>`;
  }
  if (block.length) {
    out += `<div style="margin:10px 0;">`;
    for (const f of block) {
      out += `<div style="margin-bottom:6px;"><div style="font-size:8pt;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;">${esc(f.label)}</div><div>${esc(formatCustomFieldValue(f))}</div></div>`;
    }
    out += `</div>`;
  }
  if (table.length) {
    out += `<table style="width:100%;border-collapse:collapse;margin:8px 0;"><tbody>`;
    for (const f of table) {
      out += `<tr><td style="padding:4px 6px;color:#6b6b6b;border-bottom:1px solid #e2d6b8;width:35%;">${esc(f.label)}</td><td style="padding:4px 6px;border-bottom:1px solid #e2d6b8;">${esc(formatCustomFieldValue(f))}</td></tr>`;
    }
    out += `</tbody></table>`;
  }
  return out;
}

function computeRowTotal(columns: InvoiceLineColumn[], values: Record<string, string>): number {
  let total = 0;
  for (const c of columns) {
    if (c.type !== "number" || c.isTotal) continue;
    const n = Number(values[c.id]);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function renderDynamicLinesTable(columns: InvoiceLineColumn[], lines: InvoiceLine[]): string {
  const headers = columns
    .map(
      (c) =>
        `<th style="border:1px solid #c6b89c;padding:6px 8px;background:#f5efde;font-size:10pt;font-weight:700;text-align:center;">${esc(c.label)}</th>`,
    )
    .join("");
  const rnHeader = `<th style="border:1px solid #c6b89c;padding:6px 8px;background:#f5efde;font-size:10pt;font-weight:700;text-align:center;width:36px;">ر.ت</th>`;

  const body = lines
    .map((l, idx) => {
      const v = (l.values ?? {}) as Record<string, string>;
      const cells = columns
        .map((c) => {
          let display: string;
          if (c.isTotal) {
            display = fmtDA(computeRowTotal(columns, v));
          } else if (c.type === "number") {
            const raw = v[c.id];
            display = raw === undefined || raw === "" ? "—" : fmtDA(Number(raw));
          } else {
            display = esc(v[c.id] ?? "—");
          }
          const weight = c.isTotal ? "font-weight:700;" : "";
          const align = c.type === "number" ? "text-align:center;" : "text-align:right;";
          return `<td style="border:1px solid #c6b89c;padding:6px 8px;font-size:10pt;${align}${weight}">${display}</td>`;
        })
        .join("");
      return `<tr><td style="border:1px solid #c6b89c;padding:6px 8px;text-align:center;font-size:10pt;">${idx + 1}</td>${cells}</tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;margin:10px 0;"><thead><tr>${rnHeader}${headers}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderLegacyLinesTable(lines: InvoiceLine[]): string {
  const head = `<tr>
    <th style="border:1px solid #c6b89c;padding:6px 8px;background:#f5efde;font-weight:700;">الوصف</th>
    <th style="border:1px solid #c6b89c;padding:6px 8px;background:#f5efde;font-weight:700;text-align:center;width:60px;">الكمية</th>
    <th style="border:1px solid #c6b89c;padding:6px 8px;background:#f5efde;font-weight:700;text-align:center;width:110px;">سعر الوحدة</th>
    <th style="border:1px solid #c6b89c;padding:6px 8px;background:#f5efde;font-weight:700;text-align:center;width:120px;">المبلغ</th>
  </tr>`;
  const body = lines
    .map(
      (l) => `<tr>
      <td style="border:1px solid #c6b89c;padding:6px 8px;text-align:right;">${esc(l.description)}</td>
      <td style="border:1px solid #c6b89c;padding:6px 8px;text-align:center;">${l.qty}</td>
      <td style="border:1px solid #c6b89c;padding:6px 8px;text-align:center;">${fmtDA(Number(l.unit_price))}</td>
      <td style="border:1px solid #c6b89c;padding:6px 8px;text-align:center;">${fmtDA(Number(l.amount))}</td>
    </tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:10px 0;"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const { data: lines } = await supabase.from("invoice_lines").select("*").eq("invoice_id", id);
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", (inv as Invoice).client_id)
    .single();

  const invoice = inv as Invoice;
  const linesArr = (lines as InvoiceLine[]) ?? [];
  const clientRow = (client as Client) ?? null;

  const customFields: InvoiceCustomField[] = Array.isArray(invoice.custom_fields) ? invoice.custom_fields : [];
  const columns: InvoiceLineColumn[] = Array.isArray(invoice.line_columns) ? invoice.line_columns : [];

  const linesTable =
    columns.length > 0 ? renderDynamicLinesTable(columns, linesArr) : renderLegacyLinesTable(linesArr);

  const body = `
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:18pt;font-weight:700;">تقدير مصاريف</div>
      <div style="font-size:11pt;color:#6b6b6b;margin-top:4px;">رقم الفاتورة: ${esc(invoice.number)} — ${fmtDate(invoice.issued_at)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
      <tr>
        <td style="vertical-align:top;padding:6px 0;width:50%;">
          <div style="font-size:9pt;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;">العميل</div>
          <div style="font-size:12pt;font-weight:700;">${esc(clientRow?.name ?? "—")}</div>
          ${clientRow?.address ? `<div style="font-size:10pt;color:#555;">${esc(clientRow.address)}</div>` : ""}
          ${clientRow?.email ? `<div style="font-size:10pt;color:#555;">${esc(clientRow.email)}</div>` : ""}
        </td>
        ${
          invoice.due_at
            ? `<td style="vertical-align:top;padding:6px 0;width:50%;text-align:left;">
                <div style="font-size:9pt;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;">تاريخ الاستحقاق</div>
                <div style="font-size:12pt;font-weight:700;">${fmtDate(invoice.due_at)}</div>
              </td>`
            : ""
        }
      </tr>
    </table>

    ${renderCustomFields(customFields)}

    ${linesTable}

    <table style="width:100%;border-collapse:collapse;margin-top:14px;">
      <tr>
        <td style="width:60%;"></td>
        <td style="border:1px solid #c6b89c;padding:8px 10px;background:#f5efde;font-weight:700;font-size:11pt;">المجموع الإجمالي</td>
        <td style="border:1px solid #c6b89c;padding:8px 10px;text-align:center;font-weight:700;font-size:12pt;">${fmtDA(Number(invoice.total))}</td>
      </tr>
    </table>
  `;

  const pdf = await renderHtmlToPdf(body, {
    title: `Facture ${invoice.number}`,
    rtl: true,
    fontFamily: "'Noto Naskh Arabic', 'Amiri', Georgia, serif",
  });

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
    },
  });
}
