"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Plus, Save, Trash2, Sigma, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatDA } from "@/lib/utils";
import type { Client, InvoiceLineColumn, InvoiceLineColumnType } from "@/lib/supabase/types";

interface Row {
  id: string;
  values: Record<string, string>;
}

const ALGERIAN_PRESET: InvoiceLineColumn[] = [
  { id: "legal_basis", label: "السند القانوني", type: "text" },
  { id: "fees", label: "الأتعاب", type: "number" },
  { id: "court_fees", label: "الرسوم القضائية لإعلام العدالة", type: "number" },
  { id: "registration", label: "رسالة تسجيلية", type: "number" },
  { id: "travel", label: "مصاريف النقل", type: "number" },
  { id: "total", label: "المجموع", type: "number", isTotal: true },
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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

function rowDisplayValue(c: InvoiceLineColumn, values: Record<string, string>, columns: InvoiceLineColumn[]): string {
  if (c.isTotal) return String(computeRowTotal(columns, values));
  return values[c.id] ?? "";
}

export default function NewInvoicePage() {
  const t = useTranslations("invoices");
  const locale = useLocale();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = useState("");
  const [columns, setColumns] = useState<InvoiceLineColumn[]>(ALGERIAN_PRESET);
  const [rows, setRows] = useState<Row[]>([{ id: newId(), values: {} }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const s = createClient();
      const { data: cls } = await s.from("clients").select("*");
      setClients((cls as Client[]) ?? []);
    };
    load();
  }, []);

  const totalColumnId = useMemo(() => columns.find((c) => c.isTotal)?.id ?? null, [columns]);

  const grandTotal = useMemo(() => {
    return rows.reduce((sum, r) => sum + computeRowTotal(columns, r.values), 0);
  }, [rows, columns]);

  const addColumn = () =>
    setColumns((cs) => [...cs, { id: newId(), label: "", type: "text" }]);

  const updateColumn = (id: string, patch: Partial<InvoiceLineColumn>) =>
    setColumns((cs) =>
      cs.map((c) => {
        if (c.id !== id) {
          if (patch.isTotal === true) return { ...c, isTotal: false };
          return c;
        }
        return { ...c, ...patch };
      }),
    );

  const removeColumn = (id: string) => {
    setColumns((cs) => cs.filter((c) => c.id !== id));
    setRows((rs) =>
      rs.map((r) => {
        const { [id]: _, ...rest } = r.values;
        return { ...r, values: rest };
      }),
    );
  };

  const loadPreset = () => {
    setColumns(ALGERIAN_PRESET);
    setRows([{ id: newId(), values: {} }]);
  };

  const addRow = () => setRows((rs) => [...rs, { id: newId(), values: {} }]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const updateCell = (rowId: string, colId: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [colId]: value } } : r)));

  const save = async (status: "brouillon" | "envoyee") => {
    if (!clientId) return toast.error("Sélectionnez un client");
    const validColumns = columns.filter((c) => c.label.trim().length > 0);
    if (validColumns.length === 0) return toast.error("Ajoutez au moins une colonne");
    if (rows.length === 0) return toast.error("Ajoutez au moins une ligne");
    setSaving(true);
    const s = createClient();
    const { data: u } = await s.auth.getUser();
    const number = `F-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`;
    const { data: inv, error } = await s
      .from("invoices")
      .insert({
        number,
        client_id: clientId,
        status,
        subtotal: grandTotal,
        total: grandTotal,
        issued_at: issuedAt,
        due_at: dueAt || null,
        line_columns: validColumns,
        created_by: u.user!.id,
      })
      .select()
      .single();
    if (error || !inv) {
      setSaving(false);
      return toast.error(error?.message ?? "Erreur");
    }
    const linesPayload = rows.map((r) => {
      const rowTotal = computeRowTotal(validColumns, r.values);
      const valuesWithTotal: Record<string, string> = { ...r.values };
      if (totalColumnId) valuesWithTotal[totalColumnId] = String(rowTotal);
      const firstText = validColumns.find((c) => c.type === "text");
      return {
        invoice_id: (inv as { id: string }).id,
        description: firstText ? r.values[firstText.id] ?? "" : "",
        document_id: null,
        qty: 1,
        unit_price: rowTotal,
        values: valuesWithTotal,
      };
    });
    const { error: linesError } = await s.from("invoice_lines").insert(linesPayload);
    setSaving(false);
    if (linesError) return toast.error(linesError.message);
    toast.success("Facture enregistrée");
    router.push(`/${locale}/invoices/${(inv as { id: string }).id}`);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-display text-display-2 min-w-0 truncate">{t("new")}</h1>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save("brouillon")} disabled={saving}>
            <Save className="h-4 w-4" />
            Brouillon
          </Button>
          <Button onClick={() => save("envoyee")} disabled={saving}>
            <Save className="h-4 w-4" />
            Envoyer
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>En-tête</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <Label>{t("client")} *</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("issuedAt")}</Label>
                <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
              </div>
              <div>
                <Label>{t("dueAt")}</Label>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 gap-3">
              <div>
                <CardTitle>Colonnes du tableau</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Définissez les colonnes (saisies en arabe, le tableau s&apos;affiche en RTL).
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={loadPreset} title="Charger le modèle algérien">
                  <Wand2 className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={addColumn}>
                  <Plus className="h-4 w-4" />
                  Ajouter une colonne
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {columns.map((c) => (
                <div
                  key={c.id}
                  className="grid gap-2 md:grid-cols-[1fr_140px_160px_40px] items-end rounded-md border border-border/60 p-2"
                >
                  <div>
                    <Label className="text-[10px]">Intitulé (arabe)</Label>
                    <Input
                      value={c.label}
                      dir="rtl"
                      className="text-right"
                      onChange={(e) => updateColumn(c.id, { label: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Type</Label>
                    <Select
                      value={c.type}
                      onValueChange={(v) => updateColumn(c.id, { type: v as InvoiceLineColumnType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Texte</SelectItem>
                        <SelectItem value="number">Nombre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <input
                      id={`tot-${c.id}`}
                      type="checkbox"
                      className="h-4 w-4 accent-current"
                      checked={!!c.isTotal}
                      disabled={c.type !== "number"}
                      onChange={(e) => updateColumn(c.id, { isTotal: e.target.checked })}
                    />
                    <Label htmlFor={`tot-${c.id}`} className="text-xs flex items-center gap-1">
                      <Sigma className="h-3 w-3" /> Somme des montants
                    </Label>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeColumn(c.id)}
                    title="Supprimer la colonne"
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Lignes</CardTitle>
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-4 w-4" />
                {t("addLine")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.length === 0 || columns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune ligne. Ajoutez-en une.</p>
              ) : (
                <div className="overflow-x-auto" dir="rtl" lang="ar">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs w-10">
                          ر.ت
                        </th>
                        {columns.map((c) => (
                          <th
                            key={c.id}
                            className="text-right py-2 px-2 font-medium text-muted-foreground text-xs"
                          >
                            {c.label || "—"}
                            {c.isTotal && <Sigma className="inline ms-1 h-3 w-3 opacity-60" />}
                          </th>
                        ))}
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={r.id} className="border-b border-border/40 align-top">
                          <td className="py-2 px-2 text-center numerals-display text-muted-foreground">
                            {idx + 1}
                          </td>
                          {columns.map((c) => (
                            <td key={c.id} className="py-2 px-1">
                              {c.isTotal ? (
                                <div className="px-2 py-2 text-right font-medium numerals-display">
                                  {formatDA(computeRowTotal(columns, r.values))}
                                </div>
                              ) : (
                                <Input
                                  dir="rtl"
                                  className="text-right h-10"
                                  type={c.type === "number" ? "number" : "text"}
                                  value={r.values[c.id] ?? ""}
                                  onChange={(e) => updateCell(r.id, c.id, e.target.value)}
                                />
                              )}
                            </td>
                          ))}
                          <td className="py-2 px-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeRow(r.id)}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="sticky top-20 h-fit">
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("subtotal")}</span>
              <span className="numerals-display">{formatDA(grandTotal)}</span>
            </div>
            <div className="divider-wave opacity-40" />
            <div className="flex items-center justify-between">
              <span className="font-display text-lg">{t("total")}</span>
              <span className="font-display text-2xl">{formatDA(grandTotal)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
