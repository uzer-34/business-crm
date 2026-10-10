"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refundOrderPaymentAction } from "@/lib/sales/order-actions";

export function RefundOrderPaymentForm({ orderId, amountPaid }: { orderId: string; amountPaid: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(amountPaid);
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Record refund
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await refundOrderPaymentAction(orderId, { amount, method, reference });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="order-refund-amount">Refund amount</Label>
        <Input
          id="order-refund-amount"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-refund-method">Refund method</Label>
        <select id="order-refund-method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CARD">Card</option>
          <option value="ONLINE">Online</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-refund-reference">Reference (optional)</Label>
        <Input id="order-refund-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending || Number(amount) <= 0}>
          {isPending ? "Recording…" : "Confirm refund"}
        </Button>
      </div>
    </form>
  );
}
