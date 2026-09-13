"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordOrderPaymentAction } from "@/lib/sales/order-actions";

export function OrderPaymentForm({ orderId, outstanding }: { orderId: string; outstanding: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(outstanding);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await recordOrderPaymentAction(orderId, { amount });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 w-32" />
      <Button type="submit" size="sm" disabled={isPending || Number(amount) <= 0}>
        {isPending ? "Recording…" : "Record payment"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
