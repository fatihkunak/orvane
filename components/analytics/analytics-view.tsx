"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays, format, startOfDay } from "date-fns";
import { tr } from "date-fns/locale";
import { PlatformChip } from "@/components/platform/platform-icon";
import type { AnalyticsData } from "@/lib/queries/analytics";
import { PLATFORM_LIST } from "@/lib/platforms";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";

const RANGES = [7, 30] as const;

// Hex values mirror the tokens in globals.css (Recharts needs concrete colors)
const COLORS = { published: "#34d399", scheduled: "#f5f4ef", failed: "#ff5c72", axis: "#97a6b4", grid: "rgba(255,255,255,0.06)" };

export function AnalyticsView({ data }: { data: AnalyticsData }) {
  const today = useToday();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);

  const daily = useMemo(() => {
    if (!today) return [];
    const start = startOfDay(addDays(today, -(range - 1)));
    const days = Array.from({ length: range }, (_, i) => {
      const d = addDays(start, i);
      return { key: format(d, "yyyy-MM-dd"), label: format(d, "d MMM", { locale: tr }), published: 0, scheduled: 0, failed: 0 };
    });
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const p of data.posts) {
      const bucket = byKey.get(format(new Date(p.at), "yyyy-MM-dd")); // browser-local day
      if (!bucket) continue;
      if (p.status === "PUBLISHED") bucket.published++;
      else if (p.status === "SCHEDULED") bucket.scheduled++;
      else if (p.status === "FAILED") bucket.failed++;
    }
    return days;
  }, [data.posts, today, range]);

  const totals = daily.reduce(
    (t, d) => ({ published: t.published + d.published, scheduled: t.scheduled + d.scheduled, failed: t.failed + d.failed }),
    { published: 0, scheduled: 0, failed: 0 },
  );
  const attempted = totals.published + totals.failed;
  const successRate = attempted ? Math.round((totals.published / attempted) * 100) : null;

  const platformStats = PLATFORM_LIST.map(({ id, label }) => {
    const rows = data.perPlatform.filter((r) => r.platform === id);
    const n = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.count, 0);
    const published = n("PUBLISHED");
    const failed = n("FAILED");
    const waiting = n("PENDING") + n("PUBLISHING");
    const done = published + failed;
    return { id, label, published, failed, waiting, rate: done ? Math.round((published / done) * 100) : null, total: published + failed + waiting };
  });

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Zaman aralığı" className="bg-surface-2 flex w-fit rounded-lg p-0.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", range === r ? "bg-brand-gradient text-brand-ink" : "text-muted-foreground hover:text-foreground")}
          >
            Son {r} gün
          </button>
        ))}
      </div>

      <section aria-label="Özet" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Yayınlanan", totals.published, "text-emerald-400"],
          ["Planlanan", totals.scheduled, "text-brand-cream"],
          ["Başarısız", totals.failed, "text-destructive"],
          ["Başarı oranı", successRate === null ? "—" : `%${successRate}`, "text-foreground"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="card-surface space-y-1 p-4">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className={cn("text-2xl font-semibold tracking-tight", tone as string)}>{value}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="daily-title" className="card-surface space-y-3 p-4">
        <h2 id="daily-title" className="text-base font-semibold">
          Günlük gönderiler
        </h2>
        <div className="h-64" role="img" aria-label="Günlük gönderi sayısı grafiği">
          {today && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" stroke={COLORS.axis} fontSize={11} tickLine={false} axisLine={false} interval={range === 7 ? 0 : 4} />
                <YAxis stroke={COLORS.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#0e1b2b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#f5f4ef" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="published" name="Yayınlanan" stackId="a" fill={COLORS.published} />
                <Bar dataKey="scheduled" name="Planlanan" stackId="a" fill={COLORS.scheduled} />
                <Bar dataKey="failed" name="Başarısız" stackId="a" fill={COLORS.failed} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section aria-labelledby="platform-title" className="space-y-3">
        <h2 id="platform-title" className="text-base font-semibold">
          Platform performansı
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {platformStats.map((p) => (
            <li key={p.id} className="card-surface space-y-3 p-4">
              <div className="flex items-center gap-2">
                <PlatformChip platform={p.id} />
                <span className="flex-1 text-sm font-medium">{p.label}</span>
                <span className="text-muted-foreground text-xs">{p.total} gönderi</span>
              </div>
              <div className="bg-surface-2 h-2 overflow-hidden rounded-full" role="img" aria-label={`${p.label} başarı oranı`}>
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${p.rate ?? 0}%` }} />
              </div>
              <p className="text-muted-foreground flex justify-between text-xs">
                <span>{p.published} yayınlandı</span>
                <span>{p.failed} hata</span>
                <span>{p.rate === null ? "—" : `%${p.rate}`}</span>
              </p>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Erişim ve etkileşim verileri her platformun analitik API izni gerektirir; şimdilik yalnızca Orvane&apos;in kendi yayın verileri gösteriliyor.
        </p>
      </section>
    </div>
  );
}
