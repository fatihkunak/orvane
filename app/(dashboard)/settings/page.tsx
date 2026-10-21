import { CheckCircle2, CircleAlert } from "lucide-react";
import { auth } from "@/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PROVIDERS, credentials } from "@/lib/social/providers";

export const metadata = { title: "Ayarlar" };

/** Presence of each integration's environment variables (never the values). */
function checklist() {
  const items = Object.values(PROVIDERS).map((p) => ({
    label: `${p.label} API anahtarları`,
    hint: `${p.clientIdEnv}, ${p.clientSecretEnv}`,
    ok: !!credentials(p.slug),
  }));
  items.push(
    { label: "Token şifreleme anahtarı", hint: "TOKEN_ENCRYPTION_KEY", ok: !!process.env.TOKEN_ENCRYPTION_KEY },
    { label: "Giriş (Google)", hint: "AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET", ok: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) },
    { label: "Medya depolama (Cloudinary)", hint: "CLOUDINARY_URL; yoksa yerel dosya kullanılır, Threads çalışmaz", ok: !!process.env.CLOUDINARY_URL },
    { label: "Zamanlanmış yayın (Inngest)", hint: "INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY (yerelde Inngest Dev Server yeter)", ok: !!(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY) },
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
    </div>
  );
}
