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
        "letterhead-static select-none pointer-events-none text-right",
        "border-b border-border/70 pb-4 mb-4",
        "[&_img]:mx-auto [&_img]:block [&_img]:max-h-28 [&_img]:w-auto",
        "[&_p]:my-0.5",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: LETTERHEAD_HTML }}
    />
  );
}
