"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatDA } from "@/lib/utils";
import type { Client, Document } from "@/lib/supabase/types";

interface Line {
  id: string;
  description: string;
  document_id: string | null;
  qty: number;
  unit_price: number;
}

export default function NewInvoicePage() {
  const t = useTranslations("invoices");
  const locale = useLocale();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = useState("");
  const [lines, setLines] = useState<Line[]>([{ id: crypto.randomUUID(), description: "", document_id: null, qty: 1, unit_price: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const s = createClient();
      const [{ data: cls }, { data: ds }] = await Promise.all([
        s.from("clients").select("*"),
        s.from("documents").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      setClients((cls as Client[]) ?? []);
      setDocs((ds as Document[]) ?? []);
    };
    load();
  }, []);

  const total = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unit_price, 0), [lines]);

  const addLine = () => setLines((l) => [...l, { id: crypto.randomUUID(), description: "", document_id: null, qty: 1, unit_price: 0 }]);
  const removeLine = (id: string) => setLines((l) => l.filter((x) => x.id !== id));
  const update = (id: string, patch: Partial<Line>) => setLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const save = async (status: "brouillon" | "envoyee") => {
    if (!clientId) return toast.error("Sélectionnez un client");
    if (lines.length === 0) return toast.error("Ajoutez au moins une ligne");
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
        subtotal: total,
        total,
        issued_at: issuedAt,
        due_at: dueAt || null,
        created_by: u.user!.id,
      })
      .select()
      .single();
    if (error || !inv) {
      setSaving(false);
      return toast.error(error?.message ?? "Erreur");
    }
    const linesPayload = lines.map((l) => ({
      invoice_id: (inv as any).id,
      description: l.description,
      document_id: l.document_id,
      qty: l.qty,
      unit_price: l.unit_price,
    }));
    await s.from("invoice_lines").insert(linesPayload);
    toast.success("Facture enregistrée");
    router.push(`/${locale}/invoices/${(inv as any).id}`);
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
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Lignes</CardTitle>
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4" />
                {t("addLine")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.map((l) => (
                <div key={l.id} className="grid gap-2 md:grid-cols-[1fr_140px_80px_110px_40px] items-end">
                  <div>
                    <Label className="text-[10px]">{t("description")}</Label>
                    <Input value={l.description} onChange={(e) => update(l.id, { description: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("linkDocument")}</Label>
                    <Select value={l.document_id ?? "none"} onValueChange={(v) => update(l.id, { document_id: v === "none" ? null : v })}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {docs.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("quantity")}</Label>
                    <Input type="number" value={l.qty} onChange={(e) => update(l.id, { qty: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("unitPrice")}</Label>
                    <Input type="number" value={l.unit_price} onChange={(e) => update(l.id, { unit_price: Number(e.target.value) })} />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeLine(l.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
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
              <span className="numerals-display">{formatDA(total)}</span>
            </div>
            <div className="divider-wave opacity-40" />
            <div className="flex items-center justify-between">
              <span className="font-display text-lg">{t("total")}</span>
              <span className="font-display text-2xl">{formatDA(total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
