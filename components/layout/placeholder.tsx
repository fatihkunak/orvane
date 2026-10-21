import type { LucideIcon } from "lucide-react";

/** Temporary body for pages that are built in a later step. */
export function Placeholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="card-surface flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="bg-accent grid size-12 place-items-center rounded-2xl">
        <Icon className="text-brand-mist size-6" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
    </div>
  );
}
