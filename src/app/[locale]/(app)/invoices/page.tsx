"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Receipt, Archive, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-states/empty";
import { createClient } from "@/lib/supabase/client";
import { formatDA, formatDate } from "@/lib/utils";
import type { Client, Invoice } from "@/lib/supabase/types";

const STATUS_VARIANTS: Record<string, "sand" | "forest" | "terracotta"> = {
  brouillon: "sand",
  envoyee: "terracotta",
  payee: "forest",
};

export default function InvoicesPage() {
  const t = useTranslations("invoices");
  const tStatus = useTranslations("invoices.statuses");
  const tArchives = useTranslations("archives");
  const locale = useLocale();
  const [rows, setRows] = useState<(Invoice & { client?: Client })[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    const s = createClient();
    const { data: inv } = await s
      .from("invoices")
      .select("*")
      .eq("is_archived", false)
      .order("issued_at", { ascending: false });
    const { data: cls } = await s.from("clients").select("*");
    const byId = new Map((cls as Client[] | null)?.map((c) => [c.id, c]) ?? []);
    setRows(((inv as Invoice[]) ?? []).map((i) => ({ ...i, client: byId.get(i.client_id) })));
  };

  useEffect(() => {
    load();
  }, []);

  const archive = async (id: string) => {
    const { error } = await createClient()
      .from("invoices")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(tArchives("archive"));
    await load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Supprimer définitivement cette facture ? Action irréversible.")) return;
    setDeletingId(id);
    const s = createClient();
    const { error: linesErr } = await s.from("invoice_lines").delete().eq("invoice_id", id);
    if (linesErr) {
      setDeletingId(null);
      toast.error(linesErr.message);
      return;
    }
    const { error } = await s.from("invoices").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Facture supprimée");
    await load();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">Facturation</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href={`/${locale}/invoices/new`}>
            <Plus className="h-4 w-4" />
            {t("new")}
          </Link>
        </Button>
      </header>

      {rows === null ? (
        <div className="text-muted-foreground">Chargement…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Aucune facture"
          description="Créez votre première facture pour commencer à suivre vos encaissements."
          action={
            <Button asChild>
              <Link href={`/${locale}/invoices/new`}>
                <Plus className="h-4 w-4" />
                {t("new")}
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("number")}</TableHead>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("issuedAt")}</TableHead>
                  <TableHead className="text-end">{t("total")}</TableHead>
                  <TableHead className="text-end"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/${locale}/invoices/${i.id}`} className="font-medium hover:text-primary">
                        {i.number}
                      </Link>
                    </TableCell>
                    <TableCell>{i.client?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[i.status]}>{tStatus(i.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(i.issued_at, locale)}</TableCell>
                    <TableCell className="text-end numerals-display">{formatDA(Number(i.total))}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" title="Voir">
                          <Link href={`/${locale}/invoices/${i.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" title="Modifier">
                          <Link href={`/${locale}/invoices/${i.id}?edit=1`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => archive(i.id)}
                          title={tArchives("archive")}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(i.id)}
                          disabled={deletingId === i.id}
                          title="Supprimer"
                          className="text-destructive hover:bg-destructive/10"
                        >
                          {deletingId === i.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
