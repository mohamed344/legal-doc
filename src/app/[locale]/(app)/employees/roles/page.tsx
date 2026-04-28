"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-states/empty";
import { useAuth } from "@/context/auth-context";
import {
  RolePermissionGrid,
  emptyGrants,
  grantsToList,
  listToGrants,
  type GrantMap,
} from "@/components/employees/role-permission-grid";

interface RoleRow {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  grant_count: number;
  user_count: number;
}

export default function RolesPage() {
  const t = useTranslations("employees.roles");
  const tEmployees = useTranslations("employees");
  const locale = useLocale() as "fr" | "ar";
  const { profile } = useAuth();

  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [name, setName] = useState("");
  const [grants, setGrants] = useState<GrantMap>(emptyGrants());
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/admin/roles", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setRoles(data.roles as RoleRow[]);
    else setRoles([]);
  };

  useEffect(() => {
    refresh();
  }, []);

  if (profile && profile.role !== "admin") {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={tEmployees("adminOnly")}
        description=""
      />
    );
  }

  const openNew = () => {
    setEditing(null);
    setName("");
    setGrants(emptyGrants());
    setOpen(true);
  };

  const openEdit = async (row: RoleRow) => {
    if (row.is_system) {
      toast.error(t("cannotDeleteSystem"));
      return;
    }
    const res = await fetch(`/api/admin/roles/${row.id}`, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) {
      toast.error(data.error ?? "");
      return;
    }
    setEditing(row);
    setName(row.name);
    setGrants(listToGrants(data.permissions ?? []));
    setOpen(true);
  };

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error(t("nameInUse"));
      return;
    }
    setSubmitting(true);
    try {
      const permissions = grantsToList(grants);
      if (editing) {
        const res = await fetch(`/api/admin/roles/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, permissions }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error === "23505" ? t("nameInUse") : data.error ?? "");
          return;
        }
        toast.success(t("updateSuccess"));
      } else {
        const res = await fetch(`/api/admin/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, permissions }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(res.status === 409 ? t("nameInUse") : data.error ?? "");
          return;
        }
        toast.success(t("createSuccess"));
      }
      setOpen(false);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (row: RoleRow) => {
    if (row.is_system) {
      toast.error(t("cannotDeleteSystem"));
      return;
    }
    if (row.user_count > 0) {
      toast.error(t("cannotDeleteAssigned"));
      return;
    }
    if (!confirm(t("deleteConfirm"))) return;
    const res = await fetch(`/api/admin/roles/${row.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      toast.error(res.status === 409 ? t("cannotDeleteAssigned") : data.error ?? "");
      return;
    }
    toast.success(t("deleteSuccess"));
    await refresh();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/${locale}/employees`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">
              {tEmployees("title")}
            </div>
            <h1 className="font-display text-display-2">{t("pageTitle")}</h1>
            <p className="text-muted-foreground mt-1">{t("pageSubtitle")}</p>
          </div>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          {t("newRole")}
        </Button>
      </header>

      {roles === null ? (
        <div className="text-muted-foreground">…</div>
      ) : roles.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t("empty")}
          description={t("pageSubtitle")}
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              {t("newRole")}
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("grantsCount")}</TableHead>
                <TableHead>{t("usersCount")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      {r.is_system && (
                        <Badge variant="sand" className="text-[10px]">
                          {t("system")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.grant_count}</TableCell>
                  <TableCell className="text-muted-foreground">{r.user_count}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(r)}
                        disabled={r.is_system}
                        aria-label={t("editRole")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(r)}
                        disabled={r.is_system || r.user_count > 0}
                        aria-label={t("deleteRole")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? t("editRole") : t("newRole")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="role_name">{t("name")}</Label>
              <Input
                id="role_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <RolePermissionGrid value={grants} onChange={setGrants} disabled={submitting} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button onClick={onSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
