"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Plus,
  Save,
  Trash2,
  ArrowLeft,
  GripVertical,
  Upload,
  Sparkles,
  Loader2,
  FileUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { TemplateEditor } from "@/components/templates/template-editor";
import { createClient } from "@/lib/supabase/client";
import { slug } from "@/lib/utils";
import type { VariableType } from "@/lib/supabase/types";

interface Variable {
  tempId: string;
  key: string;
  label: string;
  type: VariableType;
  required: boolean;
  options: string;
  category: string;
}

export default function NewTemplatePage() {
  const t = useTranslations("templates.editor");
  const tTypes = useTranslations("templates.types");
  const tPrefill = useTranslations("templates.editor.prefill");
  const locale = useLocale();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [defaultPrice, setDefaultPrice] = useState<string>("");
  const [content, setContent] = useState("");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [saving, setSaving] = useState(false);
  const [prefillFile, setPrefillFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [prefillValues, setPrefillValues] = useState<Record<string, string> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runPrefill = async (file: File) => {
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/generate-template", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) {
        const detail =
          typeof data.message === "string" && data.message
            ? data.message
            : typeof data.error === "string"
            ? data.error
            : "";
        toast.error(detail ? `${tPrefill("error")} — ${detail}` : tPrefill("error"));
        return;
      }
      if (typeof data.name === "string" && data.name && !name) setName(data.name);
      if (typeof data.category === "string" && data.category && !category) setCategory(data.category);
      if (typeof data.bodyHtml === "string" && data.bodyHtml) setContent(data.bodyHtml);
      if (Array.isArray(data.variables)) {
        const values: Record<string, string> = {};
        const mapped: Variable[] = data.variables.map(
          (v: {
            key: string;
            label: string;
            type: string;
            required: boolean;
            category: string;
            value?: string;
          }) => {
            const key = slug(v.key);
            if (typeof v.value === "string") values[key] = v.value;
            return {
              tempId: crypto.randomUUID(),
              key: v.key,
              label: v.label,
              type: (["text", "date", "number", "select", "checkbox"].includes(v.type)
                ? v.type
                : "text") as VariableType,
              required: v.required,
              options: "",
              category: v.category ?? "",
            };
          }
        );
        setVariables(mapped);
        setPrefillValues(values);
      }
      toast.success(tPrefill("success"));
    } catch {
      toast.error(tPrefill("error"));
    } finally {
      setAnalyzing(false);
    }
  };

  const onPickPrefill = (f: File) => {
    if (!/\.(pdf|docx?)$/i.test(f.name)) {
      toast.error(tPrefill("unsupported"));
      return;
    }
    setPrefillFile(f);
    void runPrefill(f);
  };

  const addVariable = () => {
    setVariables((v) => [
      ...v,
      {
        tempId: crypto.randomUUID(),
        key: `variable_${v.length + 1}`,
        label: `Variable ${v.length + 1}`,
        type: "text",
        required: false,
        options: "",
        category: "",
      },
    ]);
  };

  const updateVariable = (id: string, patch: Partial<Variable>) => {
    setVariables((list) => list.map((v) => (v.tempId === id ? { ...v, ...patch } : v)));
  };
  const removeVariable = (id: string) => setVariables((list) => list.filter((v) => v.tempId !== id));

  const save = async () => {
    if (!name.trim()) {
      toast.error("Le nom du modèle est requis");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setSaving(false);
      toast.error("Non authentifié");
      return;
    }

    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({
        name,
        description: description || null,
        category: category || null,
        default_price: defaultPrice ? Number(defaultPrice) : null,
        body_html: content,
        created_by: user.user.id,
      })
      .select()
      .single();

    if (error || !tpl) {
      setSaving(false);
      toast.error(error?.message ?? "Erreur lors de l'enregistrement");
      return;
    }

    if (variables.length > 0) {
      const payload = variables.map((v, i) => ({
        template_id: tpl.id,
        key: slug(v.key),
        label: v.label,
        type: v.type,
        required: v.required,
        options: v.type === "select" && v.options ? v.options.split(",").map((s) => s.trim()).filter(Boolean) : null,
        category: v.category || null,
        order_index: i,
      }));
      await supabase.from("template_variables").insert(payload);
    }

    toast.success(t("saved"));
    router.push(`/${locale}/templates/${tpl.id}/edit`);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-display text-display-2">Nouveau modèle</h1>
        <Button onClick={save} disabled={saving} className="ms-auto">
          <Save className="h-4 w-4" />
          {t("save")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="border-accent/40 bg-accent/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-terracotta-deep" />
                {tPrefill("title")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{tPrefill("subtitle")}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickPrefill(f);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {analyzing
                    ? tPrefill("analyzing")
                    : prefillFile
                    ? tPrefill("change")
                    : tPrefill("upload")}
                </Button>
                {prefillFile && (
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <FileUp className="h-4 w-4 text-primary" />
                    <span className="max-w-[240px] truncate">{prefillFile.name}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{tPrefill("supported")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="tpl-name">{t("name")}</Label>
                <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tpl-desc">{t("description")}</Label>
                <Textarea id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tpl-cat">{t("category")}</Label>
                  <Input id="tpl-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Contrat, Procuration…" />
                </div>
                <div>
                  <Label htmlFor="tpl-price">{t("defaultPrice")}</Label>
                  <Input id="tpl-price" type="number" value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} placeholder="0" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("content")}</CardTitle>
            </CardHeader>
            <CardContent>
              <TemplateEditor content={content} onChange={setContent} />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-20">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{t("variables")}</CardTitle>
              <Button size="sm" variant="outline" onClick={addVariable}>
                <Plus className="h-4 w-4" />
                {t("addVariable")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
              {variables.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Ajoutez une variable pour créer un champ dynamique.
                </p>
              )}
              {variables.map((v) => (
                <div key={v.tempId} className="rounded-md border border-border/60 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="forest" className="font-mono">{`{{${slug(v.key)}}}`}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => removeVariable(v.tempId)} className="ms-auto h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("variableKey")}</Label>
                    <Input value={v.key} onChange={(e) => updateVariable(v.tempId, { key: e.target.value })} className="h-9 mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("variableLabel")}</Label>
                    <Input value={v.label} onChange={(e) => updateVariable(v.tempId, { label: e.target.value })} className="h-9 mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px]">{t("variableType")}</Label>
                    <Select value={v.type} onValueChange={(val) => updateVariable(v.tempId, { type: val as VariableType })}>
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{tTypes("text")}</SelectItem>
                        <SelectItem value="date">{tTypes("date")}</SelectItem>
                        <SelectItem value="number">{tTypes("number")}</SelectItem>
                        <SelectItem value="select">{tTypes("select")}</SelectItem>
                        <SelectItem value="checkbox">{tTypes("checkbox")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {v.type === "select" && (
                    <div>
                      <Label className="text-[10px]">Options (séparées par virgules)</Label>
                      <Input value={v.options} onChange={(e) => updateVariable(v.tempId, { options: e.target.value })} className="h-9 mt-1" />
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-[10px]">{t("variableRequired")}</Label>
                    <Switch checked={v.required} onCheckedChange={(c) => updateVariable(v.tempId, { required: c })} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
