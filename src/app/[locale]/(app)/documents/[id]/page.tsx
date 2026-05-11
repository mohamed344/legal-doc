"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Download, Pencil, Printer, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { fillTemplate } from "@/lib/render-document";
import { Letterhead } from "@/components/letterhead";
import type { Document, Template, TemplateVariable } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";
import { detectDir } from "@/lib/text/direction";

function toStringMap(src: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === null || v === undefined) out[k] = "";
    else if (typeof v === "string") out[k] = v;
    else if (typeof v === "boolean") out[k] = v ? "true" : "false";
    else out[k] = String(v);
  }
  return out;
}

export default function DocumentViewPage() {
  const t = useTranslations("documents");
  const tStatus = useTranslations("documents.status");
  const tActions = useTranslations("documents.actions");
  const locale = useLocale();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [doc, setDoc] = useState<Document | null>(null);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [vars, setVars] = useState<TemplateVariable[]>([]);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const s = createClient();
      const { data: d } = await s.from("documents").select("*").eq("id", id).single();
      if (d) {
        const typed = d as Document;
        setDoc(typed);
        setValues(toStringMap(typed.filled_data ?? {}));
        const { data: tRow } = await s
          .from("templates")
          .select("*")
          .eq("id", typed.template_id)
          .single();
        setTpl((tRow as unknown as Template) ?? null);
        const { data: v } = await s
          .from("template_variables")
          .select("*")
          .eq("template_id", typed.template_id)
          .order("order_index", { ascending: true });
        setVars((v as TemplateVariable[]) ?? []);
      }
    };
    load();
  }, [id]);

  const renderedHtml = useMemo(() => {
    if (!doc || !tpl) return "";
    const source = editing ? values : toStringMap(doc.filled_data ?? {});
    return fillTemplate(tpl.body_html ?? null, vars, source);
  }, [doc, tpl, vars, editing, values]);

  const isRtl = useMemo(() => detectDir(renderedHtml, locale) === "rtl", [renderedHtml, locale]);

  const print = () => {
    if (!tpl || !doc) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const printDir = detectDir(renderedHtml, locale);
    const printLang = printDir === "rtl" ? "ar" : "fr";
    w.document.write(`
      <html dir="${printDir}" lang="${printLang}"><head><title>${doc.name}</title>
      <style>body{font-family:${printDir === "rtl" ? "'Traditional Arabic','Geeza Pro',Georgia,serif" : "Georgia,'Times New Roman',serif"};padding:48px;max-width:800px;margin:0 auto;color:#2A2A2A;line-height:1.6}h1,h2,h3{font-weight:700}</style>
      </head><body>${renderedHtml}</body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const startEdit = () => {
    if (!doc) return;
    setValues(toStringMap(doc.filled_data ?? {}));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (!doc) return;
    setValues(toStringMap(doc.filled_data ?? {}));
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!doc) return;
    setBusy(true);
    const { error } = await createClient()
      .from("documents")
      .update({ filled_data: values, updated_at: new Date().toISOString() })
      .eq("id", doc.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDoc({ ...doc, filled_data: values });
    setEditing(false);
    toast.success(tActions("saved"));
  };

  if (!doc) return <div>Chargement…</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-display-2 truncate">{doc.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <Badge variant="sand">{tStatus(doc.status)}</Badge>
            <span>{formatDate(doc.created_at, locale)}</span>
          </div>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={cancelEdit} disabled={busy}>
              <X className="h-4 w-4" />
              {tActions("cancel")}
            </Button>
            <Button onClick={saveEdit} disabled={busy}>
              <Save className="h-4 w-4" />
              {tActions("save")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={startEdit}>
              <Pencil className="h-4 w-4" />
              {tActions("edit")}
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noopener">
                <Download className="h-4 w-4" />
                {tActions("download")}
              </a>
            </Button>
            <Button variant="outline" onClick={print}>
              <Printer className="h-4 w-4" />
              {t("print")}
            </Button>
          </div>
        )}
      </div>

      {editing && vars.length > 0 && (
        <Card>
          <CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            {vars.map((v) => {
              const current = values[v.key] ?? "";
              if (v.type === "checkbox") {
                return (
                  <div key={v.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                    <Label htmlFor={`e-${v.id}`}>{v.label}</Label>
                    <Switch
                      id={`e-${v.id}`}
                      checked={current === "true"}
                      onCheckedChange={(c) =>
                        setValues((prev) => ({ ...prev, [v.key]: c ? "true" : "false" }))
                      }
                    />
                  </div>
                );
              }
              if (v.type === "select") {
                const options = v.options ?? [];
                return (
                  <div key={v.id}>
                    <Label htmlFor={`e-${v.id}`}>{v.label}</Label>
                    <Select
                      value={current}
                      onValueChange={(val) => setValues((prev) => ({ ...prev, [v.key]: val }))}
                    >
                      <SelectTrigger id={`e-${v.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              return (
                <div key={v.id}>
                  <Label htmlFor={`e-${v.id}`}>
                    {v.label}
                    {v.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input
                    id={`e-${v.id}`}
                    type={v.type === "date" ? "date" : v.type === "number" ? "number" : "text"}
                    value={current}
                    onChange={(e) => setValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent
          dir={isRtl ? "rtl" : "ltr"}
          lang={isRtl ? "ar" : undefined}
          className="prose prose-stone prose-lg max-w-none p-8 md:p-12 leading-relaxed"
        >
          <Letterhead className="not-prose mb-6" />
          <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        </CardContent>
      </Card>
    </div>
  );
}
