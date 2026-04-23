"use client";

import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Command as CommandPrimitive } from "cmdk";
import { Search, FileText, FolderOpen, Users, Receipt, LayoutDashboard } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface Ctx {
  open: boolean;
  setOpen: (v: boolean) => void;
}
const CommandCtx = createContext<Ctx>({ open: false, setOpen: () => {} });

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <CommandCtx.Provider value={{ open, setOpen }}>{children}</CommandCtx.Provider>;
}

export function useCommandPalette() {
  return useContext(CommandCtx);
}

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("nav");

  const go = (path: string) => {
    setOpen(false);
    router.push(`/${locale}${path}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-xl gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>
        <CommandPrimitive className="flex h-full flex-col" loop>
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <CommandPrimitive.Input
              placeholder={t("searchPlaceholder")}
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandPrimitive.List className="max-h-80 overflow-y-auto p-2">
            <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              Aucun résultat
            </CommandPrimitive.Empty>
            <CommandPrimitive.Group
              heading="Navigation"
              className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1"
            >
              <Item onSelect={() => go("")} icon={LayoutDashboard} label={t("dashboard")} />
              <Item onSelect={() => go("/templates")} icon={FileText} label={t("templates")} />
              <Item onSelect={() => go("/documents")} icon={FolderOpen} label={t("documents")} />
              <Item onSelect={() => go("/clients")} icon={Users} label={t("clients")} />
              <Item onSelect={() => go("/invoices")} icon={Receipt} label={t("invoices")} />
            </CommandPrimitive.Group>
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function Item({
  onSelect,
  icon: Icon,
  label,
}: {
  onSelect: () => void;
  icon: typeof Search;
  label: string;
}) {
  return (
    <CommandPrimitive.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-sand"
    >
      <Icon className="h-4 w-4" />
      {label}
    </CommandPrimitive.Item>
  );
}
