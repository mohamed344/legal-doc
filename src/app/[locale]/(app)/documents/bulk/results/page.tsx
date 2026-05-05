"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { ArrowLeft, Download, FileText, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { Document } from "@/lib/supabase/types";

export default function BulkResultsPage() {
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const idsParam = search.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const [docs, setDocs] = useState<Document[] | null>(null);

  useEffect(() => {
    if (!ids.length) return;
    const load = async () => {
      const { data } = await createClient()
        .from("documents")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: true });
      setDocs((data as Document[]) ?? []);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam]);

  const zipUrl = `/api/documents/bulk/pdf?ids=${idsParam}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/${locale}/documents`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-display-2 truncate">Documents générés</h1>
          <p className="text-muted-foreground mt-1">
            {ids.length} document{ids.length > 1 ? "s" : ""} créé{ids.length > 1 ? "s" : ""} et enregistré{ids.length > 1 ? "s" : ""}.
          </p>
        </div>
        <Button asChild size="lg">
          <a href={zipUrl}>
            <Package className="h-4 w-4" />
            Télécharger tout (ZIP)
          </a>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Liste</CardTitle>
        </CardHeader>
        <CardContent>
          {docs === null ? (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aucun document.</div>
          ) : (
            <div className="divide-y divide-border/60">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Link
                      href={`/${locale}/documents/${d.id}`}
                      className="font-medium truncate hover:underline"
                    >
                      {d.name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4" />
                        PDF
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
