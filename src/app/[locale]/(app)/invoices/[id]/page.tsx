"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatDA, formatDate } from "@/lib/utils";
import type { Invoice, InvoiceLine, Client } from "@/lib/supabase/types";

export default function InvoiceDetailPage() {
  const t = useTranslations("invoices");
  const tStatus = useTranslations("invoices.statuses");
  const locale = useLocale();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    const load = async () => {
      const s = createClient();
      const { data: i } = await s.from("invoices").select("*").eq("id", id).single();
      const { data: ls } = await s.from("invoice_lines").select("*").eq("invoice_id", id);
      if (i) {
        setInv(i as Invoice);
        const { data: c } = await s.from("clients").select("*").eq("id", (i as Invoice).client_id).single();
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

  if (!inv) return <div>Chargement…</div>;

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
        <Button variant="outline" onClick={downloadPdf}>
          <Download className="h-4 w-4" />
          {t("exportPdf")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-8 md:p-12 space-y-8 bg-paper">
          <header className="flex items-start justify-between">
            <div>
              <div className="font-display text-3xl">Commitforce</div>
              <div className="text-sm text-muted-foreground">Cabinet d'avocats</div>
            </div>
            <div className="text-end">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Facture</div>
              <div className="font-display text-2xl">{inv.number}</div>
              <div className="text-sm text-muted-foreground mt-1">{formatDate(inv.issued_at, locale)}</div>
            </div>
          </header>

          <div className="divider-wave opacity-40" />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Facturé à</div>
              <div className="font-medium">{client?.name ?? "—"}</div>
              {client?.address && <div className="text-sm text-muted-foreground">{client.address}</div>}
              {client?.email && <div className="text-sm text-muted-foreground">{client.email}</div>}
            </div>
            {inv.due_at && (
              <div className="md:text-end">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("dueAt")}</div>
                <div className="font-medium">{formatDate(inv.due_at, locale)}</div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-start py-2 font-medium text-muted-foreground">{t("description")}</th>
                  <th className="text-end py-2 font-medium text-muted-foreground">{t("quantity")}</th>
                  <th className="text-end py-2 font-medium text-muted-foreground">{t("unitPrice")}</th>
                  <th className="text-end py-2 font-medium text-muted-foreground">{t("amount")}</th>
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

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("subtotal")}</span>
                <span className="numerals-display">{formatDA(Number(inv.subtotal))}</span>
              </div>
              <div className="divider-wave opacity-40" />
              <div className="flex items-center justify-between">
                <span className="font-display text-lg">{t("total")}</span>
                <span className="font-display text-2xl">{formatDA(Number(inv.total))}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
