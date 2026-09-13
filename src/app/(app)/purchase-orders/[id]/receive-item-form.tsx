"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { receivePurchaseOrderItemAction } from "@/lib/purchasing/purchase-order-actions";

export function ReceiveItemForm({ purchaseOrderItemId, remaining }: { purchaseOrderItemId: string; remaining: number }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(remaining));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await receivePurchaseOrderItemAction({ purchaseOrderItemId, quantity });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <Input
        type="number"
        min="1"
        max={remaining}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="h-8 w-20"
      />
      <Button type="submit" size="sm" disabled={isPending || Number(quantity) <= 0}>
        {isPending ? "Receiving…" : "Receive"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
