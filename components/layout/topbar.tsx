"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { AlertTriangle, Bell, CalendarClock, LogOut, Sparkles, Terminal, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TopbarNotification } from "@/lib/queries/notifications";
import { Logo } from "./logo";
import { titleForPath } from "./nav-items";

type TopbarProps = {
  user: { name?: string | null; email?: string | null; image?: string | null };
  /** Failed posts and posts due in the next 24 hours, computed by the dashboard layout */
  notifications: TopbarNotification[];
  /** A failed publish is the only thing that lights the dot */
  hasFailure: boolean;
  /** Server action that signs the user out (passed from the server layout). */
  signOutAction: () => Promise<void>;
};

export function Topbar({ user, notifications, hasFailure, signOutAction }: TopbarProps) {
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
            <h1 className="truncate text-lg font-semibold">Merhaba{firstName ? `, ${firstName}` : ""}</h1>
            <p className="text-muted-foreground text-xs">Bugünün planı hazır. ☀️</p>
          </div>
        ) : (
          <h1 className="truncate text-lg font-semibold">{titleForPath(pathname)}</h1>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label={hasFailure ? "Bildirimler (başarısız gönderi var)" : "Bildirimler"} className="relative" />
            }
          >
            <Bell className="size-[18px]" />
            {hasFailure && <span className="bg-destructive absolute top-2 right-2 size-2 rounded-full" aria-hidden />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Bildirimler</DropdownMenuLabel>
            {notifications.length === 0 ? (
              <p className="text-muted-foreground px-1.5 py-3 text-sm">Şimdilik bir şey yok. Başarısız yayınlar ve önümüzdeki 24 saatte çıkacak gönderiler burada görünür.</p>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem
                  key={`${n.kind}-${n.id}`}
                  className="items-start gap-2 py-2"
                  render={<Link href="/calendar" />}
                >
                  {n.kind === "failed" ? (
                    <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CalendarClock className="text-brand-mist mt-0.5 size-4 shrink-0" />
                  )}
                  <span className="min-w-0 space-y-0.5">
                    <span className="text-muted-foreground block text-xs">
                      {n.kind === "failed" ? "Yayınlanamadı" : format(new Date(n.at), "d MMM HH:mm", { locale: tr })}
                    </span>
                    <span className="block truncate text-sm">{n.text || "(medya)"}</span>
                    {n.error && <span className="text-destructive block truncate text-xs">{n.error}</span>}
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/calendar" />}>
              <CalendarClock className="size-4" /> Takvimi aç
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Profil menüsü" />}>
            <Avatar className="size-8">
              {user.image && <AvatarImage src={user.image} alt={user.name ?? "Profil"} />}
              <AvatarFallback className="bg-brand-gradient text-brand-ink text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="py-2">
              <span className="text-foreground block truncate text-sm font-medium">{user.name ?? "Kullanıcı"}</span>
              {user.email && <span className="block truncate text-xs font-normal">{user.email}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings" />}>
              <User className="size-4" /> Profil ve ayarlar
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings/ai" />}>
              <Sparkles className="size-4" /> Yapay zekâ
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings/mcp" />}>
              <Terminal className="size-4" /> MCP belirteçleri
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <DropdownMenuItem variant="destructive" render={<button type="submit" className="w-full" />}>
                <LogOut className="size-4" /> Çıkış yap
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
