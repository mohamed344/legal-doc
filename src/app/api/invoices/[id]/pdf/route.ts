import { NextResponse } from "next/server";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceCustomField } from "@/lib/supabase/types";

const styles = StyleSheet.create({
  page: { fontSize: 10, padding: 40, fontFamily: "Helvetica", color: "#2A2A2A" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  brand: { fontSize: 24, fontFamily: "Times-Roman", color: "#2E5A3F" },
  brandSub: { fontSize: 9, color: "#6B6B6B", marginTop: 2 },
  invoiceLabel: { fontSize: 9, color: "#6B6B6B", textAlign: "right", textTransform: "uppercase", letterSpacing: 1 },
  invoiceNumber: { fontSize: 18, fontFamily: "Times-Roman", textAlign: "right", marginTop: 2 },
  divider: { borderBottom: "1px solid #C6B89C", marginVertical: 16 },
  billTo: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  label: { fontSize: 8, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  thead: { flexDirection: "row", borderBottom: "1px solid #C6B89C", paddingBottom: 6, marginBottom: 6 },
  th: { fontSize: 8, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: 1 },
  tr: { flexDirection: "row", borderBottom: "0.5px solid #E2D6B8", paddingVertical: 8 },
  td: { fontSize: 10 },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 20 },
  totalBox: { width: 220 },
  totalLabel: { fontSize: 13, fontFamily: "Times-Roman" },
  totalValue: { fontSize: 18, fontFamily: "Times-Roman", textAlign: "right" },
  inlineWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
  inlineCell: { marginRight: 24, marginBottom: 8, minWidth: 110 },
  blockWrap: { marginBottom: 14 },
  blockItem: { marginBottom: 8 },
  fieldValue: { fontSize: 10 },
  kvRow: { flexDirection: "row", borderBottom: "0.5px solid #E2D6B8", paddingVertical: 6 },
  kvKey: { flex: 1, color: "#6B6B6B" },
  kvVal: { flex: 2 },
});

function formatCustomFieldValue(f: InvoiceCustomField): string {
  if (!f.value) return "—";
  if (f.type === "number") {
    const n = Number(f.value);
    return Number.isFinite(n) ? new Intl.NumberFormat("fr-FR").format(n) : f.value;
  }
  if (f.type === "date") {
    const d = new Date(f.value);
    return Number.isNaN(d.getTime())
      ? f.value
      : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }
  return f.value;
}

function formatDA(amount: number) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} DA`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const { data: lines } = await supabase.from("invoice_lines").select("*").eq("invoice_id", id);
  const { data: client } = await supabase.from("clients").select("*").eq("id", (inv as any).client_id).single();

  const customFields: InvoiceCustomField[] = Array.isArray((inv as any).custom_fields)
    ? ((inv as any).custom_fields as InvoiceCustomField[])
    : [];
  const inlineFields = customFields.filter((f) => f.display === "inline");
  const blockFields = customFields.filter((f) => f.display === "block");
  const tableFields = customFields.filter((f) => f.display === "table");

  const inlineNode =
    inlineFields.length > 0
      ? React.createElement(
          View,
          { style: styles.inlineWrap },
          ...inlineFields.map((f) =>
            React.createElement(
              View,
              { key: f.id, style: styles.inlineCell },
              React.createElement(Text, { style: styles.label }, f.label),
              React.createElement(Text, { style: styles.fieldValue }, formatCustomFieldValue(f))
            )
          )
        )
      : null;

  const blockNode =
    blockFields.length > 0
      ? React.createElement(
          View,
          { style: styles.blockWrap },
          ...blockFields.map((f) =>
            React.createElement(
              View,
              { key: f.id, style: styles.blockItem },
              React.createElement(Text, { style: styles.label }, f.label),
              React.createElement(Text, { style: styles.fieldValue }, formatCustomFieldValue(f))
            )
          )
        )
      : null;

  const tableNode =
    tableFields.length > 0
      ? React.createElement(
          View,
          { style: { marginBottom: 14 } },
          ...tableFields.map((f) =>
            React.createElement(
              View,
              { key: f.id, style: styles.kvRow },
              React.createElement(Text, { style: styles.kvKey }, f.label),
              React.createElement(Text, { style: styles.kvVal }, formatCustomFieldValue(f))
            )
          )
        )
      : null;

  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.headerRow },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.brand }, "Commitforce"),
          React.createElement(Text, { style: styles.brandSub }, "Cabinet d'avocats")
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.invoiceLabel }, "Facture"),
          React.createElement(Text, { style: styles.invoiceNumber }, (inv as any).number),
          React.createElement(Text, { style: styles.brandSub }, formatDate((inv as any).issued_at))
        )
      ),
      React.createElement(View, { style: styles.divider }),
      React.createElement(
        View,
        { style: styles.billTo },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.label }, "Facturé à"),
          React.createElement(Text, null, (client as any)?.name ?? "—"),
          React.createElement(Text, { style: styles.brandSub }, (client as any)?.address ?? ""),
          React.createElement(Text, { style: styles.brandSub }, (client as any)?.email ?? "")
        )
      ),
      inlineNode,
      blockNode,
      tableNode,
      React.createElement(
        View,
        { style: styles.thead },
        React.createElement(Text, { style: [styles.th, { flex: 3 }] }, "Description"),
        React.createElement(Text, { style: [styles.th, { flex: 1, textAlign: "right" }] }, "Qté"),
        React.createElement(Text, { style: [styles.th, { flex: 1, textAlign: "right" }] }, "P.U."),
        React.createElement(Text, { style: [styles.th, { flex: 1, textAlign: "right" }] }, "Montant")
      ),
      ...(lines ?? []).map((l: any) =>
        React.createElement(
          View,
          { style: styles.tr, key: l.id },
          React.createElement(Text, { style: [styles.td, { flex: 3 }] }, l.description),
          React.createElement(Text, { style: [styles.td, { flex: 1, textAlign: "right" }] }, String(l.qty)),
          React.createElement(Text, { style: [styles.td, { flex: 1, textAlign: "right" }] }, formatDA(Number(l.unit_price))),
          React.createElement(Text, { style: [styles.td, { flex: 1, textAlign: "right" }] }, formatDA(Number(l.amount)))
        )
      ),
      React.createElement(
        View,
        { style: styles.totalRow },
        React.createElement(
          View,
          { style: styles.totalBox },
          React.createElement(
            View,
            { style: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 } },
            React.createElement(Text, { style: styles.totalLabel }, "Total"),
            React.createElement(Text, { style: styles.totalValue }, formatDA(Number((inv as any).total)))
          )
        )
      )
    )
  );

  const buffer = await renderToBuffer(doc);
  return new NextResponse(buffer as any, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${(inv as any).number}.pdf"` },
  });
}
