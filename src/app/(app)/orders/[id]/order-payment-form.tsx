"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordOrderPaymentAction } from "@/lib/sales/order-actions";

export function OrderPaymentForm({ orderId, outstanding }: { orderId: string; outstanding: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await recordOrderPaymentAction(orderId, { amount, method, reference });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor="order-payment-amount">Amount</Label>
        <Input id="order-payment-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 w-32" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="order-payment-method">Method</Label>
        <select id="order-payment-method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CARD">Card</option>
          <option value="ONLINE">Online</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="order-payment-reference">Reference (optional)</Label>
        <Input id="order-payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 w-40" maxLength={120} />
      </div>
      <Button type="submit" size="sm" disabled={isPending || Number(amount) <= 0}>
        {isPending ? "Recording…" : "Record payment"}
      </Button>
      {error && <p role="alert" className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}
