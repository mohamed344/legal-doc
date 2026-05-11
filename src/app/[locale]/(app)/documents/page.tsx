"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FolderOpen, FileText, Archive, Wand2, Pencil, Download, Eye, Loader2, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-states/empty";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Document, Template, TemplateVariable } from "@/lib/supabase/types";

const STATUS_VARIANTS: Record<string, "forest" | "sand" | "terracotta"> = {
  brouillon: "sand",
  valide: "forest",
  facture: "terracotta",
};

const OWNER_KEYS = [
  "هيلع_يعدملا_مسا",
  "اسم_المدعى_عليه",
  "اسم_المدعي_عليه",
  "defendant_name",
  "nom_defendeur",
  "requestor_name",
  "defendant_company",
  "requestor_company",
  "rental_tenant",
  "nom_client",
  "client_name",
  "full_name",
  "nom_complet",
  "nom",
  "name",
];

const NAME_PATTERN = /name|nom\b|اسم|client|requestor|demandeur|tenant|locataire|plaintiff|مدعي|مالك|propri[eé]taire/i;

function resolveOwner(doc: Document, vars: TemplateVariable[]): string {
  const data = (doc.filled_data ?? {}) as Record<string, unknown>;
  const get = (k: string) => {
    const v = data[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  // 1. preferred exact keys
  for (const k of OWNER_KEYS) {
    const hit = get(k);
    if (hit) return hit;
  }

  // 2. variables whose key or label looks like a name field
  for (const v of vars) {
    if (v.type !== "text") continue;
    if (!NAME_PATTERN.test(v.key) && !NAME_PATTERN.test(v.label)) continue;
    const hit = get(v.key);
    if (hit) return hit;
  }

  // 3. filled_data entries whose key itself looks like a name field
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (NAME_PATTERN.test(k)) return v.trim();
  }

  // 4. fallback: first non-empty text variable in declared order
  for (const v of vars) {
    if (v.type !== "text") continue;
    const hit = get(v.key);
    if (hit) return hit;
  }

  // 5. last resort: first non-empty string in filled_data
  for (const v of Object.values(data)) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  return "—";
}

export default function DocumentsPage() {
  const t = useTranslations("documents");
  const tStatus = useTranslations("documents.status");
  const tActions = useTranslations("documents.actions");
  const tArchives = useTranslations("archives");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client");
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [tplById, setTplById] = useState<Record<string, Template>>({});
  const [varsByTpl, setVarsByTpl] = useState<Record<string, TemplateVariable[]>>({});
  const [clientName, setClientName] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    const supabase = createClient();
    let q = supabase
      .from("documents")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    const { data: docsData } = await q;
    const docRows = (docsData as Document[]) ?? [];
    setDocs(docRows);

    if (clientId) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .maybeSingle();
      setClientName((clientRow as { name: string } | null)?.name ?? null);
    } else {
      setClientName(null);
    }

    const tplIds = Array.from(new Set(docRows.map((d) => d.template_id)));
    if (tplIds.length) {
      const [{ data: tpls }, { data: vars }] = await Promise.all([
        supabase.from("templates").select("*").in("id", tplIds),
        supabase
          .from("template_variables")
          .select("*")
          .in("template_id", tplIds)
          .order("order_index", { ascending: true }),
      ]);
      setTplById(
        Object.fromEntries(((tpls as Template[]) ?? []).map((tpl) => [tpl.id, tpl])),
      );
      const grouped: Record<string, TemplateVariable[]> = {};
      for (const v of ((vars as TemplateVariable[]) ?? [])) {
        (grouped[v.template_id] ??= []).push(v);
      }
      setVarsByTpl(grouped);
    } else {
      setTplById({});
      setVarsByTpl({});
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const filteredDocs = useMemo(() => {
    if (!docs) return null;
    const q = nameQuery.trim().toLowerCase();
    return docs.filter((d) => {
      if (modelFilter !== "all" && d.template_id !== modelFilter) return false;
      if (q && !d.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, nameQuery, modelFilter]);

  const archive = async (id: string) => {
    if (!window.confirm(tArchives("confirmArchive"))) return;
    setArchivingId(id);
    const { data, error } = await createClient()
      .from("documents")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    setArchivingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error(tArchives("archiveDenied"));
      return;
    }
    toast.success(tArchives("archive"));
    await load();
  };

  const remove = async (id: string) => {
    if (!window.confirm(tActions("confirmDelete"))) return;
    setDeletingId(id);
    const { data, error } = await createClient()
      .from("documents")
      .delete()
      .eq("id", id)
      .select("id");
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error(tActions("deleteDenied"));
      return;
    }
    toast.success(tActions("deleted"));
    await load();
  };

  const download = async (d: Document) => {
    setDownloadingId(d.id);
    try {
      const res = await fetch(`/api/documents/${d.id}/pdf`);
      if (!res.ok) throw new Error("pdf_failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${d.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(tActions("downloadFailed"));
    } finally {
      setDownloadingId(null);
    }
  };

  const hasDocs = docs !== null && docs.length > 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">Historique</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {clientId && (
            <Badge variant="sand" className="gap-1.5 py-1.5">
              <span>{t("filters.clientFilter", { name: clientName ?? "…" })}</span>
              <Link
                href={`/${locale}/documents`}
                aria-label={t("filters.clearClient")}
                className="inline-flex items-center justify-center rounded-full hover:bg-background/40"
              >
                <X className="h-3 w-3" />
              </Link>
            </Badge>
          )}
          {hasDocs && (
            <>
              <Input
                placeholder={t("filters.searchName")}
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                className="w-full sm:w-56"
              />
              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder={t("filters.model")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filters.allModels")}</SelectItem>
                  {Object.values(tplById).map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Button asChild>
            <Link href={`/${locale}/documents/bulk`}>
              <Wand2 className="h-4 w-4" />
              Bulk depuis scan
            </Link>
          </Button>
        </div>
      </header>

      {docs === null ? (
        <div className="text-muted-foreground">Chargement…</div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Aucun document"
          description="Créez un document à partir d'un modèle pour le voir apparaître ici."
          action={
            <Button asChild>
              <Link href={`/${locale}/templates`}>
                <FileText className="h-4 w-4" />
                Voir les modèles
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.model")}</TableHead>
                <TableHead>{t("columns.owner")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.createdAt")}</TableHead>
                <TableHead className="text-end"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocs && filteredDocs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("filters.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDocs?.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <Link href={`/${locale}/documents/${d.id}`} className="hover:text-primary">
                        {d.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tplById[d.template_id]?.name ?? "—"}
                    </TableCell>
                    <TableCell>{resolveOwner(d, varsByTpl[d.template_id] ?? [])}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[d.status]}>{tStatus(d.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(d.created_at, locale)}</TableCell>
                    <TableCell className="text-end">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title={tActions("view")}
                          onClick={() => router.push(`/${locale}/documents/${d.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={tActions("edit")}
                          onClick={() => router.push(`/${locale}/documents/${d.id}?edit=1`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={tActions("download")}
                          disabled={downloadingId === d.id}
                          onClick={() => download(d)}
                        >
                          {downloadingId === d.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={tArchives("archive")}
                          disabled={archivingId === d.id}
                          onClick={() => archive(d.id)}
                        >
                          {archivingId === d.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          title={tActions("delete")}
                          disabled={deletingId === d.id}
                          onClick={() => remove(d.id)}
                        >
                          {deletingId === d.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
