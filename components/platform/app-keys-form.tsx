"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeAppKeysAction, saveAppKeysAction } from "@/server/actions/accounts";

/** The user's OWN developer app for a platform (X). The secret is write-only: it is never sent back to the browser. */
export function AppKeysForm({
  label,
  consoleUrl,
  callbackUrl,
  hasOwn,
  clientIdHint,
  usingShared,
}: {
  label: string;
  consoleUrl: string;
  callbackUrl: string;
  hasOwn: boolean;
  clientIdHint: string | null;
  usingShared: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function save() {
    startTransition(async () => {
      const r = await saveAppKeysAction({ clientId, clientSecret });
      if (!r.ok) return void toast.error(r.error);
      setClientId("");
      setClientSecret("");
      toast.success(`${label} uygulama anahtarların kaydedildi`);
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await removeAppKeysAction();
      setConfirming(false);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Anahtarlar kaldırıldı");
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  return (
    <div className="border-border space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="text-brand-mist size-4" aria-hidden />
        <h3 className="text-sm font-semibold">{label} uygulama anahtarların</h3>
        {hasOwn && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">Kayıtlı{clientIdHint ? ` · ${clientIdHint}` : ""}</span>}
        {!hasOwn && usingShared && <span className="bg-accent text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">Bu kurulumda ortak uygulama kullanılıyor</span>}
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {label}, API kullanımını uygulamanın sahibine faturalar. Bu yüzden herkes kendi {label} geliştirici uygulamasını getirir ve gönderi maliyeti kendi hesabında kalır. Anahtarların şifreli saklanır ve ekrana geri
        gönderilmez.
      </p>
      <div className="text-muted-foreground space-y-2 text-xs leading-relaxed">
        <p>
          <strong className="text-foreground">1.</strong>{" "}
          <a href={consoleUrl} target="_blank" rel="noreferrer noopener" className="text-brand-mist hover:underline">
            {label} geliştirici konsolunda
          </a>{" "}
          bir uygulama oluştur (OAuth 2.0, gizli istemci / Web App; izin: Read and write).
        </p>
        <p>
          <strong className="text-foreground">2.</strong> Callback (yönlendirme) adresi olarak şunu ekle:
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="bg-surface-2 min-w-0 flex-1 overflow-x-auto rounded-lg px-2 py-1.5 text-xs">{callbackUrl}</code>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Kopyalandı" : "Kopyala"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        <strong className="text-foreground">3.</strong> Uygulamanın Client ID ve Client Secret değerlerini buraya yapıştır.
      </p>

      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (clientId.trim() && clientSecret.trim() && !pending) save();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="x-client-id">Client ID</Label>
          <Input id="x-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} placeholder={hasOwn ? "Değiştirmek için yeni değer gir" : ""} className="bg-surface-2" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="x-client-secret">Client Secret</Label>
          <Input id="x-client-secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" spellCheck={false} className="bg-surface-2" />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending || !clientId.trim() || !clientSecret.trim()} className="bg-brand-gradient border-0 text-brand-ink hover:opacity-90">
            {pending && <Loader2 className="animate-spin" />}
            {hasOwn ? "Anahtarları güncelle" : "Kaydet"}
          </Button>
          {hasOwn &&
            (confirming ? (
              <span className="flex items-center gap-2 text-xs">
                Anahtarlar silinsin mi?
                <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>
                  Sil
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
                  Vazgeç
                </Button>
              </span>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
                <Trash2 />
                Anahtarları kaldır
              </Button>
            ))}
        </div>
      </form>
    </div>
  );
}
