"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Film, ImagePlus, Loader2, X } from "lucide-react";
import type { Platform } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiAssistant, type AiProviderOption } from "@/components/ai/ai-assistant";
import { PlatformSelector, type ConnectedMap } from "@/components/platform/platform-selector";
import { PlatformGlyph } from "@/components/platform/platform-icon";
import { createPostAction, updateDraftAction } from "@/server/actions/posts";
import type { DraftForm } from "@/lib/queries/posts";
import { countChars } from "@/lib/char-count";
import { ALLOWED_MEDIA_TYPES, MAX_MEDIA_FILES, mediaKind } from "@/lib/media";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type When = "now" | "schedule";
type Media = { url: string; kind: "image" | "video" };

const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Thumbnails with remove buttons plus the add button, for one media list (shared, or one platform's own). */
function MediaStrip({
  items,
  busy,
  onRemove,
  onAdd,
  onDrop,
}: {
  items: Media[];
  busy: boolean;
  onRemove: (url: string) => void;
  onAdd: () => void;
  onDrop: (files: FileList) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((m, i) => (
        <div key={m.url} className="bg-surface-2 relative size-24 overflow-hidden rounded-xl">
          {m.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- user uploads of arbitrary origin
            <img src={m.url} alt={`Medya ${i + 1}`} className="size-full object-cover" />
          ) : (
            <div className="text-muted-foreground grid size-full place-items-center">
              <Film className="size-6" />
            </div>
          )}
          <button type="button" aria-label="Medyayı kaldır" onClick={() => onRemove(m.url)} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/70 text-white">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {items.length < MAX_MEDIA_FILES && (
        <button
          type="button"
          onClick={onAdd}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(e.dataTransfer.files);
          }}
          className="border-border text-muted-foreground hover:bg-surface-2 grid size-24 place-items-center rounded-xl border border-dashed transition-colors"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          <span className="sr-only">Medya ekle</span>
        </button>
      )}
    </div>
  );
}

const toMedia = (urls: string[]): Media[] => urls.map((url) => ({ url, kind: mediaKind(url) }));

