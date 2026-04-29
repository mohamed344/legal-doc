"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  FolderOpen,
  Loader2,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  X,
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

const NO_TEMPLATE = "__none__";

type UploadEntry =
  | { kind: "single"; item: ArchivedUpload; latest: string }
  | { kind: "batch"; batchId: string; items: ArchivedUpload[]; latest: string; name: string };

const runPool = async <T,>(items: T[], n: number, fn: (item: T) => Promise<void>) => {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  });
  await Promise.all(workers);
};

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
  const [pickedTemplate, setPickedTemplate] = useState<string>(NO_TEMPLATE);
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [archiveName, setArchiveName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] }>({
    done: 0,
    total: 0,
    failed: [],
  });
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

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
    if (profile?.is_admin) {
      load();
    }
  }, [profile?.is_admin]);

  const templatesById = useMemo(
    () => Object.fromEntries(templates.map((tpl) => [tpl.id, tpl])),
    [templates],
  );

  const uploadEntries: UploadEntry[] | null = useMemo(() => {
    if (!uploads) return null;
    const standalone: ArchivedUpload[] = [];
    const batches = new Map<string, ArchivedUpload[]>();
    for (const u of uploads) {
      if (u.batch_id) {
        const arr = batches.get(u.batch_id) ?? [];
        arr.push(u);
        batches.set(u.batch_id, arr);
      } else {
        standalone.push(u);
      }
    }
    const entries: UploadEntry[] = standalone.map((item) => ({
      kind: "single",
      item,
      latest: item.archived_at,
    }));
    for (const [batchId, items] of batches) {
      const sortedItems = [...items].sort((a, b) => (a.archived_at < b.archived_at ? 1 : -1));
      entries.push({
        kind: "batch",
        batchId,
        items: sortedItems,
        latest: sortedItems[0].archived_at,
        name: sortedItems[0].name,
      });
    }
    entries.sort((a, b) => (a.latest < b.latest ? 1 : -1));
    return entries;
  }, [uploads]);

  if (profile && !profile.is_admin) {
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

  const deleteBatch = async (batchId: string, count: number) => {
    if (!window.confirm(t("groupRow.confirmDeleteGroup", { count }))) return;
    const res = await fetch(`/api/archives/uploads?batch_id=${batchId}`, { method: "DELETE" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      toast.error(body?.error ?? t("deleted"));
      return;
    }
    toast.success(t("deleted"));
    load();
  };

  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const resetModal = () => {
    setPickedTemplate(NO_TEMPLATE);
    setPickedFiles([]);
    setArchiveName("");
    setSubmitting(false);
    setProgress({ done: 0, total: 0, failed: [] });
  };

  const openModal = () => {
    resetModal();
    setModalOpen(true);
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    setPickedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const merged = [...prev];
      for (const f of incoming) {
        const key = `${f.name}_${f.size}`;
        if (!seen.has(key)) {
          merged.push(f);
          seen.add(key);
        }
      }
      return merged;
    });
    if (!archiveName.trim()) {
      const first = incoming[0];
      const dot = first.name.lastIndexOf(".");
      setArchiveName(dot > 0 ? first.name.slice(0, dot) : first.name);
    }
  };

  const removePickedFile = (idx: number) => {
    setPickedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadOne = async (file: File, batchId: string | null, name: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (pickedTemplate && pickedTemplate !== NO_TEMPLATE) {
      fd.append("template_id", pickedTemplate);
    }
    if (batchId) fd.append("batch_id", batchId);
    fd.append("name", name);
    const res = await fetch("/api/archives/uploads", { method: "POST", body: fd });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      throw new Error(body?.message ?? body?.error ?? tUpload("failed"));
    }
  };

  const submitUpload = async () => {
    if (pickedFiles.length === 0) return;
    setSubmitting(true);
    const sharedName = archiveName.trim() || pickedFiles[0].name;
    const isBatch = pickedFiles.length > 1;
    const batchId = isBatch ? crypto.randomUUID() : null;
    const total = pickedFiles.length;
    const failed: string[] = [];

    setProgress({ done: 0, total, failed: [] });

    await runPool(pickedFiles, 3, async (file) => {
      try {
        await uploadOne(file, batchId, sharedName);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (e) {
        failed.push(file.name);
        const msg = e instanceof Error ? e.message : tUpload("failed");
        setProgress((p) => ({ ...p, done: p.done + 1, failed: [...p.failed, file.name] }));
        console.error(`[archives-upload] ${file.name}: ${msg}`);
      }
    });

    if (failed.length === 0) {
      toast.success(tUpload("success"));
    } else if (failed.length === total) {
      toast.error(tUpload("failed"));
    } else {
      toast.warning(
        `${tUpload("partialSuccess", { ok: total - failed.length, failed: failed.length })}: ${failed.join(", ")}`,
      );
    }

    setModalOpen(false);
    resetModal();
    await load();
    setTab("uploads");
    if (batchId) {
      setExpandedBatches((prev) => new Set(prev).add(batchId));
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
          {uploadEntries === null ? (
            <div className="text-muted-foreground">Chargement…</div>
          ) : uploadEntries.length === 0 ? (
            <EmptyState icon={FileUp} title={t("emptyUploads")} description="" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>{t("columns.model")}</TableHead>
                    <TableHead>{t("columns.file")}</TableHead>
                    <TableHead>{t("archivedAt")}</TableHead>
                    <TableHead className="text-end"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploadEntries.map((entry) => {
                    if (entry.kind === "single") {
                      const u = entry.item;
                      return (
                        <TableRow key={u.id}>
                          <TableCell></TableCell>
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
                      );
                    }

                    const expanded = expandedBatches.has(entry.batchId);
                    const tplIds = new Set(entry.items.map((i) => i.template_id ?? ""));
                    const sharedTpl =
                      tplIds.size === 1 && entry.items[0].template_id
                        ? templatesById[entry.items[0].template_id]?.name ?? "—"
                        : tplIds.size > 1
                          ? "—"
                          : "—";
                    return (
                      <Fragment key={entry.batchId}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleBatch(entry.batchId)}
                        >
                          <TableCell>
                            {expanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            <span className="me-2">{entry.name}</span>
                            <Badge variant="sand">
                              {tUpload("fileCount", { count: entry.items.length })}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{sharedTpl}</TableCell>
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(entry.latest, locale)}
                          </TableCell>
                          <TableCell className="text-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBatch(entry.batchId, entry.items.length);
                              }}
                              title={t("groupRow.deleteGroup")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expanded &&
                          entry.items.map((u) => (
                            <TableRow key={u.id} className="bg-muted/20">
                              <TableCell></TableCell>
                              <TableCell className="ps-8 text-sm text-muted-foreground">
                                ↳
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {u.template_id ? templatesById[u.template_id]?.name ?? "—" : "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                <span className="truncate inline-block max-w-[240px] align-middle">
                                  {u.file_name}
                                </span>
                                <span className="ms-2 text-xs">
                                  ({formatBytes(u.file_size)})
                                </span>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDate(u.archived_at, locale)}
                              </TableCell>
                              <TableCell className="text-end">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    title={t("download")}
                                  >
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
                      </Fragment>
                    );
                  })}
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
                  <SelectItem value={NO_TEMPLATE}>{tUpload("noTemplate")}</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{tUpload("pickFiles")}</Label>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-md p-6 cursor-pointer hover:border-primary/50 transition-colors">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="text-xs text-muted-foreground">PDF, PNG, JPG, WEBP</div>
                <div className="text-xs text-primary">
                  {pickedFiles.length === 0 ? tUpload("pickFiles") : tUpload("addMoreFiles")}
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    onPickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {pickedFiles.length > 0 && (
                <ul className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                  {pickedFiles.map((f, idx) => (
                    <li
                      key={`${f.name}_${f.size}_${idx}`}
                      className="flex items-center gap-2 text-sm rounded border border-border px-2 py-1"
                    >
                      <FileUp className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatBytes(f.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePickedFile(idx)}
                        disabled={submitting}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        aria-label={tUpload("removeFile")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
              disabled={submitting || pickedFiles.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progress.total > 1
                    ? tUpload("uploadingProgress", { done: progress.done, total: progress.total })
                    : pickedTemplate !== NO_TEMPLATE
                      ? tUpload("extracting")
                      : tUpload("submitNoExtract")}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {pickedFiles.length > 1
                    ? tUpload("submitMulti")
                    : pickedTemplate !== NO_TEMPLATE
                      ? tUpload("submit")
                      : tUpload("submitNoExtract")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
