"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction } from "@/server/actions/account";

/**
 * Irreversible account deletion. Typing the e-mail is the confirmation step: a mis-click cannot delete anything, and the server
 * checks the same value again (the client check is only there to disable the button).
 */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = confirm.trim().toLowerCase() === email.trim().toLowerCase() && email.trim().length > 0;

  function close() {
    if (pending) return;
    setOpen(false);
    setConfirm("");
    setError(null);
  }

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await deleteAccountAction(confirm);
      // Success signs out and redirects; only a failure returns here
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <section className="card-surface space-y-3 border border-destructive/30 p-4">
      <div>
        <h2 className="text-destructive text-base font-semibold">Hesabımı sil</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Hesabın, bağlı platformların ve token&apos;ları, gönderilerin, medya kayıtların, yapay zekâ ayarların ve MCP belirteçlerin
          kalıcı olarak silinir. Platformlarda yayınlanmış gönderiler silinmez; onları ilgili platformdan silmelisin.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
        Hesabımı sil
      </Button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bu işlem geri alınamaz</DialogTitle>
            <DialogDescription>
              Onaylamak için hesabının e-posta adresini yaz: <strong className="text-foreground">{email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">E-posta</Label>
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={email}
              autoComplete="off"
              spellCheck={false}
              className="bg-surface-2 h-9"
            />
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <AlertTriangle className="text-brand-orange mt-0.5 size-3.5 shrink-0" />
              Cloudinary kullanılıyorsa yüklediğin dosyalar orada kalır; onları Cloudinary hesabından sil.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Vazgeç
            </Button>
            <Button type="button" variant="destructive" disabled={!matches || pending} onClick={() => void run()}>
              {pending ? "Siliniyor…" : "Kalıcı olarak sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
