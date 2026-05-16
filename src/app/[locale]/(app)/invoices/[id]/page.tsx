"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

// Arabic strings used only inside the printable facture card / table content.
const AR_CONTENT = {
  invoiceLabel: "تقدير مصاريف",
  brand: "Commitforce",
  brandSub: "مكتب محاماة",
  billTo: "العميل",
  dueAt: "تاريخ الاستحقاق",
  description: "الوصف",
  quantity: "الكمية",
  unitPrice: "سعر الوحدة",
  amount: "المبلغ",
  rowNumber: "ر.ت",
  subtotal: "المجموع الفرعي",
  total: "المجموع",
};
import { ArrowLeft, Download, Plus, Settings2, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatDA, formatDate } from "@/lib/utils";
import type {
  Invoice,
  InvoiceCustomField,
  InvoiceCustomFieldDisplay,
  InvoiceCustomFieldType,
  InvoiceLine,
  InvoiceLineColumn,
  Client,
} from "@/lib/supabase/types";

function newFieldId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatFieldValue(f: InvoiceCustomField, locale: string): string {
  if (!f.value) return "—";
  if (f.type === "number") {
    const n = Number(f.value);
    return Number.isFinite(n) ? new Intl.NumberFormat(locale).format(n) : f.value;
  }
  if (f.type === "date") {
    const d = new Date(f.value);
    return Number.isNaN(d.getTime()) ? f.value : formatDate(f.value, locale);
  }
  return f.value;
}

