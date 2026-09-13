"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fulfillOrderItemAction } from "@/lib/sales/order-actions";

export function FulfillItemForm({ orderItemId, remaining }: { orderItemId: string; remaining: number }) {
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
          const result = await fulfillOrderItemAction({ orderItemId, quantity });
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
        {isPending ? "Fulfilling…" : "Fulfill"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
