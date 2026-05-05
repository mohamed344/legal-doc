"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  FileUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-states/empty";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { fillTemplate } from "@/lib/render-document";
import type { Template, TemplateVariable } from "@/lib/supabase/types";

type TemplateRow = Pick<Template, "id" | "name" | "category" | "description" | "body_html">;

type Step = "pick" | "upload" | "review";

interface ExtractResponse {
  ok: boolean;
  template: { id: string; name: string };
  rows: Record<string, string>[];
  variables: Pick<TemplateVariable, "key" | "label" | "type">[];
  error?: string;
  message?: string;
}

export default function UploadPage() {
  const t = useTranslations("upload");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<Step>("pick");
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [vars, setVars] = useState<TemplateVariable[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [batch, setBatch] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      const { data } = await createClient()
        .from("templates")
        .select("id, name, category, description, body_html")
        .eq("is_archived", false)
        .order("name", { ascending: true });
      setTemplates((data as TemplateRow[]) ?? []);
    };
    load();
  }, []);

  const pickTemplate = async (id: string) => {
    setTemplateId(id);
    const picked = (templates ?? []).find((x) => x.id === id) ?? null;
    setTpl(picked);
    if (!picked) return;
    const { data: v } = await createClient()
      .from("template_variables")
      .select("*")
      .eq("template_id", id)
      .order("order_index", { ascending: true });
    const all = (v as TemplateVariable[]) ?? [];
    setVars(all);
    const batchInit: Record<string, string> = {};
    for (const vv of all) if (vv.scope === "batch") batchInit[vv.key] = "";
    setBatch(batchInit);
    setStep("upload");
  };

  const onPickFile = (f: File) => {
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(f.name)) {
      toast.error(t("errors.unsupported"));
      return;
    }
    setFile(f);
  };

  const perRowVars = useMemo(() => vars.filter((v) => v.scope === "per_row"), [vars]);
  const batchVars = useMemo(() => vars.filter((v) => v.scope === "batch"), [vars]);

  const emptyRow = () => {
    const r: Record<string, string> = {};
    for (const v of perRowVars) r[v.key] = "";
    return r;
  };

  const analyze = async () => {
    if (!file || !templateId) return;
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("template_id", templateId);
      const res = await fetch("/api/ai/extract-rows", { method: "POST", body: fd });
      const data = (await res.json()) as ExtractResponse;
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? data.error ?? t("errors.analyze"));
        return;
      }
      if (!data.rows.length) {
        toast.warning(t("noRowsDetected"));
        setRows([emptyRow()]);
      } else {
        setRows(data.rows);
      }
      setStep("review");
    } catch {
      toast.error(t("errors.analyze"));
    } finally {
      setAnalyzing(false);
    }
  };

  const nameField = useMemo(() => {
    const preferred = ["requestor_name", "defendant_company", "requestor_company", "rental_tenant", "nom_client", "client_name"];
    for (const p of preferred) if (perRowVars.some((v) => v.key === p)) return p;
    return perRowVars[0]?.key ?? "";
  }, [perRowVars]);

  const previewHtml = useMemo(() => {
    if (!tpl || rows.length === 0) return "";
    const merged = { ...batch, ...rows[0] };
    return fillTemplate(tpl.body_html ?? null, vars, merged, { placeholderForMissing: true });
  }, [tpl, vars, rows, batch]);

  const generate = async () => {
    if (!templateId || rows.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          batch_fields: batch,
          rows,
          name_field: nameField,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? t("errors.save"));
        return;
      }
      toast.success(t("generateSuccess", { count: data.documents.length }));
      router.push(`/${locale}/documents`);
    } catch {
      toast.error(t("errors.save"));
    } finally {
      setSaving(false);
    }
  };

  if (templates !== null && templates.length === 0) {
    return (
      <div className="space-y-8 animate-fade-in">
        <header>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">{t("section")}</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </header>
        <EmptyState icon={Upload} title={t("noTemplates")} description="" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">{t("section")}</div>
        <h1 className="font-display text-display-2">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">{t("subtitle")}</p>
      </header>

      <StepIndicator step={step} labels={[t("pickTitle"), t("uploadTitle"), t("reviewTitle")]} />

      {step === "pick" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pickTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates === null ? (
              <div className="text-sm text-muted-foreground">{t("loadingTemplates")}</div>
            ) : (
              <div className="grid gap-2">
                {templates.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => pickTemplate(item.id)}
                    className="text-start flex items-center justify-between rounded-md border border-border/60 bg-card/40 p-4 hover:border-primary/50 hover:bg-card transition-colors"
                  >
                    <div>
                      <div className="font-medium">{item.name}</div>
                      {item.category && (
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                          {item.category}
                        </div>
                      )}
                      {item.description && (
                        <div className="text-sm text-muted-foreground mt-1">{item.description}</div>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "upload" && tpl && (
        <Card>
          <CardHeader>
            <CardTitle>{t("uploadTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("uploadSubtitleSelected", { name: tpl.name })}
            </p>
          </CardHeader>
          <CardContent>
            <label
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-md p-12 cursor-pointer hover:border-primary/50 transition-colors"
              htmlFor="upload-file"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <div className="text-center">
                <div className="font-medium">{t("dropZoneBulk")}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("supportedFormatsBulk")}</div>
              </div>
              {file && (
                <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <FileUp className="h-4 w-4 text-primary" />
                  {file.name}
                </div>
              )}
              <input
                id="upload-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => e.target.files && onPickFile(e.target.files[0])}
              />
            </label>

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setStep("pick")}>
                <ArrowLeft className="h-4 w-4" />
                {t("back")}
              </Button>
              <Button onClick={analyze} disabled={!file || analyzing} size="lg">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {analyzing ? t("extractingRows") : t("extractRows")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "review" && tpl && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                  {t("preview")}
                </Button>
              </SheetTrigger>
              <SheetContent side={locale === "ar" ? "left" : "right"} className="w-full sm:max-w-md flex flex-col">
                <SheetHeader>
                  <SheetTitle>{t("preview")}</SheetTitle>
                </SheetHeader>
                <div
                  className="prose prose-stone max-w-none text-xs flex-1 overflow-auto p-6"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </SheetContent>
            </Sheet>
          </div>
          <div className="space-y-6">
            {batchVars.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("batchFieldsTitle")}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t("batchFieldsSubtitle")}</p>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  {batchVars.map((v) => (
                    <div key={v.id}>
                      <Label htmlFor={`b-${v.id}`}>
                        {v.label}
                        {v.required && <span className="text-destructive"> *</span>}
                      </Label>
                      <Input
                        id={`b-${v.id}`}
                        type={v.type === "date" ? "date" : v.type === "number" ? "number" : "text"}
                        value={batch[v.key] ?? ""}
                        onChange={(e) => setBatch((p) => ({ ...p, [v.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t("rowsTitle", { count: rows.length })}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{t("rowsSubtitle")}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRows((prev) => [...prev, emptyRow()])}
                >
                  <Plus className="h-4 w-4" />
                  {t("addRow")}
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      {perRowVars.map((v) => (
                        <TableHead key={v.id} className="min-w-[160px]">
                          {v.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        {perRowVars.map((v) => (
                          <TableCell key={v.id}>
                            <Input
                              value={row[v.key] ?? ""}
                              type={v.type === "date" ? "date" : v.type === "number" ? "number" : "text"}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r, j) => (j === i ? { ...r, [v.key]: e.target.value } : r))
                                )
                              }
                            />
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4" />
                {t("back")}
              </Button>
              <Button onClick={generate} disabled={saving || rows.length === 0} size="lg">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {saving ? t("generating") : t("generate", { count: rows.length })}
              </Button>
            </div>
          </div>

          <Card className="sticky top-6 self-start h-[calc(100vh-8rem)] overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">{t("preview")}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <div
                className="prose prose-stone max-w-none text-xs"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step, labels }: { step: Step; labels: [string, string, string] }) {
  const steps: { id: Step; label: string }[] = [
    { id: "pick", label: labels[0] },
    { id: "upload", label: labels[1] },
    { id: "review", label: labels[2] },
  ];
  const currentIdx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              i <= currentIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
          <span className={i === currentIdx ? "font-medium" : "text-muted-foreground"}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-muted-foreground mx-2">—</span>}
        </div>
      ))}
    </div>
  );
}
