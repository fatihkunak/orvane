import { addDays, format, isSameDay } from "date-fns";
import { tr } from "date-fns/locale";
import type { PostStatus } from "@/generated/prisma/enums";

export const formatTime = (d: Date) => format(d, "HH:mm");

/** "Bugün 14:30", "Yarın 10:00", otherwise "24 Eki 18:30". */
export function formatWhen(d: Date, today: Date): string {
  if (isSameDay(d, today)) return `Bugün ${formatTime(d)}`;
  if (isSameDay(d, addDays(today, 1))) return `Yarın ${formatTime(d)}`;
  return `${format(d, "d MMM", { locale: tr })} ${formatTime(d)}`;
}

export const STATUS_META: Record<PostStatus, { label: string; className: string }> = {
  DRAFT: { label: "Taslak", className: "bg-muted text-muted-foreground" },
  SCHEDULED: { label: "Planlandı", className: "bg-brand-blue/15 text-brand-blue" },
  PUBLISHED: { label: "Yayınlandı", className: "bg-emerald-500/15 text-emerald-400" },
  FAILED: { label: "Hata", className: "bg-destructive/15 text-destructive" },
};
