"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Scale, LayoutDashboard, FileText, FolderOpen, Users, UsersRound, Receipt, Settings, Upload, Archive, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Resource } from "@/lib/permissions";

interface NavEntry {
  resource: Resource | "dashboard";
  labelKey: string;
  icon: LucideIcon;
  href: (locale: string) => string;
}

const NAV: NavEntry[] = [
  { resource: "dashboard", labelKey: "dashboard", icon: LayoutDashboard, href: (l) => `/${l}` },
  { resource: "templates", labelKey: "templates", icon: FileText, href: (l) => `/${l}/templates` },
  { resource: "documents", labelKey: "documents", icon: FolderOpen, href: (l) => `/${l}/documents` },
  { resource: "upload", labelKey: "upload", icon: Upload, href: (l) => `/${l}/upload` },
  { resource: "clients", labelKey: "clients", icon: Users, href: (l) => `/${l}/clients` },
  { resource: "invoices", labelKey: "invoices", icon: Receipt, href: (l) => `/${l}/invoices` },
  { resource: "archives", labelKey: "archives", icon: Archive, href: (l) => `/${l}/archives` },
  { resource: "employees", labelKey: "employees", icon: UsersRound, href: (l) => `/${l}/employees` },
  { resource: "settings", labelKey: "settings", icon: Settings, href: (l) => `/${l}/settings` },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("nav");

  const visible = NAV;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Scale className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-lg">Commitforce</div>
          <div className="text-xs text-muted-foreground">Cabinet Chaib</div>
        </div>
      </div>

      <div className="px-4">
        <div className="divider-wave opacity-40" />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {visible.map((item) => {
          const href = item.href(locale);
          const active = pathname === href || (href !== `/${locale}` && pathname.startsWith(href));
          const Icon = item.icon;
          return (
            <Link
              key={item.resource}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground/80 hover:bg-card hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{t(item.labelKey)}</span>
              {active && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-accent" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4 text-xs text-muted-foreground">
        <div>Version 0.1 · Avril 2026</div>
      </div>
    </div>
  );
}
