"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Upload, FileUp, Sparkles, Check, X, ArrowLeft, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { slug } from "@/lib/utils";

interface Suggestion {
  key: string;
  label: string;
  type: string;
  required: boolean;
  category: string;
  accepted: boolean;
}

export default function AiImportPage() {
  const t = useTranslations("aiImport");
  const locale = useLocale();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    name: string;
    category: string;
    bodyHtml: string;
    variables: Suggestion[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const onPick = (f: File) => {
    const ok = /\.(pdf|docx)$/i.test(f.name);
    if (!ok) {
      toast.error(t("supportedFormats"));
      return;
    }
    setFile(f);
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/generate-template", {
        method: "POST",
        body: (() => {
          const fd = new FormData();
          fd.append("file", file);
          return fd;
        })(),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({
          name: data.name,
          category: data.category,
          bodyHtml: data.bodyHtml,
          variables: data.variables.map((v: Omit<Suggestion, "accepted">) => ({ ...v, accepted: true })),
        });
      } else {
        toast.error("Erreur d'analyse");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const toggle = (key: string) => {
    setResult((r) => r && { ...r, variables: r.variables.map((v) => (v.key === key ? { ...v, accepted: !v.accepted } : v)) });
  };

  const openInEditor = async () => {
    if (!result) return;
    setSaving(true);
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setSaving(false);
      return;
    }
    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({
        name: result.name,
        category: result.category,
        body_html: result.bodyHtml,
        created_by: user.user.id,
      })
      .select()
      .single();
    if (error || !tpl) {
      toast.error(error?.message ?? "Erreur");
      setSaving(false);
      return;
    }
    const accepted = result.variables.filter((v) => v.accepted);
    if (accepted.length > 0) {
      await supabase.from("template_variables").insert(
        accepted.map((v, i) => ({
          template_id: tpl.id,
          key: slug(v.key),
          label: v.label,
          type: v.type as any,
          required: v.required,
          category: v.category || null,
          order_index: i,
        }))
      );
    }
    router.push(`/${locale}/templates/${tpl.id}/edit`);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep">IA</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
      </div>

      <Card className="bg-accent/10 border-accent/40">
        <CardContent className="flex items-start gap-3 p-5">
          <Info className="h-5 w-5 text-terracotta-deep shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80">{t("stubNotice")}</p>
        </CardContent>
      </Card>

      {!result && (
        <Card>
          <CardContent className="p-8">
            <label
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-md p-12 cursor-pointer hover:border-primary/50 transition-colors"
              htmlFor="ai-file"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <div className="text-center">
                <div className="font-medium">{t("dropZone")}</div>
                <div className="text-xs text-muted-foreground mt-1">{t("supportedFormats")}</div>
              </div>
              {file && (
                <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <FileUp className="h-4 w-4 text-primary" />
                  {file.name}
                </div>
              )}
              <input
                id="ai-file"
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => e.target.files && onPick(e.target.files[0])}
              />
            </label>

            <div className="mt-6 flex justify-end">
              <Button onClick={analyze} disabled={!file || analyzing} size="lg">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {analyzing ? t("analyzing") : "Analyser"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{result.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant="sand">{result.category}</Badge>
              <div
                className="prose prose-stone max-w-none text-sm border-t border-border/60 pt-4"
                dangerouslySetInnerHTML={{ __html: result.bodyHtml }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("suggestionsTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground">{result.variables.filter((v) => v.accepted).length} / {result.variables.length} acceptées</p>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {result.variables.map((v) => (
                <button
                  key={v.key}
                  onClick={() => toggle(v.key)}
                  className={`flex items-start gap-3 rounded-md border p-3 text-start transition-colors ${
                    v.accepted ? "border-primary/50 bg-primary/5" : "border-border bg-card/40 opacity-60"
                  }`}
                >
                  <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${v.accepted ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {v.accepted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="forest" className="font-mono text-[10px]">{`{{${v.key}}}`}</Badge>
                      <Badge variant="sand" className="text-[10px]">{v.type}</Badge>
                      {v.required && <Badge variant="terracotta" className="text-[10px]">Requis</Badge>}
                    </div>
                    <div className="text-sm mt-1">{v.label}</div>
                    {v.category && <div className="text-xs text-muted-foreground">{v.category}</div>}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResult(null)}>Recommencer</Button>
            <Button onClick={openInEditor} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("openInEditor")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
