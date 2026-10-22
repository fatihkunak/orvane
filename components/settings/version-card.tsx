"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@/lib/update";
import { checkUpdateAction, runUpdateAction } from "@/server/actions/update";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "—");

/**
 * Owner-only "version" card on /settings: compares the running commit with GitHub and, on a second confirming click, starts the
 * update script. The page dies with the server while it restarts, so the only promise it makes is "started".
 */
export function VersionCard() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    setError(null);
    const r = await checkUpdateAction();
    setChecking(false);
    if (!r.ok) return setError(r.error);
    setStatus(r.status);
    setConfirming(false);
  }

  async function start() {
    setStarting(true);
    setError(null);
    const r = await runUpdateAction();
    setStarting(false);
    if (!r.ok) return setError(r.error);
    setStarted(r.message);
    // The server goes down shortly: wait until it answers again, then reload into the new build
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/login", { cache: "no-store" });
        if (res.ok) {
          clearInterval(poll);
          window.location.reload();
        }
      } catch {
        // still restarting
      }
    }, 5000);
  }

  return (
    <section className="card-surface space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ArrowUpCircle className="text-brand-mist size-[18px]" /> Sürüm ve güncelleme
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Bu kurulum bir git kopyası üzerinde çalışıyor. Güncelle; değişiklikleri çeker, bağımlılıkları kurar, veritabanı
            migration&apos;larını uygular, derler ve uygulamayı yeniden başlatır.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={checking || starting} onClick={() => void check()}>
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {checking ? "Kontrol ediliyor…" : "Güncellemeyi kontrol et"}
        </Button>
      </div>

      {status && (
        <div className="space-y-3 text-sm">
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Senin sürümün:</dt>
              <dd className="truncate font-medium">{status.current ? `${status.current.short} · ${status.current.subject}` : "okunamadı"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">GitHub&apos;da en yeni:</dt>
              <dd className="truncate font-medium">{status.latest ? `${status.latest.short} · ${status.latest.subject}` : "—"}</dd>
            </div>
          </dl>

          {status.note && <p className="text-brand-orange text-xs">{status.note}</p>}

          {status.updateAvailable ? (
            <>
              <div className="bg-surface-2 space-y-2 rounded-xl p-3">
                <p className="text-sm font-medium">{status.behind.length} yeni commit var:</p>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  {status.behind.slice(0, 10).map((c) => (
                    <li key={c.sha} className="flex gap-2">
                      <code className="text-brand-mist shrink-0">{c.short}</code>
                      <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                      <span className="shrink-0">{when(c.date)}</span>
                    </li>
                  ))}
                </ul>
                {status.behind.length > 10 && <p className="text-muted-foreground text-xs">+{status.behind.length - 10} daha</p>}
              </div>

              {started ? (
                <p className="flex items-start gap-2 text-sm">
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> {started}
                </p>
              ) : confirming ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-brand-orange flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="size-4" /> Uygulama birkaç dakika erişilemez olacak. Emin misin?
                  </p>
                  <Button type="button" size="sm" disabled={starting} onClick={() => void start()}>
                    {starting && <Loader2 className="animate-spin" />}
                    Evet, güncelle
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={starting} onClick={() => setConfirming(false)}>
                    Vazgeç
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" onClick={() => setConfirming(true)}>
                  <ArrowUpCircle /> Güncelle
                </Button>
              )}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-400" /> Güncelsin.
            </p>
          )}

          <p className="text-muted-foreground text-xs">Kontrol: {when(status.checkedAt)}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
