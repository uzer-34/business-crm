"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordPurchaseOrderPaymentAction } from "@/lib/purchasing/purchase-order-actions";

export function PaymentForm({ purchaseOrderId, outstanding }: { purchaseOrderId: string; outstanding: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(7rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await recordPurchaseOrderPaymentAction(purchaseOrderId, {
            amount,
            method,
            reference: reference || undefined,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <label className="grid gap-1 text-xs font-medium text-foreground-muted">
        Amount
        <Input aria-label="Payment amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-foreground-muted">
        Method
        <select aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CARD">Card</option>
          <option value="ONLINE">Online</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-foreground-muted">
        Reference <span className="font-normal">(optional)</span>
        <Input aria-label="Payment reference" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
      <Button type="submit" size="sm" disabled={isPending || Number(amount) <= 0}>
        {isPending ? "Recording…" : "Record payment"}
      </Button>
      {error && <p role="alert" className="text-xs text-danger sm:col-span-full">{error}</p>}
    </form>
  );
}
