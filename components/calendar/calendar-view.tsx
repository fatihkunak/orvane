"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { tr } from "date-fns/locale";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import type { Platform } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { PlatformGlyph } from "@/components/platform/platform-icon";
import { PostRow } from "@/components/posts/post-row";
import { hydratePost, type PostDTO, type PostItem } from "@/lib/post-types";
import { formatTime } from "@/lib/format";
import { PLATFORM_LIST } from "@/lib/platforms";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";

type View = "week" | "month";
type Filter = Platform | "ALL";

const WEEK_OPTS = { weekStartsOn: 1 as const, locale: tr }; // weeks start on Monday
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function CalendarView({ posts }: { posts: PostDTO[] }) {
  const today = useToday();
  if (!today) return <CalendarSkeleton />;
  // Mounted separately so state can be initialised from `today` without effects
  return <CalendarInner today={today} dtos={posts} />;
}

function CalendarInner({ today, dtos }: { today: Date; dtos: PostDTO[] }) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [filter, setFilter] = useState<Filter>("ALL");

  const posts = useMemo(() => dtos.map(hydratePost), [dtos]);
  const visible = useMemo(
    () => (filter === "ALL" ? posts : posts.filter((p) => p.platforms.includes(filter))),
    [posts, filter],
  );
  const postsOn = (day: Date) => visible.filter((p) => isSameDay(p.scheduledAt, day));

  const weekDays = eachDayOfInterval({
    start: startOfWeek(cursor, WEEK_OPTS),
    end: endOfWeek(cursor, WEEK_OPTS),
  });
  const monthDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), WEEK_OPTS),
    end: endOfWeek(endOfMonth(cursor), WEEK_OPTS),
  });

  const step = (dir: 1 | -1) => setCursor((c) => (view === "week" ? addWeeks(c, dir) : addMonths(c, dir)));
  const goToday = () => {
    setCursor(today);
    setSelected(today);
  };

  const title =
    view === "month"
      ? format(cursor, "LLLL yyyy", { locale: tr })
      : `${format(weekDays[0], "d MMM", { locale: tr })} – ${format(weekDays[6], "d MMM yyyy", { locale: tr })}`;

  return (
    <div className="space-y-4">
      {/* Toolbar: navigation, title, view switch */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Önceki" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Sonraki" onClick={() => step(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={goToday} className="ml-1">
            Bugün
          </Button>
        </div>
        <h2 className="min-w-0 flex-1 text-lg font-semibold capitalize" aria-live="polite">
          {title}
        </h2>
        <div role="group" aria-label="Görünüm" className="bg-surface-2 flex rounded-lg p-0.5">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v ? "bg-brand-gradient text-brand-ink" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "week" ? "Haftalık" : "Aylık"}
            </button>
          ))}
        </div>
      </div>

      {/* Platform filter */}
      <div role="group" aria-label="Platform filtresi" className="flex flex-wrap gap-2">
        <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>
          Tümü
        </FilterChip>
        {PLATFORM_LIST.map((p) => (
          <FilterChip key={p.id} active={filter === p.id} onClick={() => setFilter(p.id)}>
            <PlatformGlyph platform={p.id} className="size-3.5" />
            {p.label}
          </FilterChip>
        ))}
      </div>

      {view === "week" ? (
        <>
          {/* Mobile: day strip + selected-day list (like the design board) */}
          <div className="grid grid-cols-7 gap-1 md:hidden">
            {weekDays.map((d, i) => (
              <DayButton
                key={d.toISOString()}
                day={d}
                weekday={WEEKDAYS[i]}
                selected={isSameDay(d, selected)}
                isToday={isSameDay(d, today)}
                count={postsOn(d).length}
                onSelect={() => setSelected(d)}
              />
            ))}
          </div>
          {/* Desktop: one column per day */}
          <div className="hidden grid-cols-7 gap-2 md:grid">
            {weekDays.map((d, i) => (
              <WeekColumn
                key={d.toISOString()}
                day={d}
                weekday={WEEKDAYS[i]}
                isToday={isSameDay(d, today)}
                selected={isSameDay(d, selected)}
                posts={postsOn(d)}
                onSelect={() => setSelected(d)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="card-surface overflow-hidden">
          <div className="border-border grid grid-cols-7 border-b">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-muted-foreground py-2 text-center text-xs font-medium">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((d) => (
              <MonthCell
                key={d.toISOString()}
                day={d}
                inMonth={isSameMonth(d, cursor)}
                isToday={isSameDay(d, today)}
                selected={isSameDay(d, selected)}
                posts={postsOn(d)}
                onSelect={() => setSelected(d)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agenda for the selected day: always on mobile + month view, redundant on desktop week view */}
      <SelectedDayList
        day={selected}
        posts={postsOn(selected)}
        className={view === "week" ? "md:hidden" : undefined}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        active
          ? "bg-brand-gradient border-transparent text-brand-ink"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

function DayButton({
  day,
  weekday,
  selected,
  isToday,
  count,
  onSelect,
}: {
  day: Date;
  weekday: string;
  selected: boolean;
  isToday: boolean;
  count: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={format(day, "d MMMM EEEE", { locale: tr })}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl py-2 text-xs transition-colors",
        selected ? "bg-brand-gradient text-brand-ink" : "card-surface text-muted-foreground",
      )}
    >
      <span>{weekday}</span>
      <span className={cn("text-base font-semibold", !selected && (isToday ? "text-brand-mist" : "text-foreground"))}>
        {format(day, "d")}
      </span>
      <span className={cn("size-1.5 rounded-full", count ? (selected ? "bg-brand-ink" : "bg-brand-teal") : "bg-transparent")} />
    </button>
  );
}

function WeekColumn({
  day,
  weekday,
  isToday,
  selected,
  posts,
  onSelect,
}: {
  day: Date;
  weekday: string;
  isToday: boolean;
  selected: boolean;
  posts: PostItem[];
  onSelect: () => void;
}) {
  return (
    <div className={cn("card-surface flex min-h-56 flex-col", selected && "ring-brand-teal/60 ring-1")}>
      <button
        type="button"
        onClick={onSelect}
        className="border-border flex items-baseline justify-between border-b px-2.5 py-2 text-left"
      >
        <span className="text-muted-foreground text-xs">{weekday}</span>
        <span className={cn("text-sm font-semibold", isToday && "bg-brand-gradient rounded-full px-2 py-0.5 text-brand-ink")}>
          {format(day, "d")}
        </span>
      </button>
      <ul className="flex-1 space-y-1.5 p-1.5">
        {posts.map((p) => (
          <li key={p.id} className="bg-surface-2 space-y-1 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium">{formatTime(p.scheduledAt)}</span>
              <span className="ml-auto flex gap-0.5">
                {p.platforms.map((pl) => (
                  <PlatformGlyph key={pl} platform={pl} className="text-muted-foreground size-3" />
                ))}
              </span>
            </div>
            <p className="text-muted-foreground line-clamp-2 text-[11px] leading-snug">{p.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonthCell({
  day,
  inMonth,
  isToday,
  selected,
  posts,
  onSelect,
}: {
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  selected: boolean;
  posts: PostItem[];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${format(day, "d MMMM", { locale: tr })}, ${posts.length} gönderi`}
      className={cn(
        "border-border hover:bg-surface-2 flex min-h-16 flex-col items-stretch gap-1 border-r border-b p-1.5 text-left transition-colors md:min-h-24",
        !inMonth && "opacity-40",
        selected && "bg-accent",
      )}
    >
      <span
        className={cn(
          "self-start text-xs font-medium",
          isToday && "bg-brand-gradient grid size-5 place-items-center rounded-full text-brand-ink",
        )}
      >
        {format(day, "d")}
      </span>
      {/* Small screens: dots only. md+: first two posts as labels. */}
      <span className="flex gap-0.5 md:hidden">
        {posts.slice(0, 3).map((p) => (
          <span key={p.id} className="bg-brand-teal size-1.5 rounded-full" />
        ))}
      </span>
      <span className="hidden flex-col gap-0.5 md:flex">
        {posts.slice(0, 2).map((p) => (
          <span key={p.id} className="bg-brand-teal/15 text-foreground flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px]">
            <span className="font-medium">{formatTime(p.scheduledAt)}</span>
            <span className="text-muted-foreground truncate">{p.text}</span>
          </span>
        ))}
        {posts.length > 2 && <span className="text-muted-foreground px-1 text-[10px]">+{posts.length - 2} daha</span>}
      </span>
    </button>
  );
}

function SelectedDayList({ day, posts, className }: { day: Date; posts: PostItem[]; className?: string }) {
  return (
    <section aria-label="Seçili gün" className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold capitalize">{format(day, "d MMMM EEEE", { locale: tr })}</h3>
      {posts.length === 0 ? (
        <div className="card-surface text-muted-foreground flex flex-col items-center gap-2 px-4 py-10 text-sm">
          <CalendarX className="size-6" />
          Bu gün için gönderi yok
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <PostRow key={p.id} post={p} whenLabel={formatTime(p.scheduledAt)} quickReschedule />
          ))}
        </ul>
      )}
    </section>
  );
}

function CalendarSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="bg-surface-2 h-10 w-64 animate-pulse rounded-lg" />
      <div className="card-surface bg-surface-2 h-72 animate-pulse" />
    </div>
  );
}
