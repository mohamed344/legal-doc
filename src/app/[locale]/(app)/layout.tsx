import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPaletteProvider } from "@/components/layout/command-palette";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <CommandPaletteProvider>
        <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr]">
          <aside className="hidden lg:block border-e border-border/60 bg-sidebar">
            <div className="sticky top-0 h-screen">
              <Sidebar />
            </div>
          </aside>
          <div className="flex min-w-0 flex-col">
            <Topbar />
            <main className="flex-1 px-4 py-8 md:px-8 md:py-10">
              <div className="mx-auto w-full max-w-7xl">{children}</div>
            </main>
          </div>
        </div>
      </CommandPaletteProvider>
    </TooltipProvider>
  );
}
