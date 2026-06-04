"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Download, Eye, Loader2, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { fillTemplate } from "@/lib/render-document";
import { Letterhead } from "@/components/letterhead";
import { stripLeadingLetterhead } from "@/lib/pdf/strip-letterhead";
import type { Template, TemplateVariable, Client } from "@/lib/supabase/types";
import { detectDir } from "@/lib/text/direction";

export default function NewDocumentPage() {
  const t = useTranslations("documents");
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const templateId = search.get("template");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [vars, setVars] = useState<TemplateVariable[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [docName, setDocName] = useState("");
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [{ data: tpls }, { data: cls }] = await Promise.all([
        supabase.from("templates").select("*").eq("is_archived", false),
        supabase.from("clients").select("*"),
      ]);
      setTemplates((tpls as Template[]) ?? []);
      setClients((cls as Client[]) ?? []);
      if (templateId && tpls) {
        const t = tpls.find((x: any) => x.id === templateId) as Template | undefined;
        if (t) await selectTemplate(t);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const selectTemplate = async (t: Template) => {
    setTpl(t);
    setDocName(t.name);
    const supabase = createClient();
    const { data } = await supabase.from("template_variables").select("*").eq("template_id", t.id).order("order_index");
    setVars((data as TemplateVariable[]) ?? []);
    setValues({});
  };

  const filledHtml = useMemo(
    () => fillTemplate(tpl?.body_html ?? null, vars, values, { placeholderForMissing: true }),
    [tpl, vars, values]
  );

  const save = async (status: "brouillon" | "valide" = "brouillon") => {
    if (!tpl) return;
    setSaving(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase
      .from("documents")
      .insert({
        template_id: tpl.id,
        client_id: clientId || null,
        name: docName || tpl.name,
        status,
        filled_data: values,
        created_by: u.user.id,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Document enregistré");
    router.push(`/${locale}/documents/${(data as any).id}`);
  };

  // Render the unsaved document through the SAME server pipeline used by saved
  // documents (renderHtmlToPdf), so the print/download output is identical —
  // A4, 11pt body, compact letterhead, page footer — instead of the browser's
  // large default font. The server adds the letterhead, so we send the clean
  // filled body here (no placeholder spans, no letterhead).
  const requestPreviewPdf = async (failMsg: string): Promise<Blob | null> => {
    if (!tpl) return null;
    const html = fillTemplate(tpl.body_html ?? null, vars, values);
    try {
      const res = await fetch(`/api/documents/preview/pdf`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html, title: docName || tpl.name }),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const b = (await res.json()) as { error?: string; message?: string };
          detail = b.message || b.error || "";
        } catch {
          // not JSON — keep generic
        }
        toast.error(detail ? `${failMsg} — ${detail}` : failMsg);
        return null;
      }
      return await res.blob();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg ? `${failMsg} — ${msg}` : failMsg);
      return null;
    }
  };

  const print = async () => {
    if (!tpl || printing) return;
    setPrinting(true);
    try {
      const blob = await requestPreviewPdf("Échec de l'impression");
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          iframe.remove();
          URL.revokeObjectURL(url);
        }, 60000);
      };
      document.body.appendChild(iframe);
    } finally {
      setPrinting(false);
    }
  };

  const download = async () => {
    if (!tpl || downloading) return;
    setDownloading(true);
    try {
      const blob = await requestPreviewPdf("Échec du téléchargement");
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docName || tpl.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-display text-display-2 min-w-0 truncate">Nouveau document</h1>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowPreview((v) => !v)} disabled={!tpl}>
            <Eye className="h-4 w-4" />
            {showPreview ? "Formulaire" : t("preview")}
          </Button>
          <Button variant="outline" onClick={download} disabled={!tpl || downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("actions.download")}
          </Button>
          <Button variant="outline" onClick={print} disabled={!tpl || printing}>
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t("print")}
          </Button>
          <Button onClick={() => save("valide")} disabled={!tpl || saving}>
            <Save className="h-4 w-4" />
            Valider
          </Button>
        </div>
      </div>

      {!tpl ? (
        <Card>
          <CardHeader>
            <CardTitle>Choisir un modèle</CardTitle>
          </CardHeader>
          <CardContent>
            <Select onValueChange={(id) => selectTemplate(templates.find((x) => x.id === id)!)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un modèle" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : showPreview ? (
        <Card>
          <CardContent dir={detectDir(filledHtml, locale)} className="prose prose-stone max-w-none p-8">
            <Letterhead className="not-prose mb-6" />
            <div dangerouslySetInnerHTML={{ __html: stripLeadingLetterhead(filledHtml) }} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nom du document</Label>
                <Input value={docName} onChange={(e) => setDocName(e.target.value)} />
              </div>
              <div>
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un client (optionnel)" />
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
              <div className="pt-4 border-t border-border/60">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Variables du modèle</div>
                <div className="space-y-3">
                  {vars.map((v) => (
                    <div key={v.id}>
                      <Label>{v.label}{v.required && <span className="text-destructive ms-1">*</span>}</Label>
                      {v.type === "text" && (
                        <Input value={(values[v.key] as string) ?? ""} onChange={(e) => setValues({ ...values, [v.key]: e.target.value })} />
                      )}
                      {v.type === "number" && (
                        <Input type="number" value={(values[v.key] as string) ?? ""} onChange={(e) => setValues({ ...values, [v.key]: e.target.value })} />
                      )}
                      {v.type === "date" && (
                        <Input type="date" value={(values[v.key] as string) ?? ""} onChange={(e) => setValues({ ...values, [v.key]: e.target.value })} />
                      )}
                      {v.type === "select" && v.options && (
                        <Select value={(values[v.key] as string) ?? ""} onValueChange={(val) => setValues({ ...values, [v.key]: val })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {v.options.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {v.type === "checkbox" && (
                        <div className="flex items-center gap-2 mt-2">
                          <Checkbox checked={!!values[v.key]} onCheckedChange={(c) => setValues({ ...values, [v.key]: !!c })} />
                          <span className="text-sm">{v.label}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("preview")}</CardTitle>
            </CardHeader>
            <CardContent dir={detectDir(filledHtml, locale)} className="prose prose-stone max-w-none">
              <Letterhead className="not-prose mb-6" />
              <div dangerouslySetInnerHTML={{ __html: stripLeadingLetterhead(filledHtml) }} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
