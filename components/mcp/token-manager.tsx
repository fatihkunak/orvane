"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createApiTokenAction, revokeApiTokenAction } from "@/server/actions/mcp";

export type TokenRow = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "hiç kullanılmadı");

/** A code block with a copy button. */
function Snippet({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kopyalanamadı");
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Kopyalandı" : "Kopyala"}
        </Button>
      </div>
      <pre className="bg-surface-2 overflow-x-auto rounded-xl p-3 text-xs leading-relaxed">{code}</pre>
    </div>
  );
}

export function TokenManager({ tokens, endpoint }: { tokens: TokenRow[]; endpoint: string }) {
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  function create() {
    startTransition(async () => {
      const r = await createApiTokenAction(name);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setFresh(r.token);
      setName("");
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const r = await revokeApiTokenAction(id);
      setConfirming(null);
      if (!r.ok) toast.error(r.error);
      else toast.success("Belirteç iptal edildi");
    });
  }

  const shown = fresh ?? "<belirteç>";
  const lmStudio = JSON.stringify({ mcpServers: { orvane: { url: endpoint, headers: { Authorization: `Bearer ${shown}` } } } }, null, 2);
  const stdioOnly = `npx -y mcp-remote ${endpoint} --header "Authorization: Bearer ${shown}"`;

  return (
    <div className="space-y-6">
      <section className="card-surface space-y-4 p-4" aria-labelledby="new-token">
        <h2 id="new-token" className="text-base font-semibold">
          Yeni belirteç
        </h2>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !pending) create();
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="token-name">Ad (hangi istemci için?)</Label>
            <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Örn. LM Studio" className="bg-surface-2" />
          </div>
          <Button type="submit" disabled={pending || !name.trim()} className="bg-brand-gradient text-brand-ink border-0 hover:opacity-90">
            {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Oluştur
          </Button>
        </form>

        {fresh && (
          <div role="status" className="border-brand-teal/40 space-y-2 rounded-xl border p-3">
            <p className="text-sm font-medium">Belirtecin hazır. Şimdi kopyala: bir daha gösterilmeyecek.</p>
            <code className="bg-surface-2 block overflow-x-auto rounded-lg p-2 text-xs break-all">{fresh}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => setFresh(null)}>
              Kopyaladım, gizle
            </Button>
          </div>
        )}
      </section>

      <section className="card-surface space-y-3 p-4" aria-labelledby="token-list">
        <h2 id="token-list" className="text-base font-semibold">
          Etkin belirteçler
        </h2>
        {tokens.length === 0 ? (
          <p className="text-muted-foreground text-sm">Henüz belirteç yok.</p>
        ) : (
          <ul className="divide-border divide-y">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-muted-foreground text-xs">
                    <code>{t.prefix}…</code> · oluşturuldu {when(t.createdAt)} · son kullanım {when(t.lastUsedAt)}
                  </p>
                </div>
                {confirming === t.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    Bu belirteçle bağlanan istemci erişimi kaybeder.
                    <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => revoke(t.id)}>
                      İptal et
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(null)}>
                      Vazgeç
                    </Button>
                  </span>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(t.id)}>
                    <Trash2 />
                    İptal et
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-surface space-y-4 p-4" aria-labelledby="connect">
        <h2 id="connect" className="text-base font-semibold">
          Bağlan
        </h2>
        <p className="text-muted-foreground text-sm">
          Adres: <code className="text-foreground">{endpoint}</code>. İstemci taslak oluşturabilir ve düzenleyebilir; zamanlama ve yayın yalnızca uygulamada, senin onayınla yapılır.
        </p>
        <Snippet label="LM Studio (mcp.json) ve Cursor" code={lmStudio} />
        <Snippet label="Yalnızca stdio destekleyen istemciler (ör. Claude Desktop)" code={stdioOnly} />
      </section>
    </div>
  );
}
