"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { Platform } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { PLATFORM_LIST } from "@/lib/platforms";
import { PlatformChip } from "./platform-icon";

export type ConnectedMap = Partial<Record<Platform, { username: string | null }>>;

type Props = {
  value: Platform[];
  /** Called with the platform to flip; the parent applies it with a functional state update */
  onToggle: (platform: Platform) => void;
  connected: ConnectedMap;
};

/** Toggle buttons for the target platforms. Platforms without a connected account are disabled. */
export function PlatformSelector({ value, onToggle, connected }: Props) {
  return (
    <div role="group" aria-label="Platformlar" className="grid gap-2 sm:grid-cols-3">
      {PLATFORM_LIST.map(({ id, label }) => {
        const account = connected[id];
        const selected = value.includes(id);

        if (!account) {
          return (
            <Link
              key={id}
              href="/accounts"
              className="border-border text-muted-foreground hover:bg-surface-2 flex items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm transition-colors"
            >
              <PlatformChip platform={id} className="opacity-60" />
              <span className="flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-xs">Hesabı bağla →</span>
              </span>
            </Link>
          );
        }

        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(id)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
              selected ? "border-brand-purple bg-brand-purple/10" : "border-border hover:bg-surface-2",
            )}
          >
            <PlatformChip platform={id} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{label}</span>
              {account.username && <span className="text-muted-foreground block truncate text-xs">@{account.username}</span>}
            </span>
            {selected && <Check className="text-brand-purple size-4 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