/** The new-post form. With `initial` it continues a draft instead: same fields, saved over that draft. */
export function CreatePostForm({ connected, aiProviders, initial }: { connected: ConnectedMap; aiProviders: AiProviderOption[]; initial?: DraftForm }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // Which media list the next file pick belongs to: null = shared, a platform = that platform's own media
  const uploadTarget = useRef<Platform | null>(null);
  const [pending, startTransition] = useTransition();

  const [platforms, setPlatforms] = useState<Platform[]>(() => initial?.platforms ?? (Object.keys(connected) as Platform[]).slice(0, 1));
  const [text, setText] = useState(initial?.text ?? "");
  // Text written for one platform only (from per-platform AI drafts); replaces `text` on that platform
  const [overrides, setOverrides] = useState<Partial<Record<Platform, string>>>(initial?.overrides ?? {});
  const [media, setMedia] = useState<Media[]>(() => toMedia(initial?.mediaUrls ?? []));
  // Media for one platform only; empty = that platform uses the shared media
  const [platformMedia, setPlatformMedia] = useState<Partial<Record<Platform, Media[]>>>(() =>
    Object.fromEntries(Object.entries(initial?.mediaByPlatform ?? {}).map(([k, v]) => [k, toMedia(v ?? [])])),
  );
  const [uploading, setUploading] = useState(0);
  // A failed post is usually fixed to go out again right away; its platforms that already published stay locked
  const failedPost = initial?.status === "FAILED";
  const lockedPlatforms = initial?.publishedPlatforms ?? [];
  const [when, setWhen] = useState<When>(failedPost ? "now" : "schedule");
  // Default schedule: next full hour, in the browser's timezone. A scheduled post being edited keeps its own time.
  const [defaultAt] = useState(() => {
    if (initial?.scheduledAt) return new Date(initial.scheduledAt);
    const d = new Date(Date.now() + 3600_000);
    d.setMinutes(0);
    return d;
  });
  const [date, setDate] = useState(() => toDateInput(defaultAt));
  const [time, setTime] = useState(() => toTimeInput(defaultAt));
  const [previewOf, setPreviewOf] = useState<Platform | null>(null);

  const hasAccounts = Object.keys(connected).length > 0;
  // Only platforms that are still selected count, and an emptied override falls back to the shared text
  const own = Object.fromEntries(platforms.flatMap((p) => (overrides[p]?.trim() ? [[p, overrides[p]!]] : []))) as Partial<Record<Platform, string>>;
  const textFor = (p: Platform) => own[p] ?? text;
  const sharedPlatforms = platforms.filter((p) => own[p] === undefined);
  const previewPlatform = previewOf && platforms.includes(previewOf) ? previewOf : platforms[0];
  const previewMedia = (previewPlatform && platformMedia[previewPlatform]?.length ? platformMedia[previewPlatform] : media) ?? [];

  async function uploadFiles(files: FileList | File[], target: Platform | null) {
    const list = Array.from(files);
    const current = target ? (platformMedia[target] ?? []) : media;
    const room = MAX_MEDIA_FILES - current.length;
    if (list.length > room) toast.error(`En fazla ${MAX_MEDIA_FILES} medya ekleyebilirsin`);

    for (const file of list.slice(0, Math.max(room, 0))) {
      if (!ALLOWED_MEDIA_TYPES[file.type]) {
        toast.error(`${file.name}: desteklenmeyen tür (JPG, PNG, GIF, MP4)`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch("/api/upload", { method: "POST", body });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? "Yükleme başarısız");
        const added: Media = { url: json.url, kind: mediaKind(json.url) };
        if (target) setPlatformMedia((m) => ({ ...m, [target]: [...(m[target] ?? []), added] }));
        else setMedia((m) => [...m, added]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Yükleme başarısız");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function pickFiles(target: Platform | null) {
    uploadTarget.current = target;
    fileRef.current?.click();
  }

  // A platform's own media only counts while it is still selected
  const ownMedia = Object.fromEntries(platforms.flatMap((p) => ((platformMedia[p]?.length ?? 0) > 0 ? [[p, platformMedia[p]!.map((m) => m.url)]] : []))) as Partial<
    Record<Platform, string[]>
  >;

  function submit(mode: "draft" | "schedule" | "now") {
    startTransition(async () => {
      let scheduledAt: string | undefined;
      if (mode === "schedule") {
        const local = new Date(`${date}T${time}`);
        if (Number.isNaN(local.getTime())) {
          toast.error("Geçerli bir tarih ve saat seç");
          return;
        }
        scheduledAt = local.toISOString(); // converts the browser's local time to UTC
      }
      const payload = { text, platforms, overrides: own, mediaUrls: media.map((m) => m.url), mediaByPlatform: ownMedia, mode, scheduledAt };
      const res = initial ? await updateDraftAction(initial.id, payload) : await createPostAction(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "draft" ? "Taslak kaydedildi" : mode === "now" ? "Yayın kuyruğa alındı" : "Gönderi planlandı");
      router.push(mode === "draft" ? "/drafts" : "/calendar");
    });
  }

  const primaryMode: "schedule" | "now" = when;
  const canSubmit = (sharedPlatforms.length === 0 || text.trim().length > 0) && platforms.length > 0 && !pending && uploading === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) submit(primaryMode);
        }}
      >
        {!hasAccounts && (
          <div className="card-surface border-brand-orange/40 text-sm p-4">
            Gönderi oluşturmak için önce en az bir hesap bağlamalısın.{" "}
            <a href="/accounts" className="text-brand-mist font-medium hover:underline">
              Hesapları aç
            </a>
          </div>
        )}

        <section className="space-y-2">
          <Label>Platformlar</Label>
          <PlatformSelector
            value={platforms}
            onToggle={(p) => setPlatforms((prev) => (lockedPlatforms.includes(p) ? prev : prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))}
            connected={connected}
            locked={lockedPlatforms}
          />
          {failedPost && (
            <p className="text-muted-foreground mt-2 text-xs">
              Başarısız bir gönderiyi düzeltiyorsun. Zaten yayınlanan platformlar tekrar gönderilmez, yalnızca diğerleri yeniden denenir.
            </p>
          )}
        </section>

        <AiAssistant
          providers={aiProviders}
          platforms={platforms}
          text={text}
          mediaCount={media.length}
          onUse={(t, platform) => (platform ? setOverrides((o) => ({ ...o, [platform]: t })) : setText(t))}
          onUseImage={(url) => setMedia((all) => (all.length >= MAX_MEDIA_FILES ? all : [...all, { url, kind: mediaKind(url) }]))}
        
        />

        <section className="space-y-2">
          <Label htmlFor="post-text">Metin</Label>
          <Textarea
            id="post-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ne paylaşmak istiyorsun?"
            rows={7}
            className="bg-surface-2 resize-y"
          />
          {sharedPlatforms.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Karakter sayaçları">
              {sharedPlatforms.map((p) => {
                const n = countChars(p, text);
                const limit = PLATFORMS[p].charLimit;
                const over = n > limit;
                return (
                  <li key={p} className={cn("flex items-center gap-1.5", over ? "text-destructive font-medium" : "text-muted-foreground")}>
                    <PlatformGlyph platform={p} className="size-3" />
                    {n}/{limit}
                    {over && ` · ${n - limit} fazla`}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {platforms.length > 1 && platforms.some((p) => overrides[p] === undefined) && (
          <div className="flex flex-wrap gap-2">
            {platforms
              .filter((p) => overrides[p] === undefined)
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setOverrides((o) => ({ ...o, [p]: text }))}
                  className="text-muted-foreground hover:text-foreground hover:bg-surface-2 border-border inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs transition-colors"
                >
                  <PlatformGlyph platform={p} className="size-3" />+ {PLATFORMS[p].label} için ayrı metin ve medya
                </button>
              ))}
          </div>
        )}

        {platforms
          .filter((p) => overrides[p] !== undefined)
          .map((p) => {
            const value = overrides[p] ?? "";
            const n = countChars(p, value);
            const limit = PLATFORMS[p].charLimit;
            return (
              <section key={p} className="card-surface space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`post-text-${p}`} className="flex items-center gap-2">
                    <PlatformGlyph platform={p} className="size-4" />
                    {PLATFORMS[p].label} için ayrı metin
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setOverrides((o) => {
                        const rest = { ...o };
                        delete rest[p];
                        return rest;
                      });
                      setPlatformMedia((m) => {
                        const rest = { ...m };
                        delete rest[p];
                        return rest;
                      });
                    }}
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                  >
                    Genel metne ve medyaya dön
                  </button>
                </div>
                <Textarea
                  id={`post-text-${p}`}
                  value={value}
                  onChange={(e) => setOverrides((o) => ({ ...o, [p]: e.target.value }))}
                  rows={5}
                  className="bg-surface-2 resize-y"
                />
                <p className={cn("text-xs", n > limit ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {n}/{limit}
                  {n > limit && ` · ${n - limit} fazla`}
                </p>
                <div className="space-y-1.5 pt-1">
                  <p className="text-muted-foreground text-xs font-medium">{PLATFORMS[p].label} için ayrı medya (boşsa genel medya kullanılır)</p>
                  <MediaStrip
                    items={platformMedia[p] ?? []}
                    busy={uploading > 0}
                    onRemove={(url) => setPlatformMedia((m) => ({ ...m, [p]: (m[p] ?? []).filter((x) => x.url !== url) }))}
                    onAdd={() => pickFiles(p)}
                    onDrop={(files) => void uploadFiles(files, p)}
                  />
                </div>
              </section>
            );
          })}

        <section className="space-y-2">
          <Label>Medya</Label>
          <MediaStrip
            items={media}
            busy={uploading > 0}
            onRemove={(url) => setMedia((all) => all.filter((x) => x.url !== url))}
            onAdd={() => pickFiles(null)}
            onDrop={(files) => void uploadFiles(files, null)}
          />
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept={Object.keys(ALLOWED_MEDIA_TYPES).join(",")}
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files, uploadTarget.current);
              e.target.value = ""; // allow picking the same file again
            }}
          />
          <p className="text-muted-foreground text-xs">
            JPG, PNG, GIF veya MP4 · en fazla {MAX_MEDIA_FILES} dosya{platforms.length > 1 ? ". Bir platforma farklı görsel koymak için yukarıdaki “ayrı metin ve medya” düğmesini kullan." : ""}
          </p>
        </section>

        <section className="space-y-3">
          <Label>Zamanlama</Label>
          <div role="radiogroup" aria-label="Yayın zamanı" className="grid grid-cols-2 gap-2">
            {(
              [
                ["now", "Şimdi yayınla"],
                ["schedule", "Zamanla"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={when === v}
                onClick={() => setWhen(v)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  when === v ? "border-brand-teal bg-brand-teal/10" : "border-border text-muted-foreground hover:bg-surface-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {when === "schedule" && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" aria-label="Tarih" value={date} min={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} className="bg-surface-2" />
              <Input type="time" aria-label="Saat" value={time} onChange={(e) => setTime(e.target.value)} className="bg-surface-2" />
            </div>
          )}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="bg-brand-gradient-warm shadow-glow h-11 flex-1 border-0 text-brand-ink hover:opacity-90"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {when === "now" ? "Yayınla" : "Planla"}
          </Button>
          {!failedPost && (
            <Button type="button" variant="outline" disabled={!canSubmit} onClick={() => submit("draft")} className="h-11">
              Taslak olarak kaydet
            </Button>
          )}
        </div>
      </form>

      {/* Live preview */}
      <aside aria-label="Önizleme" className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-sm font-semibold">Gönderi Önizleme</h2>
        {platforms.length > 1 && (
          <div className="flex gap-1">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={p === previewPlatform}
                onClick={() => setPreviewOf(p)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium", p === previewPlatform ? "bg-brand-gradient text-brand-ink" : "bg-surface-2 text-muted-foreground")}
              >
                {PLATFORMS[p].label}
              </button>
            ))}
          </div>
        )}
        <div className="card-surface space-y-3 p-4">
          <p className={cn("text-sm leading-relaxed break-words whitespace-pre-wrap", !(previewPlatform && textFor(previewPlatform)) && "text-muted-foreground")}>
            {previewPlatform ? textFor(previewPlatform) || "Metnin burada görünecek" : "Önce bir platform seç"}
          </p>
          {previewMedia[0] &&
            (previewMedia[0].kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- user uploads of arbitrary origin
              <img src={previewMedia[0].url} alt="" className="max-h-64 w-full rounded-xl object-cover" />
            ) : (
              <div className="bg-surface-2 text-muted-foreground grid h-40 place-items-center rounded-xl">
                <Film className="size-8" />
              </div>
            ))}
          {previewMedia.length > 1 && <p className="text-muted-foreground text-xs">+{previewMedia.length - 1} medya daha</p>}
        </div>
      </aside>
    </div>
  );
}
