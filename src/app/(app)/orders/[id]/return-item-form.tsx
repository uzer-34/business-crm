"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { processReturnAction } from "@/lib/sales/order-actions";

export function ReturnItemForm({ orderItemId, returnable }: { orderItemId: string; returnable: number }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(returnable));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await processReturnAction({ orderItemId, quantity });
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
        max={returnable}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="h-8 w-20"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={isPending || Number(quantity) <= 0}>
        {isPending ? "Processing…" : "Return"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
