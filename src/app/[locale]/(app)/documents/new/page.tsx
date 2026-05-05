"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Eye, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { fillTemplate } from "@/lib/render-document";
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

  const print = () => {
    if (!tpl) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const printDir = detectDir(filledHtml, locale);
    const printLang = printDir === "rtl" ? "ar" : "fr";
    const fontStack = printDir === "rtl"
      ? "'Traditional Arabic','Geeza Pro',Georgia,serif"
      : "Georgia,'Times New Roman',serif";
    w.document.write(`
      <html dir="${printDir}" lang="${printLang}">
        <head>
          <title>${docName || tpl.name}</title>
          <style>
            body { font-family: ${fontStack}; padding: 48px; max-width: 800px; margin: 0 auto; color: #2A2A2A; line-height: 1.6; }
            h1, h2, h3 { font-weight: 700; }
          </style>
        </head>
        <body>${filledHtml}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
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
          <Button variant="outline" onClick={print} disabled={!tpl}>
            <Printer className="h-4 w-4" />
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
          <CardContent
            dir={detectDir(filledHtml, locale)}
            className="prose prose-stone max-w-none p-8"
            dangerouslySetInnerHTML={{ __html: filledHtml }}
          />
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
            <CardContent
              dir={detectDir(filledHtml, locale)}
              className="prose prose-stone max-w-none"
              dangerouslySetInnerHTML={{ __html: filledHtml }}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
