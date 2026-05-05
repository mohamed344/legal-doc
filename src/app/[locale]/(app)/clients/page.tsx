"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Users, UserRound, Mail, Phone, Pencil, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-states/empty";
import { ClientDocumentPicker } from "@/components/clients/document-picker";
import { createClient } from "@/lib/supabase/client";
import type { Client } from "@/lib/supabase/types";

type FormState = { name: string; email: string; phone: string; address: string; notes: string };

const EMPTY_FORM: FormState = { name: "", email: "", phone: "", address: "", notes: "" };

export default function ClientsPage() {
  const t = useTranslations("clients");
  const locale = useLocale();
  const [rows, setRows] = useState<Client[] | null>(null);
  const [editing, setEditing] = useState<Client | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [originalDocIds, setOriginalDocIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await createClient().from("clients").select("*").order("created_at", { ascending: false });
    setRows((data as Client[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDocIds([]);
    setOriginalDocIds([]);
    setEditing(null);
  };

  const openEdit = async (c: Client) => {
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      notes: c.notes ?? "",
    });
    const { data } = await createClient()
      .from("documents")
      .select("id")
      .eq("client_id", c.id)
      .eq("is_archived", false);
    const ids = ((data as { id: string }[] | null) ?? []).map((d) => d.id);
    setDocIds(ids);
    setOriginalDocIds(ids);
    setEditing(c);
  };

  const closeDialog = () => setEditing(undefined);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    setSaving(true);
    const s = createClient();

    let clientId: string | null = null;
    if (editing) {
      const { error } = await s.from("clients").update(form).eq("id", editing.id);
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
      clientId = editing.id;
    } else {
      const { data: u } = await s.auth.getUser();
      const { data: inserted, error } = await s
        .from("clients")
        .insert({ ...form, created_by: u.user!.id })
        .select("id")
        .single();
      if (error || !inserted) {
        setSaving(false);
        return toast.error(error?.message ?? "Erreur");
      }
      clientId = (inserted as { id: string }).id;
    }

    const toAdd = docIds.filter((id) => !originalDocIds.includes(id));
    const toRemove = originalDocIds.filter((id) => !docIds.includes(id));

    const ops: PromiseLike<{ error: { message: string } | null }>[] = [];
    if (toAdd.length) {
      ops.push(s.from("documents").update({ client_id: clientId }).in("id", toAdd));
    }
    if (toRemove.length) {
      ops.push(s.from("documents").update({ client_id: null }).in("id", toRemove));
    }
    const results = await Promise.all(ops);
    const failure = results.find((r) => r.error);

    setSaving(false);
    if (failure?.error) {
      toast.error(failure.error.message);
    } else {
      toast.success(editing ? "Client mis à jour" : "Client ajouté");
    }
    closeDialog();
    load();
  };

  const dialogOpen = editing !== undefined;

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep mb-2">Portefeuille</div>
          <h1 className="font-display text-display-2">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("add")}
        </Button>
      </header>

      {rows === null ? (
        <div className="text-muted-foreground">Chargement…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title={t("empty")} action={<Button onClick={openCreate}><Plus className="h-4 w-4" />{t("add")}</Button>} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("phone")}</TableHead>
                <TableHead className="w-12 text-end">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-terracotta-deep">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">{c.name}</div>
                        {c.address && <div className="text-xs text-muted-foreground">{c.address}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.email ? (
                      <span className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5" />
                        {c.email}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.phone ? (
                      <span className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" />
                        {c.phone}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        aria-label={t("viewDocuments")}
                        title={t("viewDocuments")}
                      >
                        <Link href={`/${locale}/documents?client=${c.id}`}>
                          <FolderOpen className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(c)}
                        aria-label={t("edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("edit") : t("add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("name")} *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{t("email")}</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>{t("phone")}</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>{t("address")}</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>{t("notes")}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {dialogOpen && (
              <div>
                <Label>{t("documents")}</Label>
                <ClientDocumentPicker
                  currentClientId={editing?.id}
                  value={docIds}
                  onChange={setDocIds}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
