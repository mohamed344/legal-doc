"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Search, Menu, Globe, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/auth-context";
import { roleLabel } from "@/lib/roles";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { CommandPalette, useCommandPalette } from "./command-palette";

export function Topbar() {
  const t = useTranslations("nav");
  const locale = useLocale() as "fr" | "ar";
  const router = useRouter();
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { setOpen } = useCommandPalette();
  const [sheetOpen, setSheetOpen] = useState(false);

  const switchLocale = (next: "fr" | "ar") => {
    const stripped = pathname.replace(/^\/(fr|ar)/, "");
    router.push(`/${next}${stripped}`);
  };

  const initials = (profile?.full_name ?? "")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4 md:px-8">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={locale === "ar" ? "right" : "left"} className="w-72 p-0">
              <Sidebar onNavigate={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>

          <button
            onClick={() => setOpen(true)}
            className="flex-1 max-w-xl flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2 text-start text-sm text-muted-foreground hover:bg-card transition-colors cursor-pointer"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 truncate">{t("searchPlaceholder")}</span>
            <kbd className="hidden md:inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          <div className="ms-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Langue">
                  <Globe className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => switchLocale("fr")}>
                  <span className="font-display">Français</span>
                  {locale === "fr" && <span className="ms-auto text-primary">•</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchLocale("ar")}>
                  <span className="font-display">العربية</span>
                  {locale === "ar" && <span className="ms-auto text-primary">•</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-card cursor-pointer">
                  <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-primary/15 text-primary">
                      {initials ? initials : <UserRound className="h-5 w-5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-start leading-tight max-w-[160px]">
                    <div className="text-sm font-medium truncate">
                      {profile?.full_name ?? (profile === null ? "…" : "Utilisateur")}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {profile ? roleLabel(profile.role, locale) : ""}
                    </div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{profile?.full_name ?? "—"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push(`/${locale}/settings`)}>
                  <UserRound className="h-4 w-4" />
                  {t("settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <CommandPalette />
    </>
  );
}
