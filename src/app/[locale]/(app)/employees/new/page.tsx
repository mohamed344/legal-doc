"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-states/empty";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/auth-context";
import { friendlyAuthError } from "@/lib/friendly-errors";
import type { Template } from "@/lib/supabase/types";

type TemplateRow = Pick<Template, "id" | "name" | "category">;

interface PermissionState {
  selected: boolean;
  can_create: boolean;
  can_edit: boolean;
}

export default function NewEmployeePage() {
  const t = useTranslations("employees.newUser");
  const tEmployees = useTranslations("employees");
  const locale = useLocale() as "fr" | "ar";
  const router = useRouter();
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [perms, setPerms] = useState<Record<string, PermissionState>>({});
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    full_name: z.string().min(2, t("errors.required")),
    email: z.string().email(t("errors.invalidEmail")),
    password: z.string().min(8, t("errors.passwordTooShort")),
    role: z.literal("employe"),
    is_active: z.boolean(),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", password: "", role: "employe", is_active: true },
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await createClient()
        .from("templates")
        .select("id, name, category")
        .order("name", { ascending: true });
      setTemplates((data as TemplateRow[]) ?? []);
    };
    load();
  }, []);

  if (profile && profile.role !== "admin") {
    return (
      <EmptyState icon={ShieldAlert} title={tEmployees("adminOnly")} description={t("errors.forbidden")} />
    );
  }

  const togglePerm = (id: string, key: "selected" | "can_create" | "can_edit") => {
    setPerms((prev) => {
      const current = prev[id] ?? { selected: false, can_create: true, can_edit: false };
      const next = { ...current, [key]: !current[key] };
      if (key === "can_create" || key === "can_edit") {
        next.selected = next.can_create || next.can_edit;
      } else if (key === "selected" && next.selected && !current.can_create && !current.can_edit) {
        next.can_create = true;
      }
      return { ...prev, [id]: next };
    });
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    const permissions = Object.entries(perms)
      .filter(([, p]) => p.selected && (p.can_create || p.can_edit))
      .map(([template_id, p]) => ({
        template_id,
        can_create: p.can_create,
        can_edit: p.can_edit,
      }));

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, permissions }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(friendlyAuthError(data.error, locale, t("errors.generic")));
        return;
      }
      toast.success(t("success"));
      router.push(`/${locale}/employees`);
      router.refresh();
    } catch {
      toast.error(friendlyAuthError("network", locale, t("errors.generic")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-1">{t("section")}</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("identityTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="full_name">{tEmployees("name")}</Label>
              <Input id="full_name" {...form.register("full_name")} />
              {form.formState.errors.full_name && (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.full_name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="email">{tEmployees("email")}</Label>
              <Input id="email" type="email" autoComplete="off" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <PasswordInput id="password" autoComplete="new-password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("accessTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 p-3">
              <div>
                <div className="font-medium text-sm">{t("isActive")}</div>
                <div className="text-xs text-muted-foreground">
                  {form.watch("is_active") ? tEmployees("active") : tEmployees("inactive")}
                </div>
              </div>
              <Switch
                checked={form.watch("is_active")}
                onCheckedChange={(v) => form.setValue("is_active", v)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("permissionsTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("permissionsSubtitle")}</p>
          </CardHeader>
          <CardContent>
            {templates === null ? (
              <div className="text-muted-foreground text-sm">Chargement…</div>
            ) : templates.length === 0 ? (
              <div className="text-muted-foreground text-sm">{t("noTemplates")}</div>
            ) : (
              <div className="divide-y divide-border/60">
                {templates.map((tpl) => {
                  const state = perms[tpl.id] ?? { selected: false, can_create: true, can_edit: false };
                  return (
                    <div key={tpl.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Checkbox
                          checked={state.selected}
                          onCheckedChange={() => togglePerm(tpl.id, "selected")}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{tpl.name}</div>
                          {tpl.category && (
                            <div className="text-xs text-muted-foreground">{tpl.category}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={state.can_create}
                            disabled={!state.selected}
                            onCheckedChange={() => togglePerm(tpl.id, "can_create")}
                          />
                          <span>{t("canCreate")}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={state.can_edit}
                            disabled={!state.selected}
                            onCheckedChange={() => togglePerm(tpl.id, "can_edit")}
                          />
                          <span>{t("canEdit")}</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
