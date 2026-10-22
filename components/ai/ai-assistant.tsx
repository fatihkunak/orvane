"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, ImagePlus, Loader2, Sparkles } from "lucide-react";
import type { Platform } from "@/generated/prisma/enums";
import { PlatformGlyph } from "@/components/platform/platform-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LANGUAGES, MAX_BRIEF_CHARS, REWRITE_ACTIONS, TONES, type LanguageCode, type RewriteAction, type Tone } from "@/lib/ai/prompt";
import { IMAGE_SIZE_LABELS, IMAGE_SIZES, MAX_IMAGE_PROMPT_CHARS, type ImageSize } from "@/lib/ai/image-meta";
import type { GenerateResult } from "@/lib/ai/service";
import type { ImageResult } from "@/lib/ai/image-service";
import { MAX_MEDIA_FILES } from "@/lib/media";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { generatePostAction, generatePostImageAction } from "@/server/actions/ai";

/** A provider the user has set up, as the form needs it for the "use this one first" choice. */
export type AiProviderOption = { id: string; label: string; model: string | null; /** Can this provider draw (an image model is known)? */ canDraw?: boolean };

type Mode = "create" | "rewrite" | "image";

/**
 * "Write with AI" panel of the post form. It only ever produces DRAFTS and media: the user picks one ("Kullan") and edits it
 * in the normal text box or attaches the image to the post, nothing is published from here.
 */
