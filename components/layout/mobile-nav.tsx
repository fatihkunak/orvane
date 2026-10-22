"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NEW_POST_HREF, isActive } from "./nav-items";

// The design board's bottom bar has 4 tabs with the "+" button in the middle.
// Analytics and Drafts live in the sidebar/topbar flow (the dashboard links to both), so the bar shows the other four.
const BAR_ITEMS = NAV_ITEMS.filter((i) => i.href !== "/analytics" && i.href !== "/drafts");

/** Bottom tab bar for screens below lg. */
export function MobileNav() {
  const pathname = usePathname();
  const left = BAR_ITEMS.slice(0, 2);
  const right = BAR_ITEMS.slice(2);

  const renderItem = ({ href, label, icon: Icon }: (typeof BAR_ITEMS)[number]) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
          active ? "text-brand-mist" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Alt menü"
      className="bg-sidebar/90 border-sidebar-border fixed inset-x-0 bottom-0 z-40 flex items-center border-t px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {left.map(renderItem)}
      <Link
        href={NEW_POST_HREF}
        aria-label="Yeni gönderi"
        className="bg-brand-gradient shadow-glow -mt-6 grid size-14 shrink-0 place-items-center rounded-full text-brand-ink"
      >
        <Plus className="size-6" />
      </Link>
      {right.map(renderItem)}
    </nav>
  );
}
