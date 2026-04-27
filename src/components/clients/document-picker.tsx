"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Document, Template } from "@/lib/supabase/types";

type Props = {
  currentClientId?: string;
  value: string[];
  onChange: (ids: string[]) => void;
};

type Row = Pick<Document, "id" | "name" | "template_id" | "created_at">;

export function ClientDocumentPicker({ currentClientId, value, onChange }: Props) {
  const t = useTranslations("clients");
  const locale = useLocale();
  const [docs, setDocs] = useState<Row[] | null>(null);
  const [tplNameById, setTplNameById] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      let q = supabase
        .from("documents")
        .select("id, name, template_id, created_at, client_id")
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      q = currentClientId
        ? q.or(`client_id.is.null,client_id.eq.${currentClientId}`)
        : q.is("client_id", null);

      const { data: docsData } = await q;
      const rows = (docsData as Row[] | null) ?? [];

      const tplIds = Array.from(new Set(rows.map((r) => r.template_id)));
      let tplMap: Record<string, string> = {};
      if (tplIds.length) {
        const { data: tpls } = await supabase
          .from("templates")
          .select("id, name")
          .in("id", tplIds);
        tplMap = Object.fromEntries(
          ((tpls as Pick<Template, "id" | "name">[] | null) ?? []).map((tpl) => [tpl.id, tpl.name]),
        );
      }

      if (cancelled) return;
      setDocs(rows);
      setTplNameById(tplMap);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [currentClientId]);

  const filtered = useMemo(() => {
    if (!docs) return null;
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.name.toLowerCase().includes(q));
  }, [docs, query]);

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (!value.includes(id)) onChange([...value, id]);
    } else {
      onChange(value.filter((v) => v !== id));
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchDocuments")}
          className="ps-9"
        />
      </div>
      <ScrollArea className="h-48 rounded-md border border-border/60">
        {filtered === null ? (
          <div className="p-3 text-sm text-muted-foreground">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">{t("noUnassignedDocs")}</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {filtered.map((d) => {
              const checked = value.includes(d.id);
              return (
                <li key={d.id}>
                  <label className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-background/40">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => toggle(d.id, c === true)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{d.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {tplNameById[d.template_id] ?? "—"} · {formatDate(d.created_at, locale)}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
