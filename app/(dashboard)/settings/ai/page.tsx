import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { ProviderManager } from "@/components/ai/provider-manager";
import { allowPrivateUrls } from "@/lib/ai/security";
import { listConfigs } from "@/lib/ai/store";

export const metadata = { title: "Yapay zekâ" };

export default async function AiSettingsPage() {
  const session = await auth();
  const configs = await listConfigs(session!.user.id); // layout guarantees a session

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" /> Ayarlar
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Yapay zekâ sağlayıcıları</h1>
        <p className="text-muted-foreground text-sm">
          Gönderi yazmak için kendi API anahtarını kullanırsın. Birden fazla sağlayıcı ekleyip yedek zinciri kurabilirsin.
        </p>
      </div>

      <p className="card-surface text-muted-foreground flex items-start gap-3 p-4 text-sm">
        <ShieldCheck className="text-brand-mist mt-0.5 size-5 shrink-0" aria-hidden />
        <span>
          Anahtarların <strong className="text-foreground">AES-256-GCM ile şifreli</strong> saklanır, tarayıcına geri gönderilmez ve yalnızca bir istek sürecinde sunucuda çözülür. Yazdığın
          istemler seçtiğin sağlayıcıya gider; üretilen metinler yalnızca taslaktır, sen onaylamadan hiçbir şey yayınlanmaz.
        </span>
      </p>

      <ProviderManager configs={configs} privateUrlsAllowed={allowPrivateUrls()} />
    </div>
  );
}
