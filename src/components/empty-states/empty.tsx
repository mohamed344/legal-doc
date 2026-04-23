import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-10 text-center", className)}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sand/80 text-muted-foreground mb-4">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-display text-xl mb-2">{title}</h3>
      {description && <p className="text-muted-foreground max-w-md mx-auto mb-6">{description}</p>}
      {action}
    </Card>
  );
}
