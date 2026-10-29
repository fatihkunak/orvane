import Link from "next/link";
import { CheckCircle2, ChevronRight, CircleAlert, Plug, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VersionCard } from "@/components/settings/version-card";
import { DeleteAccount } from "@/components/settings/delete-account";
import { PROVIDERS, credentials } from "@/lib/social/providers";
import { isPublicMediaUrl } from "@/lib/media";
import { isUpdateOwner, updateEnabled } from "@/lib/update";

export const metadata = { title: "Ayarlar" };

/** Presence of each integration's environment variables (never the values). */
function checklist() {
  const items = Object.values(PROVIDERS).map((p) => ({
    label: `${p.label} API anahtarları`,
    hint: p.slug === "twitter" ? "Her kullanıcı kendi X uygulamasını Hesaplar sayfasında ekler" : `${p.clientIdEnv}, ${p.clientSecretEnv}`,
    ok: p.slug === "twitter" ? true : !!credentials(p.slug),
  }));
  items.push(
    { label: "Token şifreleme anahtarı", hint: "TOKEN_ENCRYPTION_KEY", ok: !!process.env.TOKEN_ENCRYPTION_KEY },
    { label: "Yönetim API'si (fatihgo paneli)", hint: "ORVANE_ADMIN_TOKEN (en az 32 karakter); yoksa panel Orvane'e bağlanamaz", ok: (process.env.ORVANE_ADMIN_TOKEN ?? "").length >= 32 },
    { label: "Giriş (Google)", hint: "AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET", ok: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) },
    process.env.CLOUDINARY_URL
      ? { label: "Medya depolama (Cloudinary)", hint: "CLOUDINARY_URL", ok: true }
      : {
          label: "Medya depolama (yerel)",
          // Threads downloads media itself: a local file works only when this app is served from a public address
          hint: isPublicMediaUrl("/api/media/")
            ? "Dosyalar bu sunucuda; Threads görselleri herkese açık APP_URL'den indirir (yayın anında sunucu açık olmalı)"
            : "CLOUDINARY_URL ya da herkese açık bir APP_URL gerekir; yoksa Threads'e görsel gönderilemez",
          ok: isPublicMediaUrl("/api/media/"),
        },
    { label: "Zamanlanmış yayın (Inngest)", hint: "INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY (yerelde Inngest Dev Server yeter)", ok: !!(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY) },
    {
      label: "Tek tıkla güncelleme",
      hint: "ORVANE_UPDATE_ENABLED=1 ve ORVANE_OWNER_EMAIL=<senin e-postan> (yalnız o hesap görür)",
      ok: updateEnabled(),
    },
  );
  return items;
}

export default async function SettingsPage() {
  const session = await auth();
  const user = session!.user; // layout guarantees a session

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <section aria-labelledby="profile-title" className="card-surface flex items-center gap-4 p-4">
        <Avatar className="size-14">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="bg-brand-gradient text-lg font-semibold text-brand-ink">{(user.name ?? "S").slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 id="profile-title" className="truncate text-base font-semibold">
            {user.name ?? "Adsız kullanıcı"}
          </h2>
          <p className="text-muted-foreground truncate text-sm">{user.email}</p>
        </div>
      </section>

      <Link href="/settings/ai" className="card-surface hover:bg-surface-2 flex items-center gap-3 p-4 transition-colors">
        <span className="bg-brand-teal/15 text-brand-mist grid size-10 shrink-0 place-items-center rounded-xl">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Yapay zekâ sağlayıcıları</span>
          <span className="text-muted-foreground block text-sm">Gönderi yazımı için kendi anahtarını ekle, model seç, yedek zinciri kur</span>
        </span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Link>

      <Link href="/settings/mcp" className="card-surface hover:bg-surface-2 flex items-center gap-3 p-4 transition-colors">
        <span className="bg-brand-teal/15 text-brand-mist grid size-10 shrink-0 place-items-center rounded-xl">
          <Plug className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">MCP: yerel modeller</span>
          <span className="text-muted-foreground block text-sm">LM Studio gibi istemciler belirteçle bağlanıp taslak hazırlasın</span>
        </span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Link>

      {/* Owner-only: runs deploy/update.cmd (pull, install, migrate, build, restart) */}
      {updateEnabled() && isUpdateOwner(user.email) && <VersionCard />}

      <section aria-labelledby="setup-title" className="card-surface space-y-3 p-4">
        <h2 id="setup-title" className="text-base font-semibold">
          Kurulum durumu
        </h2>
        <ul className="space-y-3">
          {checklist().map((i) => (
            <li key={i.label} className="flex items-start gap-3">
              {i.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-label="Hazır" />
              ) : (
                <CircleAlert className="text-brand-orange mt-0.5 size-4 shrink-0" aria-label="Eksik" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">{i.label}</p>
                <p className="text-muted-foreground text-xs">
                  <code>{i.hint}</code>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {/* Last on the page and visually separate: deletion is not a setting you stumble into */}
      <DeleteAccount email={user.email ?? ""} />
    </div>
  );
}
