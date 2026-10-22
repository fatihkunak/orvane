import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo";

export const metadata = { title: "Hesap askıda" };

/** Where a suspended user lands (see authState in auth.ts). Public on purpose: the proxy must not bounce them anywhere else. */
export default function SuspendedPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-4 py-24 text-center">
      <LogoMark size={64} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Hesabın askıya alındı</h1>
        <p className="text-muted-foreground text-sm">Zamanlanmış gönderilerin yayınlanmıyor ve yeni giriş yapamazsın. Bunun bir yanlışlık olduğunu düşünüyorsan yöneticiyle iletişime geç.</p>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button type="submit" variant="outline">
          Çıkış yap
        </Button>
      </form>
    </main>
  );
}