export default function InvoiceDetailPage() {
  const t = useTranslations("invoices");
  const tStatus = useTranslations("invoices.statuses");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [fields, setFields] = useState<InvoiceCustomField[]>([]);
  const [customizing, setCustomizing] = useState(searchParams?.get("edit") === "1");
  const [savingFields, setSavingFields] = useState(false);

  useEffect(() => {
    const load = async () => {
      const s = createClient();
      const { data: i } = await s.from("invoices").select("*").eq("id", id).single();
      const { data: ls } = await s.from("invoice_lines").select("*").eq("invoice_id", id);
      if (i) {
        const typed = i as Invoice;
        setInv(typed);
        setFields(Array.isArray(typed.custom_fields) ? typed.custom_fields : []);
        const { data: c } = await s.from("clients").select("*").eq("id", typed.client_id).single();
        setClient((c as unknown as Client) ?? null);
      }
      setLines((ls as InvoiceLine[]) ?? []);
    };
    load();
  }, [id]);

  const downloadPdf = async () => {
    if (!inv) return;
    const res = await fetch(`/api/invoices/${inv.id}/pdf`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { id: newFieldId(), label: "", value: "", type: "text", display: "block" },
    ]);
  };

  const updateField = (fid: string, patch: Partial<InvoiceCustomField>) => {
    setFields((prev) => prev.map((f) => (f.id === fid ? { ...f, ...patch } : f)));
  };

  const removeField = (fid: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fid));
  };

  const saveFields = async () => {
    if (!inv) return;
    setSavingFields(true);
    const cleaned = fields
      .map((f) => ({ ...f, label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label.length > 0);
    const { error } = await createClient()
      .from("invoices")
      .update({ custom_fields: cleaned })
      .eq("id", inv.id);
    setSavingFields(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFields(cleaned);
    setInv({ ...inv, custom_fields: cleaned });
    setCustomizing(false);
    toast.success(t("savedFields"));
  };

  if (!inv) return <div>Chargement…</div>;

  const inlineFields = fields.filter((f) => f.display === "inline");
  const blockFields = fields.filter((f) => f.display === "block");
  const tableFields = fields.filter((f) => f.display === "table");

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-display-2 truncate">Facture {inv.number}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <Badge variant="sand">{tStatus(inv.status)}</Badge>
            <span className="text-sm text-muted-foreground">{formatDate(inv.issued_at, locale)}</span>
          </div>
        </div>
        <Button
          variant={customizing ? "default" : "outline"}
          onClick={() => setCustomizing((v) => !v)}
        >
          {customizing ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
          {customizing ? t("closeCustomize") : t("customize")}
        </Button>
        <Button variant="outline" onClick={downloadPdf}>
          <Download className="h-4 w-4" />
          {t("exportPdf")}
        </Button>
      </div>

      {customizing && (
        <Card>
          <CardContent className="p-6 space-y-4">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCustomFields")}</p>
            ) : (
              <div className="space-y-3">
                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="grid gap-3 rounded-md border border-border/60 p-3 md:grid-cols-[2fr_2fr_1fr_1.2fr_auto]"
                  >
                    <div>
                      <Label htmlFor={`lbl-${f.id}`} className="text-xs">{t("fieldLabel")}</Label>
                      <Input
                        id={`lbl-${f.id}`}
                        value={f.label}
                        onChange={(e) => updateField(f.id, { label: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`val-${f.id}`} className="text-xs">{t("fieldValue")}</Label>
                      <Input
                        id={`val-${f.id}`}
                        type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                        value={f.value}
                        onChange={(e) => updateField(f.id, { value: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("fieldType")}</Label>
                      <Select
                        value={f.type}
                        onValueChange={(v) => updateField(f.id, { type: v as InvoiceCustomFieldType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">{t("typeText")}</SelectItem>
                          <SelectItem value="number">{t("typeNumber")}</SelectItem>
                          <SelectItem value="date">{t("typeDate")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t("fieldDisplay")}</Label>
                      <Select
                        value={f.display}
                        onValueChange={(v) =>
                          updateField(f.id, { display: v as InvoiceCustomFieldDisplay })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inline">{t("displayInline")}</SelectItem>
                          <SelectItem value="block">{t("displayBlock")}</SelectItem>
                          <SelectItem value="table">{t("displayTable")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => removeField(f.id)}
                        title={t("remove")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={addField}>
                <Plus className="h-4 w-4" />
                {t("addField")}
              </Button>
              <Button onClick={saveFields} disabled={savingFields}>
                <Save className="h-4 w-4" />
                {t("saveFields")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-8 md:p-12 space-y-8 bg-paper" dir="rtl" lang="ar">
          <header className="flex items-start justify-between">
            <div>
              <div className="font-display text-3xl">{AR_CONTENT.brand}</div>
              <div className="text-sm text-muted-foreground">{AR_CONTENT.brandSub}</div>
            </div>
            <div className="text-end">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{AR_CONTENT.invoiceLabel}</div>
              <div className="font-display text-2xl">{inv.number}</div>
              <div className="text-sm text-muted-foreground mt-1">{formatDate(inv.issued_at, "ar")}</div>
            </div>
          </header>

          <div className="divider-wave opacity-40" />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{AR_CONTENT.billTo}</div>
              <div className="font-medium">{client?.name ?? "—"}</div>
              {client?.address && <div className="text-sm text-muted-foreground">{client.address}</div>}
              {client?.email && <div className="text-sm text-muted-foreground">{client.email}</div>}
            </div>
            {inv.due_at && (
              <div className="md:text-end">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{AR_CONTENT.dueAt}</div>
                <div className="font-medium">{formatDate(inv.due_at, "ar")}</div>
              </div>
            )}
          </div>

          {inlineFields.length > 0 && (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {inlineFields.map((f) => (
                <div key={f.id} className="min-w-[120px]">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{f.label}</div>
                  <div className="font-medium">{formatFieldValue(f, locale)}</div>
                </div>
              ))}
            </div>
          )}

          {blockFields.length > 0 && (
            <div className="space-y-3">
              {blockFields.map((f) => (
                <div key={f.id}>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{f.label}</div>
                  <div className="font-medium">{formatFieldValue(f, locale)}</div>
                </div>
              ))}
            </div>
          )}

          {tableFields.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {tableFields.map((f) => (
                    <tr key={f.id} className="border-b border-border/40">
                      <td className="py-2 pe-4 text-muted-foreground w-1/3">{f.label}</td>
                      <td className="py-2 font-medium">{formatFieldValue(f, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {inv.line_columns && inv.line_columns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-border/60">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="border border-border/60 py-2 px-2 text-center text-xs font-medium text-muted-foreground w-10">
                      {AR_CONTENT.rowNumber}
                    </th>
                    {inv.line_columns.map((c: InvoiceLineColumn) => (
                      <th
                        key={c.id}
                        className="border border-border/60 py-2 px-2 text-right text-xs font-medium text-muted-foreground"
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={l.id}>
                      <td className="border border-border/60 py-2 px-2 text-center numerals-display">
                        {idx + 1}
                      </td>
                      {inv.line_columns.map((c: InvoiceLineColumn) => {
                        const raw = (l.values ?? {})[c.id] ?? "";
                        const display =
                          c.type === "number"
                            ? raw === ""
                              ? "—"
                              : formatDA(Number(raw))
                            : raw || "—";
                        return (
                          <td
                            key={c.id}
                            className={`border border-border/60 py-2 px-2 text-right ${
                              c.type === "number" ? "numerals-display" : ""
                            } ${c.isTotal ? "font-semibold" : ""}`}
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-start py-2 font-medium text-muted-foreground">{AR_CONTENT.description}</th>
                    <th className="text-end py-2 font-medium text-muted-foreground">{AR_CONTENT.quantity}</th>
                    <th className="text-end py-2 font-medium text-muted-foreground">{AR_CONTENT.unitPrice}</th>
                    <th className="text-end py-2 font-medium text-muted-foreground">{AR_CONTENT.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="py-3">{l.description}</td>
                      <td className="py-3 text-end numerals-display">{l.qty}</td>
                      <td className="py-3 text-end numerals-display">{formatDA(Number(l.unit_price))}</td>
                      <td className="py-3 text-end numerals-display">{formatDA(Number(l.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-start">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{AR_CONTENT.subtotal}</span>
                <span className="numerals-display">{formatDA(Number(inv.subtotal))}</span>
              </div>
              <div className="divider-wave opacity-40" />
              <div className="flex items-center justify-between">
                <span className="font-display text-lg">{AR_CONTENT.total}</span>
                <span className="font-display text-2xl">{formatDA(Number(inv.total))}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
