import { auth } from "@/auth";
import { DisconnectButton } from "@/components/platform/disconnect-button";
import { PlatformChip } from "@/components/platform/platform-icon";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { PROVIDERS, credentials, isProviderSlug } from "@/lib/social/providers";
import { cn } from "@/lib/utils";

export const metadata = { title: "Hesaplar" };

const ERRORS: Record<string, string> = {
  not_configured: "Bu platform için API anahtarları ayarlanmamış (.env).",
  denied: "Bağlantı izni verilmedi.",
  invalid_state: "Oturum doğrulaması başarısız oldu, tekrar dene.",
  failed: "Hesap bağlanamadı. Ayrıntı sunucu günlüğünde.",
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; provider?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: session!.user.id }, // layout guarantees a session
    orderBy: { createdAt: "asc" },
  });

  const connectedLabel = sp.connected && isProviderSlug(sp.connected) ? PROVIDERS[sp.connected].label : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {connectedLabel && (
        <p role="status" className="card-surface border-emerald-500/40 p-3 text-sm text-emerald-400">
          {connectedLabel} hesabın bağlandı.
        </p>
      )}
      {sp.error && (
        <p role="alert" className="card-surface border-destructive/40 text-destructive p-3 text-sm">
          {ERRORS[sp.error] ?? "Bir hata oluştu."}
          {sp.provider && isProviderSlug(sp.provider) && ` (${PROVIDERS[sp.provider].label})`}
        </p>
      )}

      {Object.values(PROVIDERS).map((p) => {
        const mine = accounts.filter((a) => a.provider === p.platform);
        const configured = !!credentials(p.slug);

        return (
          <section key={p.slug} aria-labelledby={`h-${p.slug}`} className="card-surface space-y-4 p-4">
            <div className="flex items-center gap-3">
              <PlatformChip platform={p.platform} className="size-9 rounded-lg [&_svg]:size-5" />
              <h2 id={`h-${p.slug}`} className="flex-1 text-base font-semibold">
                {p.label}
              </h2>
              {configured ? (
                // A plain anchor on purpose: this is an API redirect, not a client-side route
                <a href={`/api/connect/${p.slug}`} className={cn(buttonVariants({ variant: mine.length ? "outline" : "default" }), !mine.length && "bg-brand-gradient border-0 text-brand-ink")}>
                  {mine.length ? "Başka hesap ekle" : "Bağla"}
                </a>
              ) : (
                <span className="text-muted-foreground text-xs">Yapılandırılmadı</span>
              )}
            </div>

            {!configured && (
              <p className="text-muted-foreground text-xs">
                <code>{p.clientIdEnv}</code> ve <code>{p.clientSecretEnv}</code> değerlerini <code>.env</code> dosyasına ekle.
              </p>
            )}

            {mine.map((a) => (
              <div key={a.id} className="bg-surface-2 flex items-center gap-3 rounded-xl p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.displayName ?? a.username ?? a.platformUserId}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {a.username ? `@${a.username}` : p.label}
                    {a.expiresAt && ` · geçerlilik ${a.expiresAt.toLocaleDateString("tr-TR")}`}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">Bağlı</span>
                <DisconnectButton accountId={a.id} label={p.label} />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
