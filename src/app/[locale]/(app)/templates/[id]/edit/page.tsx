"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Save, FileText, Variable as VariableIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TemplateEditor } from "@/components/templates/template-editor";
import { Letterhead } from "@/components/letterhead";
import { createClient } from "@/lib/supabase/client";
import type { Template, TemplateVariable } from "@/lib/supabase/types";

export default function EditTemplatePage() {
  const t = useTranslations("templates.editor");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [tpl, setTpl] = useState<Template | null>(null);
  const [vars, setVars] = useState<TemplateVariable[]>([]);
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [{ data: tplData }, { data: varsData }] = await Promise.all([
        supabase.from("templates").select("*").eq("id", id).single(),
        supabase.from("template_variables").select("*").eq("template_id", id).order("order_index"),
      ]);
      if (tplData) {
        const row = tplData as Template;
        setTpl(row);
        setName(row.name);
        setDescription(row.description ?? "");
        setContent(row.body_html ?? "");
      }
      setVars((varsData as TemplateVariable[]) ?? []);
    };
    load();
  }, [id]);

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("templates")
      .update({ name, description: description || null, body_html: content })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(t("saved"));
  };

  if (!tpl) {
    return <div className="text-muted-foreground">Chargement…</div>;
  }

  const variablesList = vars.length === 0 ? (
    <p className="text-sm text-muted-foreground">Aucune variable.</p>
  ) : (
    vars.map((v) => (
      <div key={v.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2">
        <Badge variant="forest" className="font-mono text-[10px] truncate max-w-full">{`{{${v.key}}}`}</Badge>
        <div className="flex-1 text-sm truncate">{v.label}</div>
        <Badge variant="sand" className="text-[10px] shrink-0">{v.type}</Badge>
      </div>
    ))
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/${locale}/templates`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-display text-display-2 min-w-0 truncate">{name || "Modèle"}</h1>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="lg:hidden">
                <VariableIcon className="h-4 w-4" />
                {t("variables")}
              </Button>
            </SheetTrigger>
            <SheetContent side={locale === "ar" ? "left" : "right"} className="w-full sm:max-w-md flex flex-col">
              <SheetHeader>
                <SheetTitle>{t("variables")}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6 space-y-2">
                {variablesList}
              </div>
            </SheetContent>
          </Sheet>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {t("save")}
          </Button>
          <Button asChild variant="outline">
            <a href={`/${locale}/documents/new?template=${id}`}>
              <FileText className="h-4 w-4" />
              Remplir
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t("name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>{t("description")}</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("content")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Letterhead />
              <TemplateEditor content={content} onChange={setContent} />
            </CardContent>
          </Card>
        </div>

        <Card className="hidden lg:block sticky top-20 h-fit">
          <CardHeader>
            <CardTitle>{t("variables")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {variablesList}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