export function AiAssistant({
  providers,
  platforms,
  text,
  mediaCount,
  onUse,
  onUseImage,
}: {
  providers: AiProviderOption[];
  platforms: Platform[];
  text: string;
  /** How many media files the form already holds (the 4-file limit is shared with uploads) */
  mediaCount: number;
  /** `platform` is set when the text was written for one platform only (per-platform mode): it becomes that platform's own text */
  onUse: (text: string, platform?: Platform) => void;
  /** Attaches a generated image to the post's shared media list */
  onUseImage: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [brief, setBrief] = useState("");
  const [action, setAction] = useState<RewriteAction>("shorten");
  const [tone, setTone] = useState<Tone>("friendly");
  const [language, setLanguage] = useState<LanguageCode>("auto");
  const [count, setCount] = useState(2);
  const [emoji, setEmoji] = useState<"none" | "few" | "many">("few");
  const [hashtags, setHashtags] = useState(true);
  const [providerId, setProviderId] = useState("");
  const [perPlatform, setPerPlatform] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; noProvider: boolean } | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const separate = perPlatform && platforms.length > 1;
  const hasText = text.trim().length > 0;
  const canRun = !pending && (mode === "create" ? brief.trim().length > 0 : hasText);

  function run() {
    setError(null);
    const textMode = mode === "rewrite" ? "rewrite" : "create"; // the image tab never reaches this action
    startTransition(async () => {
      const r = await generatePostAction({
        mode: textMode,
        brief: brief.trim() || undefined,
        text: mode === "rewrite" ? text : undefined,
        action: mode === "rewrite" ? action : undefined,
        tone,
        language,
        platforms,
        count,
        hashtags: hashtags ? "few" : "none",
        emoji,
        perPlatform: separate,
        providerId: providerId || undefined,
      });
      if (!r.ok) {
        setResult(null);
        setError({ message: r.error, noProvider: r.code === "NO_PROVIDER" });
        return;
      }
      setResult(r.result);
    });
  }

  async function copy(i: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  return (
    <section className="card-surface overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="ai-panel"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-surface-2 flex w-full items-center gap-3 p-4 text-left transition-colors"
      >
        <span className="bg-brand-teal/15 text-brand-mist grid size-9 shrink-0 place-items-center rounded-xl">
          <Sparkles className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">AI ile yaz</span>
          <span className="text-muted-foreground block text-xs">Konudan taslak üret ya da mevcut metni iyileştir</span>
        </span>
        <ChevronDown className={cn("text-muted-foreground size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div id="ai-panel" className="border-border space-y-4 border-t p-4">
          {providers.length === 0 ? (
            <p className="text-sm">
              Henüz bir yapay zekâ sağlayıcısı eklemedin.{" "}
              <Link href="/settings/ai" className="text-brand-mist font-medium hover:underline">
                Sağlayıcı ekle
              </Link>
            </p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Çalışma biçimi" className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["create", "Sıfırdan yaz"],
                    ["rewrite", "Metni iyileştir"],
                    ["image", "Görsel üret"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={mode === v}
                    onClick={() => setMode(v)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      mode === v ? "border-brand-teal bg-brand-teal/10" : "border-border text-muted-foreground hover:bg-surface-2",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "image" ? (
                <ImagePanel providers={providers} mediaCount={mediaCount} onUseImage={onUseImage} defaultPrompt={brief || text} />
              ) : (
                <>
              {mode === "create" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ai-brief">Ne hakkında yazalım?</Label>
                  <Textarea
                    id="ai-brief"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    maxLength={MAX_BRIEF_CHARS}
                    rows={3}
                    placeholder="Örn. Yeni sürümümüzde zamanlanmış gönderiler artık üç platforma birden çıkıyor; kısa ve heyecanlı bir duyuru."
                    className="bg-surface-2 resize-y"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {!hasText && <p className="text-brand-orange text-xs">Önce aşağıdaki Metin alanına iyileştirilecek bir metin yaz.</p>}
                  <div role="radiogroup" aria-label="İşlem" className="flex flex-wrap gap-1.5">
                    {REWRITE_ACTIONS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        role="radio"
                        aria-checked={action === a.id}
                        onClick={() => setAction(a.id)}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          action === a.id ? "bg-brand-gradient text-brand-ink" : "bg-surface-2 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-extra">Ek talimat (isteğe bağlı)</Label>
                    <Input id="ai-extra" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={MAX_BRIEF_CHARS} placeholder="Örn. daha resmî olsun" className="bg-surface-2 h-9" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-tone">Ton</Label>
                  <NativeSelect id="ai-tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                    {TONES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-lang">Dil</Label>
                  <NativeSelect id="ai-lang" value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-count">Varyasyon</Label>
                  <NativeSelect id="ai-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-emoji">Emoji</Label>
                  <NativeSelect id="ai-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value as "none" | "few" | "many")}>
                    <option value="none">Yok</option>
                    <option value="few">Az</option>
                    <option value="many">Bol</option>
                  </NativeSelect>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-provider">Sağlayıcı</Label>
                  <NativeSelect id="ai-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                    <option value="">Otomatik (zincir sırası)</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                        {p.model ? ` · ${p.model}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                  <Label htmlFor="ai-hashtags" className="flex h-9 cursor-pointer items-center gap-2">
                    <Switch id="ai-hashtags" checked={hashtags} onCheckedChange={setHashtags} />
                    Hashtag ekle
                  </Label>
                  {platforms.length > 1 && (
                    <Label htmlFor="ai-per-platform" className="flex h-9 cursor-pointer items-center gap-2">
                      <Switch id="ai-per-platform" checked={perPlatform} onCheckedChange={setPerPlatform} />
                      Platform başına ayrı metin
                    </Label>
                  )}
                </div>
              </div>

              <p className="text-muted-foreground text-xs">
                {separate
                  ? "Her platform için kendi sınırına ve üslubuna göre ayrı metin yazılır (platform başına bir istek)."
                  : platforms.length > 0
                  ? `Seçili platformlara göre en sıkı sınır (${Math.min(...platforms.map((p) => PLATFORMS[p].charLimit))} karakter) hedeflenir.`
                  : "Platform seçilmedi; 500 karakterlik genel bir sınır hedeflenir."}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" disabled={!canRun} onClick={run} className="bg-brand-gradient text-brand-ink border-0 hover:opacity-90">
                  {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {pending ? "Yazıyor…" : mode === "create" ? "Taslak üret" : "İyileştir"}
                </Button>
                <span className="text-muted-foreground text-xs">Üretilenler taslaktır; yayınlamadan önce sen kontrol edersin.</span>
              </div>

              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error.message}{" "}
                  {error.noProvider && (
                    <Link href="/settings/ai" className="text-brand-mist font-medium hover:underline">
                      Sağlayıcı ekle
                    </Link>
                  )}
                </p>
              )}

              {result && (
                <div className="space-y-3" aria-live="polite">
                  {(result.byPlatform ? platforms.filter((p) => result.byPlatform?.[p]) : [null]).map((group) => (
                    <div key={group ?? "all"} className="space-y-2">
                      {group && (
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                          <PlatformGlyph platform={group} className="size-4" />
                          {PLATFORMS[group].label}
                          {result.writers?.[group] && (
                            <span className="text-muted-foreground text-xs font-normal">
                              {result.writers[group].providerLabel} · {result.writers[group].model}
                            </span>
                          )}
                        </h3>
                      )}
                      <ul className="space-y-3">
                        {(group ? (result.byPlatform?.[group] ?? []) : result.variants).map((v, i) => {
                          const key = `${group ?? "all"}-${i}`;
                          return (
                            <li key={key} className="bg-surface-2 space-y-3 rounded-xl p-3">
                              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{v.text}</p>
                              {platforms.length > 0 && (
                                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Karakter sayaçları">
                                  {platforms.map((p) => (
                                    <li key={p} className={cn("flex items-center gap-1.5", v.over.includes(p) ? "text-destructive font-medium" : "text-muted-foreground")}>
                                      <PlatformGlyph platform={p} className="size-3" />
                                      {v.counts[p]}/{PLATFORMS[p].charLimit}
                                      {v.over.includes(p) && " · sınırı aşıyor"}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    onUse(v.text, group ?? undefined);
                                    toast.success(group ? `${PLATFORMS[group].label} metnine yerleştirildi` : "Metne yerleştirildi");
                                  }}
                                >
                                  Kullan
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => void copy(key, v.text)}>
                                  {copied === key ? <Check /> : <Copy />}
                                  {copied === key ? "Kopyalandı" : "Kopyala"}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  <p className="text-muted-foreground text-xs">
                    {result.writers ? "Toplam" : `${result.providerLabel} · ${result.model}`} · {(result.ms / 1000).toFixed(1)} sn
                    {result.tried.some((t) => !t.ok) && ` · ${result.tried.filter((t) => !t.ok).length} deneme başarısız oldu, yedek kullanıldı`}
                  </p>
                  {result.tried.some((t) => !t.ok) && (
                    <ul className="text-muted-foreground space-y-0.5 text-xs">
                      {result.tried
                        .filter((t) => !t.ok)
                        .map((t, i) => (
                          <li key={i}>
                            {t.provider}: {t.message}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Image generation inside the AI panel. Same rule as the text side: the result is only a suggestion until the person clicks
 * "Kullan", which attaches the stored media URL to the post. The 4-file media limit is shared with uploads.
 */
function ImagePanel({
  providers,
  mediaCount,
  onUseImage,
  defaultPrompt,
}: {
  providers: AiProviderOption[];
  mediaCount: number;
  onUseImage: (url: string) => void;
  defaultPrompt: string;
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [size, setSize] = useState<ImageSize>("1024x1024");
  const [providerId, setProviderId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; noProvider: boolean } | null>(null);
  const [result, setResult] = useState<ImageResult | null>(null);

  const full = mediaCount >= MAX_MEDIA_FILES;
  const canRun = !pending && !full && prompt.trim().length > 0;

  async function run() {
    setPending(true);
    setError(null);
    const r = await generatePostImageAction({ prompt: prompt.trim(), size, providerId: providerId || undefined });
    setPending(false);
    if (!r.ok) {
      setResult(null);
      setError({ message: r.error, noProvider: r.code === "NO_PROVIDER" });
      return;
    }
    setResult(r.image);
  }

  const drawing = providers.filter((p) => p.canDraw !== false);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ai-image-prompt">Nasıl bir görsel?</Label>
        <Textarea
          id="ai-image-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={MAX_IMAGE_PROMPT_CHARS}
          rows={3}
          placeholder="Örn. Lacivert zemin üzerinde turkuaz ışıklı, soyut bir takvim ve üç platform simgesi; minimal, düz illüstrasyon."
          className="bg-surface-2 resize-y"
        />
        <p className="text-muted-foreground text-xs">
          Görsel, gönderiye eklenen bir dosya olur (yayınlanmaz). Metinle aynıları hedefle: sade, okunaklı, marka renkleri.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ai-image-size">Oran</Label>
          <NativeSelect id="ai-image-size" value={size} onChange={(e) => setSize(e.target.value as ImageSize)}>
            {IMAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {IMAGE_SIZE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-image-provider">Sağlayıcı</Label>
          <NativeSelect id="ai-image-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="">Otomatik (görsel üretebilen ilk sağlayıcı)</option>
            {drawing.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {full ? (
        <p className="text-brand-orange text-xs">
          Gönderide en fazla {MAX_MEDIA_FILES} medya olabilir. Yeni bir görsel için önce birini kaldır.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!canRun} onClick={() => void run()} className="bg-brand-gradient text-brand-ink border-0 hover:opacity-90">
            {pending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {pending ? "Çiziyor…" : "Görsel üret"}
          </Button>
          <span className="text-muted-foreground text-xs">Görsel üretimi ücretli olabilir; sağlayıcının kotasından harcar.</span>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}{" "}
          {error.noProvider && (
            <Link href="/settings/ai" className="text-brand-mist font-medium hover:underline">
              Sağlayıcı ekle
            </Link>
          )}
        </p>
      )}

      {result && (
        <div className="bg-surface-2 space-y-3 rounded-xl p-3" aria-live="polite">
          {/* eslint-disable-next-line @next/next/no-img-element -- stored media URL, fixed by the upload pipeline */}
          <img src={result.url} alt="Üretilen görsel önizlemesi" className="max-h-72 w-full rounded-lg object-contain" />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={full}
              onClick={() => {
                onUseImage(result.url);
                toast.success("Görsel gönderiye eklendi");
              }}
            >
              Kullan
            </Button>
            <span className="text-muted-foreground text-xs">
              {result.providerLabel} · {result.model} · {(result.ms / 1000).toFixed(1)} sn
              {result.tried.some((t) => !t.ok) && ` · ${result.tried.filter((t) => !t.ok).length} deneme başarısız oldu, yedek kullanıldı`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
