import { BRAND } from "@/lib/brand";
import { BarChart3, CalendarDays, FileText, Home, Settings, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Single source of truth for navigation: used by the sidebar, the mobile bar and the topbar title. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Ana Sayfa", icon: Home },
  { href: "/calendar", label: "Takvim", icon: CalendarDays },
  { href: "/drafts", label: "Taslaklar", icon: FileText },
  { href: "/analytics", label: "Analitik", icon: BarChart3 },
  { href: "/accounts", label: "Hesaplar", icon: Users },
  { href: "/settings", label: "Ayarlar", icon: Settings },
];

export const NEW_POST_HREF = "/posts/new";

/** Page title shown in the topbar, falls back to the matching nav label. */
export function titleForPath(pathname: string): string {
  if (pathname.startsWith(NEW_POST_HREF)) return "Yeni Gönderi";
  if (/^\/posts\/[^/]+\/edit/.test(pathname)) return "Taslağı Düzenle";
  return NAV_ITEMS.find((i) => pathname.startsWith(i.href))?.label ?? BRAND.name;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
