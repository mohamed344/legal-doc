"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { FileText, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-states/empty";
import { createClient } from "@/lib/supabase/client";
import { formatDA, formatDate } from "@/lib/utils";
import type { Template } from "@/lib/supabase/types";

export default function TemplatesPage() {
  const t = useTranslations("templates");
  const tCols = useTranslations("templates.columns");
  const locale = useLocale();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [renameTarget, setRenameTarget] = useState<Template | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("templates")
      .select("*")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false });
    setTemplates((data as Template[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const openRename = (tpl: Template) => {
    setRenameTarget(tpl);
    setRenameValue(tpl.name);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    setBusy(true);
    const { error } = await createClient()
      .from("templates")
      .update({ name })
      .eq("id", renameTarget.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("renamed"));
    setRenameTarget(null);
    await load();
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const { error } = await createClient()
      .from("templates")
      .update({ is_archived: true })
      .eq("id", deleteTarget.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("deleted"));
    setDeleteTarget(null);
    await load();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">Modèles</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 max-w-xl">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/${locale}/templates/new`}>
              <Plus className="h-4 w-4" />
              {t("createManual")}
            </Link>
          </Button>
        </div>
      </header>

      {templates === null ? (
        <Card className="divide-y">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-60" />
              </div>
            </div>
          ))}
        </Card>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("empty")}
          description="Commencez par créer un modèle manuellement ou laissez l'IA l'extraire d'un document existant."
          action={
            <div className="flex justify-center gap-2">
              <Button asChild>
                <Link href={`/${locale}/templates/new`}>
                  <Plus className="h-4 w-4" />
                  {t("createManual")}
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tCols("name")}</TableHead>
                <TableHead>{tCols("category")}</TableHead>
                <TableHead className="text-end">{tCols("price")}</TableHead>
                <TableHead>{tCols("updated")}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((tpl) => (
                <TableRow key={tpl.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/${locale}/templates/${tpl.id}/edit`} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">{tpl.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{tpl.description ?? "—"}</div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {tpl.category ? <Badge variant="sand">{tpl.category}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-end numerals-display">
                    {tpl.default_price != null ? formatDA(tpl.default_price) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(tpl.updated_at, locale)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={tCols("actions")}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openRename(tpl)}>
                          <Pencil className="h-4 w-4" />
                          {t("rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setDeleteTarget(tpl)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("renameTitle")}</DialogTitle>
            <DialogDescription>{t("renameDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("nameLabel")}</label>
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={t("namePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button onClick={submitRename} disabled={busy || !renameValue.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={submitDelete} disabled={busy}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
