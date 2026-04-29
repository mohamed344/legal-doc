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
import { EmptyState } from "@/components/empty-states/empty";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/auth-context";
import { formatDate } from "@/lib/utils";
import type { AppUser } from "@/lib/supabase/types";

type EmployeeRow = AppUser & { roles: { name: string; is_admin: boolean } | null };

export default function EmployeesPage() {
  const t = useTranslations("employees");
  const tRoles = useTranslations("employees.roles");
  const locale = useLocale() as "fr" | "ar";
  const { profile } = useAuth();
  const [rows, setRows] = useState<EmployeeRow[] | null>(null);

  const loadRows = async () => {
    const { data } = await createClient()
      .from("users")
      .select("*, roles(name, is_admin)")
      .order("created_at", { ascending: false });
    setRows((data as EmployeeRow[] | null) ?? []);
  };

  useEffect(() => {
    loadRows();
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
                    <Badge variant={r.roles?.is_admin ? "forest" : "sand"}>
                      {r.roles?.name ?? "—"}
                    </Badge>
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
        </Card>
      )}
    </div>
  );
}
