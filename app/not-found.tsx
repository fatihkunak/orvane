import Link from "next/link";

/** Root 404. Rendered inside the root layout (no sidebar): it can be reached before signing in. */
export const metadata = { title: "Sayfa bulunamadı" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="card-surface max-w-md space-y-4 p-6 text-center">
        <p className="text-brand-mist text-sm font-medium">404</p>
        <h1 className="text-xl font-semibold">Bu sayfa yok</h1>
        <p className="text-muted-foreground text-sm">
          Adres yanlış olabilir ya da içerik silinmiş olabilir. Gönderi arıyorsan takvime, taslak arıyorsan taslaklara bak.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="bg-brand-gradient text-brand-ink rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90">
            Ana sayfa
          </Link>
          <Link href="/calendar" className="border-border rounded-lg border px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Takvim
          </Link>
        </div>
      </div>
    </main>
  );
}
