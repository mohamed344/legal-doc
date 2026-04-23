import { useTranslations } from "next-intl";
import { Scale } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Left marketing panel — hidden on mobile */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-forest text-paper p-12">
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><defs><pattern id='p' width='60' height='60' patternUnits='userSpaceOnUse'><path d='M 60 0 L 0 0 0 60' fill='none' stroke='%23F5EBD6' stroke-width='0.4'/></pattern></defs><rect width='100%' height='100%' fill='url(%23p)'/></svg>\")",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-paper/15 border border-paper/20">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-2xl">Commitforce</div>
            <div className="text-paper/70 text-sm">Gestion documentaire juridique</div>
          </div>
        </div>

        <div className="relative space-y-6">
          <blockquote className="font-display text-3xl leading-snug max-w-md">
            « La minutie d'un acte juridique mérite des outils à la hauteur. »
          </blockquote>
          <div className="divider-wave max-w-[100px] opacity-60" />
          <p className="text-paper/70 max-w-md leading-relaxed">
            Créez vos modèles, remplissez-les en quelques clics, facturez sans friction. Commitforce rassemble tout le cycle documentaire de votre cabinet dans un seul espace.
          </p>
        </div>

        <div className="relative text-xs text-paper/50">© Commitforce — Avril 2026</div>
      </aside>

      {/* Right form */}
      <main className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
