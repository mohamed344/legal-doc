"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { UsersRound, ShieldAlert, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { formatDate } from "@/lib/utils";
import type { AppUser } from "@/lib/supabase/types";

type EmployeeRow = AppUser & { roles: { name: string; is_admin: boolean } | null };
type RoleOption = { id: string; name: string; is_admin: boolean };

export default function EmployeesPage() {
  const t = useTranslations("employees");
  const tRoles = useTranslations("employees.roles");
  const locale = useLocale() as "fr" | "ar";
  const { profile } = useAuth();
  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);

  const loadRows = async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      console.error("[employees] /api/admin/users failed", res.status, data);
      toast.error(`${res.status}: ${data?.error ?? "fetch_failed"}`);
      setRows([]);
      return;
    }
    setRows((data.users as EmployeeRow[] | null) ?? []);
  };

  const loadRoles = async () => {
    const res = await fetch("/api/admin/roles", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) return;
    setRoleOptions(((data.roles as RoleOption[]) ?? []).filter((r) => !r.is_admin));
  };

  useEffect(() => {
    loadRows();
    loadRoles();
  }, []);

  if (profile && !profile.is_admin) {
    return (
      <EmptyState icon={ShieldAlert} title={t("adminOnly")} description="Cette section est réservée aux administrateurs du cabinet." />
    );
  }

  const toggleActive = async (row: EmployeeRow) => {
    const next = !row.is_active;
    const { error } = await createClient().from("users").update({ is_active: next }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next ? t("active") : t("inactive"));
    await loadRows();
  };

  const changeRole = async (row: EmployeeRow, nextRoleId: string) => {
    if (nextRoleId === row.role_id) return;
    setPendingRoleId(row.id);
    const res = await fetch(`/api/admin/users/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: nextRoleId }),
    });
    const data = await res.json().catch(() => null);
    setPendingRoleId(null);
    if (!res.ok || !data?.ok) {
      toast.error(`${res.status}: ${data?.error ?? "update_failed"}`);
      return;
    }
    toast.success(t("roleUpdated"));
    await loadRows();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">Équipe</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/${locale}/employees/roles`}>
              <ShieldCheck className="h-4 w-4" />
              {tRoles("manageRoles")}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/${locale}/employees/new`}>
              <Plus className="h-4 w-4" />
              {t("add")}
            </Link>
          </Button>
        </div>
      </header>

      {rows === null ? (
        <div className="text-muted-foreground">Chargement…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Aucun employé"
          description="Les employés apparaîtront ici après leur inscription."
          action={
            <Button asChild>
              <Link href={`/${locale}/employees/new`}>
                <Plus className="h-4 w-4" />
                {t("add")}
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>Rejoint le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.phone ?? ""}</div>
                  </TableCell>
                  <TableCell>
                    {r.roles?.is_admin || r.id === profile?.id ? (
                      <Badge variant={r.roles?.is_admin ? "forest" : "sand"}>
                        {r.roles?.name ?? "—"}
                      </Badge>
                    ) : (
                      <Select
                        value={r.role_id}
                        disabled={pendingRoleId === r.id || roleOptions.length === 0}
                        onValueChange={(nextId) => changeRole(r, nextId)}
                      >
                        <SelectTrigger className="h-8 w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                      <span className="text-sm text-muted-foreground">
                        {r.is_active ? t("active") : t("inactive")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.created_at, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
