"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "./logo";
import { NAV_ITEMS, NEW_POST_HREF, isActive } from "./nav-items";

/** Desktop sidebar (lg and up). On smaller screens the MobileNav takes over. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r p-4 lg:flex">
      <Logo className="px-2 pt-2" />

      <Link
        href={NEW_POST_HREF}
        className={cn(
          buttonVariants(),
          "bg-brand-gradient shadow-glow h-11 w-full border-0 text-white hover:opacity-90",
        )}
      >
        <Plus className="size-4" />
        Yeni İçerik Oluştur
      </Link>

      <nav aria-label="Ana menü" className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[18px]", active && "text-brand-blue")} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
