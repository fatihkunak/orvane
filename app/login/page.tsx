import { Zap } from "lucide-react";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Giriş yap" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-4 py-24 text-center">
      <span className="bg-brand-gradient shadow-glow grid size-12 place-items-center rounded-2xl">
        <Zap className="size-6 text-white" fill="currentColor" />
      </span>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Synapse&apos;e giriş yap</h1>
        <p className="text-muted-foreground text-sm">
          Hesabınla devam et, platformlarını sonra bağlarsın.
        </p>
      </div>

      <form
        className="card-surface w-full p-5"
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <Button type="submit" className="bg-brand-gradient shadow-glow h-11 w-full border-0 text-white hover:opacity-90">
          Google ile devam et
        </Button>
      </form>
    </main>
  );
}
