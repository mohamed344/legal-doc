"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldAlert, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-states/empty";
import { useAuth } from "@/context/auth-context";
import { friendlyAuthError } from "@/lib/friendly-errors";
import {
  RolePermissionGrid,
  emptyGrants,
  grantsToList,
  type GrantMap,
} from "@/components/employees/role-permission-grid";

interface RoleOption {
  id: string;
  name: string;
  is_system: boolean;
  is_admin: boolean;
}

export default function NewEmployeePage() {
  const t = useTranslations("employees.newUser");
  const tEmployees = useTranslations("employees");
  const locale = useLocale() as "fr" | "ar";
  const router = useRouter();
  const { profile } = useAuth();

  const [roles, setRoles] = useState<RoleOption[] | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleGrants, setNewRoleGrants] = useState<GrantMap>(emptyGrants());
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    full_name: z.string().min(2, t("errors.required")),
    email: z.string().email(t("errors.invalidEmail")),
    password: z.string().min(8, t("errors.passwordTooShort")),
    is_active: z.boolean(),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", password: "", is_active: true },
  });

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/admin/roles", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        const list = (data.roles ?? []) as RoleOption[];
        setRoles(list);
        const firstAssignable = list.find((r) => !r.is_admin);
        if (firstAssignable) setSelectedRoleId(firstAssignable.id);
      } else {
        setRoles([]);
      }
    };
    load();
  }, []);

  if (profile && !profile.is_admin) {
    return (
      <EmptyState icon={ShieldAlert} title={tEmployees("adminOnly")} description={t("errors.forbidden")} />
    );
  }

  const onSubmit = async (values: FormValues) => {
    let role_id: string | null = null;

    if (mode === "existing") {
      if (!selectedRoleId) {
        toast.error(t("roleRequired"));
        return;
      }
      role_id = selectedRoleId;
    } else {
      const trimmed = newRoleName.trim();
      if (trimmed.length < 2) {
        toast.error(t("roleNameRequired"));
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "new") {
        const trimmed = newRoleName.trim();
        const permissions = grantsToList(newRoleGrants);
        const roleRes = await fetch("/api/admin/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, permissions }),
        });
        const roleData = await roleRes.json();
        if (!roleRes.ok || !roleData.ok) {
          toast.error(
            roleRes.status === 409
              ? t("errors.roleCreateFailed")
              : roleData.error ?? t("errors.roleCreateFailed")
          );
          return;
        }
        role_id = roleData.role.id;
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, role_id }),
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

  const assignableRoles = (roles ?? []).filter((r) => !r.is_admin);

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 mt-1" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
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
            <CardTitle>{t("roleTitle")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("roleSubtitle")}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "existing" ? (
              <>
                <div>
                  <Label>{t("selectRole")}</Label>
                  {roles === null ? (
                    <div className="text-muted-foreground text-sm">…</div>
                  ) : assignableRoles.length === 0 ? (
                    <div className="text-muted-foreground text-sm">{t("noRoles")}</div>
                  ) : (
                    <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectRolePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("new")}
                >
                  <Plus className="h-4 w-4" />
                  {t("createNewRole")}
                </Button>
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="new_role_name">{t("roleName")}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setMode("existing")}
                    >
                      <X className="h-4 w-4" />
                      {t("useExistingRole")}
                    </Button>
                  </div>
                  <Input
                    id="new_role_name"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder={t("roleName")}
                  />
                </div>
                <RolePermissionGrid
                  value={newRoleGrants}
                  onChange={setNewRoleGrants}
                  disabled={submitting}
                />
              </>
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
