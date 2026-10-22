"use client";

import { useEffect } from "react";

/**
 * Root error boundary. Next shows its own English "Application error" page without this: a server component that throws (a bad
 * database row, an expired token) would look like a crash. The message stays generic on purpose; the digest is what ties the
 * screen to the server log line.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Never log the message body here: it can carry request data. The digest is enough to find the server-side entry.
    console.error("[ui] render error", error.digest ?? error.name);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="card-surface max-w-md space-y-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Bir şeyler ters gitti</h1>
        <p className="text-muted-foreground text-sm">
          Sayfa yüklenirken beklenmeyen bir hata oluştu. Tekrar denemek genelde yeterli; sürerse sunucu günlüğüne bak
          (<code>deploy/logs/app.log</code>).
        </p>
        {error.digest && <p className="text-muted-foreground text-xs">Kayıt kodu: {error.digest}</p>}
        <button type="button" onClick={reset} className="bg-brand-gradient text-brand-ink rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90">
          Tekrar dene
        </button>
      </div>
    </main>
  );
}
