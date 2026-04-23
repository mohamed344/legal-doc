"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Archive,
  Download,
  FileUp,
  FolderOpen,
  Loader2,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-states/empty";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/auth-context";
import { formatDA, formatDate } from "@/lib/utils";
import type { ArchivedUpload, Client, Document, Invoice, Template } from "@/lib/supabase/types";

const DOC_VARIANTS: Record<string, "forest" | "sand" | "terracotta"> = {
  brouillon: "sand",
  valide: "forest",
  facture: "terracotta",
};
const INV_VARIANTS: Record<string, "sand" | "forest" | "terracotta"> = {
  brouillon: "sand",
  envoyee: "terracotta",
  payee: "forest",
};

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function ArchivesPage() {
  const t = useTranslations("archives");
  const tUpload = useTranslations("archives.upload");
  const tDocs = useTranslations("documents.status");
  const tInv = useTranslations("invoices.statuses");
  const tEmployees = useTranslations("employees");
  const locale = useLocale();
  const { profile } = useAuth();

  const [docs, setDocs] = useState<Document[] | null>(null);
  const [invoices, setInvoices] = useState<(Invoice & { client?: Client })[] | null>(null);
  const [uploads, setUploads] = useState<ArchivedUpload[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tab, setTab] = useState("documents");

  const [modalOpen, setModalOpen] = useState(false);
  const [pickedTemplate, setPickedTemplate] = useState<string>("");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [archiveName, setArchiveName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const s = createClient();
    const [{ data: d }, { data: inv }, { data: cls }, { data: up }, { data: tpls }] =
      await Promise.all([
        s.from("documents").select("*").eq("is_archived", true).order("archived_at", { ascending: false }),
        s.from("invoices").select("*").eq("is_archived", true).order("archived_at", { ascending: false }),
        s.from("clients").select("*"),
        s.from("archived_uploads").select("*").order("archived_at", { ascending: false }),
        s.from("templates").select("*").eq("is_archived", false).order("name", { ascending: true }),
      ]);

    setDocs((d as Document[]) ?? []);
    const byId = new Map((cls as Client[] | null)?.map((c) => [c.id, c]) ?? []);
    setInvoices(((inv as Invoice[]) ?? []).map((i) => ({ ...i, client: byId.get(i.client_id) })));
    setUploads((up as ArchivedUpload[]) ?? []);
    setTemplates((tpls as Template[]) ?? []);
  };

  useEffect(() => {
    if (profile?.role === "admin") {
      load();
    }
  }, [profile?.role]);

  const templatesById = useMemo(
    () => Object.fromEntries(templates.map((tpl) => [tpl.id, tpl])),
    [templates],
  );

  if (profile && profile.role !== "admin") {
    return (
      <EmptyState icon={ShieldAlert} title={tEmployees("adminOnly")} description={t("adminOnly")} />
    );
  }

  const restoreDoc = async (id: string) => {
    const { error } = await createClient()
      .from("documents")
      .update({ is_archived: false, archived_at: null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("restored"));
    load();
  };

  const deleteDoc = async (id: string) => {
    if (!window.confirm(t("confirmDelete"))) return;
    const { error } = await createClient().from("documents").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("deleted"));
    load();
  };

  const restoreInv = async (id: string) => {
    const { error } = await createClient()
      .from("invoices")
      .update({ is_archived: false, archived_at: null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("restored"));
    load();
  };

  const deleteInv = async (id: string) => {
    if (!window.confirm(t("confirmDelete"))) return;
    const { error } = await createClient().from("invoices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("deleted"));
    load();
  };

  const deleteUpload = async (id: string) => {
    if (!window.confirm(t("confirmDelete"))) return;
    const res = await fetch(`/api/archives/uploads?id=${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      toast.error(body?.error ?? t("deleted"));
      return;
    }
    toast.success(t("deleted"));
    load();
  };

  const resetModal = () => {
    setPickedTemplate("");
    setPickedFile(null);
    setArchiveName("");
    setSubmitting(false);
  };

  const openModal = () => {
    resetModal();
    setModalOpen(true);
  };

  const onPickFile = (f: File | null) => {
    setPickedFile(f);
    if (f && !archiveName.trim()) {
      const dot = f.name.lastIndexOf(".");
      setArchiveName(dot > 0 ? f.name.slice(0, dot) : f.name);
    }
  };

  const submitUpload = async () => {
    if (!pickedFile || !pickedTemplate) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.append("file", pickedFile);
    fd.append("template_id", pickedTemplate);
    fd.append("name", archiveName.trim() || pickedFile.name);
    try {
      const res = await fetch("/api/archives/uploads", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        toast.error(body?.message ?? body?.error ?? tUpload("failed"));
        setSubmitting(false);
        return;
      }
      toast.success(tUpload("success"));
      setModalOpen(false);
      resetModal();
      await load();
      setTab("uploads");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tUpload("failed"));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">{t("section")}</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={openModal}>
          <Upload className="h-4 w-4" />
          {tUpload("button")}
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="documents">
            <FolderOpen className="h-4 w-4 me-2" />
            {t("tabs.documents")}
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <Receipt className="h-4 w-4 me-2" />
            {t("tabs.invoices")}
          </TabsTrigger>
          <TabsTrigger value="uploads">
            <FileUp className="h-4 w-4 me-2" />
            {t("tabs.uploads")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          {docs === null ? (
            <div className="text-muted-foreground">Chargement…</div>
          ) : docs.length === 0 ? (
            <EmptyState icon={Archive} title={t("emptyDocs")} description="" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>{t("archivedAt")}</TableHead>
                    <TableHead className="text-end"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>
                        <Badge variant={DOC_VARIANTS[d.status]}>{tDocs(d.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate((d as Document & { archived_at?: string }).archived_at ?? d.created_at, locale)}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => restoreDoc(d.id)} title={t("restore")}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteDoc(d.id)}
                            title={t("delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="invoices">
          {invoices === null ? (
            <div className="text-muted-foreground">Chargement…</div>
          ) : invoices.length === 0 ? (
            <EmptyState icon={Archive} title={t("emptyInvoices")} description="" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>{t("archivedAt")}</TableHead>
                    <TableHead className="text-end">Total</TableHead>
                    <TableHead className="text-end"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.number}</TableCell>
                      <TableCell>{i.client?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={INV_VARIANTS[i.status]}>{tInv(i.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate((i as Invoice & { archived_at?: string }).archived_at ?? i.issued_at, locale)}
                      </TableCell>
                      <TableCell className="text-end numerals-display">{formatDA(Number(i.total))}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => restoreInv(i.id)} title={t("restore")}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteInv(i.id)}
                            title={t("delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="uploads">
          {uploads === null ? (
            <div className="text-muted-foreground">Chargement…</div>
          ) : uploads.length === 0 ? (
            <EmptyState icon={FileUp} title={t("emptyUploads")} description="" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>{t("columns.model")}</TableHead>
                    <TableHead>{t("columns.file")}</TableHead>
                    <TableHead>{t("archivedAt")}</TableHead>
                    <TableHead className="text-end"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.template_id ? templatesById[u.template_id]?.name ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="truncate inline-block max-w-[240px] align-middle">{u.file_name}</span>
                        <span className="ms-2 text-xs">({formatBytes(u.file_size)})</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(u.archived_at, locale)}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" title={t("download")}>
                            <a
                              href={`/api/archives/uploads?id=${u.id}`}
                              target="_blank"
                              rel="noopener"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteUpload(u.id)}
                            title={t("delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={(open) => (!submitting ? setModalOpen(open) : null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{tUpload("title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{tUpload("pickTemplate")}</Label>
              <Select value={pickedTemplate} onValueChange={setPickedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder={tUpload("pickTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{tUpload("pickFile")}</Label>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-md p-8 cursor-pointer hover:border-primary/50 transition-colors">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="text-xs text-muted-foreground">PDF, PNG, JPG, WEBP</div>
                {pickedFile && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                    <FileUp className="h-4 w-4 text-primary" />
                    <span className="truncate max-w-[360px]">{pickedFile.name}</span>
                    <span className="text-xs text-muted-foreground">({formatBytes(pickedFile.size)})</span>
                  </div>
                )}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div>
              <Label htmlFor="archive-name">{tUpload("name")}</Label>
              <Input
                id="archive-name"
                value={archiveName}
                onChange={(e) => setArchiveName(e.target.value)}
                placeholder={tUpload("name")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={submitUpload}
              disabled={submitting || !pickedFile || !pickedTemplate}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tUpload("extracting")}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {tUpload("submit")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
