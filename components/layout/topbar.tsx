"use client";

import { usePathname } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { titleForPath } from "./nav-items";

type TopbarProps = {
  user: { name?: string | null; image?: string | null };
  /** Server action that signs the user out (passed from the server layout). */
  signOutAction: () => Promise<void>;
};

export function Topbar({ user, signOutAction }: TopbarProps) {
  const pathname = usePathname();
  const isHome = pathname === "/dashboard";
  const firstName = user.name?.split(" ")[0];
  const initials = (user.name ?? "S").slice(0, 1).toUpperCase();

  return (
    <header className="bg-background/80 border-border sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6">
      {/* Logo only where the sidebar is hidden */}
      <Logo className="lg:hidden" />

      <div className="hidden min-w-0 flex-1 lg:block">
        {isHome ? (
          <div className="leading-tight">
            <h1 className="truncate text-lg font-semibold">
              Merhaba{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-muted-foreground text-xs">Bugünün planı hazır. ☀️</p>
          </div>
        ) : (
          <h1 className="truncate text-lg font-semibold">{titleForPath(pathname)}</h1>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        <Button variant="ghost" size="icon" aria-label="Bildirimler" className="relative">
          <Bell className="size-[18px]" />
          {/* Unread dot (placeholder until notifications exist) */}
          <span className="bg-brand-mist absolute top-2 right-2 size-2 rounded-full" />
        </Button>

        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Çıkış yap">
            <LogOut className="size-[18px]" />
          </Button>
        </form>

        <Avatar className="ml-1 size-9">
          {user.image && <AvatarImage src={user.image} alt={user.name ?? "Profil"} />}
          <AvatarFallback className="bg-brand-gradient text-sm font-semibold text-brand-ink">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
