import { LETTERHEAD_HTML } from "@/lib/pdf/letterhead";
import { cn } from "@/lib/utils";

interface LetterheadProps {
  className?: string;
}

export function Letterhead({ className }: LetterheadProps) {
  return (
    <div
      aria-label="Letterhead"
      dir="rtl"
      lang="ar"
      className={cn(
        "letterhead-static select-none pointer-events-none",
        "border-b border-border/70 pb-4 mb-4",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:table-fixed",
        "[&_td]:align-top [&_td]:px-1 [&_td]:py-0",
        "[&_p]:my-0.5",
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-1",
        "[&_img]:inline-block [&_img]:max-h-28 [&_img]:w-auto",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: LETTERHEAD_HTML }}
    />
  );
}
