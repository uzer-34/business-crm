"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelPurchaseOrderAction } from "@/lib/purchasing/purchase-order-actions";

export function CancelPurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="danger"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("Cancel this purchase order?")) return;
          setError(null);
          startTransition(async () => {
            const result = await cancelPurchaseOrderAction(purchaseOrderId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? "Cancelling…" : "Cancel PO"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
