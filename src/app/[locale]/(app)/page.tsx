"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { FileText, FolderOpen, Receipt, Users, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { createClient } from "@/lib/supabase/client";

type StatKey = "templates" | "monthlyDocs" | "pendingInvoices" | "clients";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tActions = useTranslations("dashboard.quickActions");
  const locale = useLocale();
  const { profile } = useAuth();

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  const [counts, setCounts] = useState<Record<StatKey, number>>({
    templates: 0,
    monthlyDocs: 0,
    pendingInvoices: 0,
    clients: 0,
  });
  const [latestDoc, setLatestDoc] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [templatesRes, monthlyDocsRes, pendingInvoicesRes, clientsRes, latestDocRes] =
        await Promise.all([
          supabase
            .from("templates")
            .select("*", { count: "exact", head: true })
            .eq("is_archived", false),
          supabase
            .from("documents")
            .select("*", { count: "exact", head: true })
            .eq("is_archived", false)
            .gte("created_at", monthStart.toISOString()),
          supabase
            .from("invoices")
            .select("*", { count: "exact", head: true })
            .eq("is_archived", false)
            .neq("status", "payee"),
          supabase.from("clients").select("*", { count: "exact", head: true }),
          supabase
            .from("documents")
            .select("id, name, updated_at")
            .eq("is_archived", false)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (cancelled) return;

      setCounts({
        templates: templatesRes.count ?? 0,
        monthlyDocs: monthlyDocsRes.count ?? 0,
        pendingInvoices: pendingInvoicesRes.count ?? 0,
        clients: clientsRes.count ?? 0,
      });
      const doc = latestDocRes.data as { id: string; name: string } | null;
      setLatestDoc(doc ? { id: doc.id, name: doc.name } : null);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats: { labelKey: StatKey; icon: typeof FileText }[] = [
    { labelKey: "templates", icon: FileText },
    { labelKey: "monthlyDocs", icon: FolderOpen },
    { labelKey: "pendingInvoices", icon: Receipt },
    { labelKey: "clients", icon: Users },
  ];

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Hero header */}
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-[0.22em] text-terracotta-deep">
          {t("subtitle")}
        </div>
        <h1 className="font-display text-display-1 leading-tight">
          {t("welcome", { name: firstName || "—" })}
        </h1>
        <div className="divider-wave max-w-[120px] opacity-60" />
      </header>

      {/* Asymmetric bento */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Hero card */}
        <Card className="lg:col-span-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-forest/5 via-transparent to-accent/10 pointer-events-none" />
          <CardHeader className="relative">
            <div className="flex items-center justify-between">
              <div>
                <Badge variant="sand" className="mb-3">
                  {t("latestDocument")}
                </Badge>
                <CardTitle className="text-2xl md:text-3xl max-w-md">
                  {latestDoc ? latestDoc.name : t("noLatest")}
                </CardTitle>
              </div>
              <div className="hidden md:flex h-20 w-20 items-center justify-center rounded-full bg-forest/10">
                <FolderOpen className="h-9 w-9 text-forest" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <Button asChild variant="default">
              <Link
                href={
                  latestDoc
                    ? `/${locale}/documents/${latestDoc.id}`
                    : `/${locale}/templates`
                }
              >
                {tActions("newTemplate")}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{tActions("title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction href={`/${locale}/templates/new`} label={tActions("newTemplate")} icon={FileText} />
            <QuickAction href={`/${locale}/invoices/new`} label={tActions("newInvoice")} icon={Receipt} />
            <QuickAction href={`/${locale}/clients`} label={tActions("addClient")} icon={Users} />
          </CardContent>
        </Card>
      </section>

      {/* Stats grid */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.labelKey} className="transition-transform hover:-translate-y-0.5">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t(`stats.${s.labelKey}` as any)}
                  </span>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="numerals-display text-4xl text-foreground">
                  {loading ? <span className="text-muted-foreground/50">—</span> : counts[s.labelKey]}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Recent activity placeholder */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl">{t("recentActivity")}</h2>
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>Les événements récents apparaîtront ici dès que vous commencerez à utiliser Commitforce.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function QuickAction({
  href,
  label,
  icon: Icon,
  accent,
}: {
  href: string;
  label: string;
  icon: typeof FileText;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 hover:border-primary/40 hover:bg-background/40 transition-colors"
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-md ${
          accent ? "bg-accent/20 text-terracotta-deep" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium">{label}</span>
      <ArrowUpRight className="h-4 w-4 ms-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
