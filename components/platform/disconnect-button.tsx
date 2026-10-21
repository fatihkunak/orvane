"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectAccountAction } from "@/server/actions/accounts";

export function DisconnectButton({ accountId, label }: { accountId: string; label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      aria-label={`${label} bağlantısını kes`}
      onClick={() => {
        // Two-step confirm without window.confirm (blocking dialogs are avoided app-wide)
        toast(`${label} bağlantısı kesilsin mi?`, {
          action: {
            label: "Evet, kes",
            onClick: () =>
              startTransition(async () => {
                const res = await disconnectAccountAction(accountId);
                if (!res.ok) toast.error(res.error);
                else toast.success("Bağlantı kesildi");
              }),
          },
        });
      }}
    >
      Bağlantıyı kes
    </Button>
  );
}
