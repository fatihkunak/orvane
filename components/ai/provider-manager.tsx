"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CheckCircle2, CircleAlert, ExternalLink, Loader2, PlugZap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { GROUP_LABELS, GROUP_ORDER, PROVIDERS, baseUrlEditable, getProvider, type ProviderInfo } from "@/lib/ai/providers";
import {
  checkAiProviderAction,
  fetchAiModelsAction,
  makePrimaryAiProviderAction,
  moveAiProviderAction,
  removeAiProviderAction,
  saveAiProviderAction,
} from "@/server/actions/ai";
import { cn } from "@/lib/utils";

/** What the page knows about a saved provider. The key itself never reaches the browser. */
export type ConfigView = { provider: string; hasKey: boolean; baseUrl: string | null; model: string | null; position: number };

type Note = { ok: boolean; text: string };

export function ProviderManager({ configs, privateUrlsAllowed }: { configs: ConfigView[]; privateUrlsAllowed: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [rowNote, setRowNote] = useState<Record<string, Note>>({});

  const byId = new Map(configs.map((c) => [c.provider, c]));
  const chain = [...configs].sort((a, b) => a.position - b.position);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "İşlem başarısız");
        return;
      }
      if (okText) toast.success(okText);
      router.refresh();
    });
  }

  async function checkRow(id: string) {
    setCheckingId(id);
    const c = byId.get(id);
    const r = await checkAiProviderAction({ provider: id, baseUrl: c?.baseUrl ?? undefined, model: c?.model ?? undefined });
    setRowNote((n) => ({ ...n, [id]: r.ok ? { ok: true, text: `Çalışıyor · ${r.ms} ms` } : { ok: false, text: r.error } }));
    setCheckingId(null);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="chain-title" className="card-surface space-y-4 p-4">
        <div>
          <h2 id="chain-title" className="text-base font-semibold">
            Sağlayıcı zincirim
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Ana sağlayıcı yanıt vermezse (anahtar, kota, ödeme, kesinti) sıradaki yedek otomatik denenir. Sırayı oklarla değiştir.
          </p>
        </div>

        {chain.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border border-dashed p-4 text-sm">
            Henüz sağlayıcı yok. Aşağıdan birini seçip kendi API anahtarını ekle.
          </p>
        ) : (
          <ol className="space-y-2">
            {chain.map((c, i) => {
              const info = getProvider(c.provider);
              if (!info) return null;
              const note = rowNote[c.provider];
              return (
                <li key={c.provider} className="bg-surface-2 space-y-2 rounded-xl p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        i === 0 ? "bg-brand-gradient text-brand-ink" : "bg-accent text-muted-foreground",
                      )}
                    >
                      {i === 0 ? "Ana" : `Yedek ${i}`}
                    </span>
                    <span className="text-sm font-medium">{info.label}</span>
                    <code className="text-muted-foreground truncate text-xs">{c.model ?? info.defaultModel ?? "model seçilmedi"}</code>
                    {!c.hasKey && info.needsKey && <span className="text-brand-orange text-xs">anahtar yok</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`${info.label} yukarı taşı`} disabled={pending || i === 0} onClick={() => act(() => moveAiProviderAction(c.provider, "up"))}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`${info.label} aşağı taşı`} disabled={pending || i === chain.length - 1} onClick={() => act(() => moveAiProviderAction(c.provider, "down"))}>
                      <ArrowDown />
                    </Button>
                    {i > 0 && (
                      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => act(() => makePrimaryAiProviderAction(c.provider), `${info.label} ana sağlayıcı oldu`)}>
                        Ana yap
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" disabled={checkingId === c.provider} onClick={() => void checkRow(c.provider)}>
                      {checkingId === c.provider ? <Loader2 className="animate-spin" /> : <PlugZap />}
                      Sına
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(c.provider)}>
                      Düzenle
                    </Button>
                    {confirmRemove === c.provider ? (
                      <>
                        <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => { setConfirmRemove(null); act(() => removeAiProviderAction(c.provider), `${info.label} kaldırıldı`); }}>
                          Evet, kaldır
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>
                          Vazgeç
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`${info.label} kaldır`} onClick={() => setConfirmRemove(c.provider)}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  {note && (
                    <p role="status" className={cn("flex items-start gap-1.5 text-xs", note.ok ? "text-emerald-400" : "text-destructive")}>
                      {note.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
                      {note.text}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {editing && getProvider(editing) && (
        <ProviderEditor key={editing} info={getProvider(editing)!} config={byId.get(editing)} privateUrlsAllowed={privateUrlsAllowed} onClose={() => setEditing(null)} />
      )}

      <section aria-labelledby="add-title" className="card-surface space-y-5 p-4">
        <div>
          <h2 id="add-title" className="text-base font-semibold">
            Sağlayıcılar
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">Kullanmak istediğini seç, kendi anahtarını gir. Anahtar şifreli saklanır ve tarayıcına geri gönderilmez.</p>
        </div>
        {GROUP_ORDER.map((group) => (
          <div key={group} className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{GROUP_LABELS[group]}</h3>
            {group === "local" && !privateUrlsAllowed && (
              <p className="text-brand-orange text-xs">
                Yerel sunucular kapalı: <code>.env</code> dosyasına <code>ALLOW_PRIVATE_LLM_URLS=1</code> ekleyip sunucuyu yeniden başlat. Yalnızca yerel geliştirme için aç; internete açık bir kurulumda
                açık kalırsa giriş yapan herkes sunucunu yerel servislerine yönlendirebilir.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {PROVIDERS.filter((p) => p.group === group).map((p) => {
                const saved = byId.get(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={editing === p.id}
                    onClick={() => setEditing(p.id)}
                    className={cn(
                      "hover:bg-surface-2 flex items-start justify-between gap-2 rounded-xl border p-3 text-left transition-colors",
                      editing === p.id ? "border-brand-teal bg-brand-teal/10" : "border-border",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{p.label}</span>
                      {p.note && <span className="text-muted-foreground block text-xs">{p.note}</span>}
                    </span>
                    {saved && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-label="Ekli" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function ProviderEditor({ info, config, privateUrlsAllowed, onClose }: { info: ProviderInfo; config?: ConfigView; privateUrlsAllowed: boolean; onClose: () => void }) {
  const router = useRouter();
  const listId = useId();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? "");
  const [model, setModel] = useState(config?.model ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "check" | "models" | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  const editableUrl = baseUrlEditable(info);
  const payload = { provider: info.id, apiKey: apiKey || undefined, baseUrl: editableUrl ? baseUrl : undefined, model };

  async function run(kind: "save" | "check" | "models") {
    setBusy(kind);
    setNote(null);
    try {
      if (kind === "save") {
        const r = await saveAiProviderAction(payload);
        if (!r.ok) return setNote({ ok: false, text: r.error });
        toast.success(`${info.label} kaydedildi`);
        router.refresh();
        onClose();
      } else if (kind === "check") {
        const r = await checkAiProviderAction(payload);
        setNote(r.ok ? { ok: true, text: `Çalışıyor · ${r.ms} ms` } : { ok: false, text: r.error });
      } else {
        const r = await fetchAiModelsAction(payload);
        if (!r.ok) return setNote({ ok: false, text: r.error });
        setModels(r.models);
        setNote({ ok: true, text: r.models.length ? `${r.models.length} model bulundu. Listeden seç veya adını yaz.` : "Sağlayıcı boş bir liste döndürdü; model adını elle yaz." });
      }
    } finally {
      setBusy(null);
    }
  }

  const keyOptional = !info.needsKey;
  return (
    <section aria-label={`${info.label} ayarları`} className="card-surface border-brand-teal/40 space-y-4 border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{info.label}</h2>
        {info.keyUrl && (
          <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="text-brand-mist inline-flex items-center gap-1 text-sm font-medium hover:underline">
            {info.needsKey ? "Anahtar al" : "Sağlayıcı sayfası"} <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      {info.group === "local" && !privateUrlsAllowed && (
        <p className="text-brand-orange text-xs">
          Bu yerel sunucuyu kullanmak için <code>.env</code> dosyasında <code>ALLOW_PRIVATE_LLM_URLS=1</code> olmalı (yalnızca yerel geliştirme).
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${listId}-key`}>API anahtarı{keyOptional && " (isteğe bağlı)"}</Label>
          <Input
            id={`${listId}-key`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.hasKey ? "Kayıtlı, değiştirmek için yenisini yaz" : keyOptional ? "Gerekmiyorsa boş bırak" : "Anahtarını yapıştır"}
            className="bg-surface-2 h-9"
          />
        </div>

        {editableUrl && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${listId}-url`}>Adres</Label>
            <Input
              id={`${listId}-url`}
              type="url"
              inputMode="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={info.baseUrl ?? "https://sunucun.örnek/v1"}
              className="bg-surface-2 h-9"
            />
            <p className="text-muted-foreground text-xs">
              {info.group === "local" ? `Boş bırakırsan ${info.baseUrl} kullanılır.` : "OpenAI uyumlu bir /v1 adresi (https)."}
            </p>
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor={`${listId}-model`}>Model</Label>
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void run("models")}>
              {busy === "models" && <Loader2 className="animate-spin" />}
              Modelleri getir
            </Button>
          </div>
          <Input
            id={`${listId}-model`}
            list={`${listId}-models`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={info.defaultModel ?? "Model kimliği (listeyi getir veya yaz)"}
            autoComplete="off"
            spellCheck={false}
            className="bg-surface-2 h-9"
          />
          <datalist id={`${listId}-models`}>
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {models.length > 0 && (
            <NativeSelect aria-label="Model listesi" value={models.includes(model) ? model : ""} onChange={(e) => e.target.value && setModel(e.target.value)}>
              <option value="">Listeden seç…</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          )}
          <p className="text-muted-foreground text-xs">
            {info.defaultModel ? `Boş bırakırsan ${info.defaultModel} kullanılır. ` : "Bu sağlayıcıda bir model seçmen gerekir. "}Model adları çabuk eskir, güncel listeyi sağlayıcıdan çekebilirsin.
          </p>
        </div>
      </div>

      {note && (
        <p role="status" className={cn("flex items-start gap-1.5 text-sm", note.ok ? "text-emerald-400" : "text-destructive")}>
          {note.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
          {note.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy !== null} onClick={() => void run("save")} className="bg-brand-gradient text-brand-ink border-0 hover:opacity-90">
          {busy === "save" && <Loader2 className="animate-spin" />}
          Kaydet
        </Button>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run("check")}>
          {busy === "check" ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Sına
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Kapat
        </Button>
      </div>
    </section>
  );
}
