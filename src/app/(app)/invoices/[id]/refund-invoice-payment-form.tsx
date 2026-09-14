"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refundInvoicePaymentAction } from "@/lib/invoicing/invoice-actions";

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
];

export function RefundInvoicePaymentForm({ invoiceId, amountPaid }: { invoiceId: string; amountPaid: string }) {
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
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await refundInvoicePaymentAction(invoiceId, {
            amount,
            method,
            reference: reference || undefined,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <p className="text-xs font-medium text-muted-foreground">Record refund</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="refund-amount">Amount</Label>
          <Input
            id="refund-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="refund-method">Method</Label>
          <select
            id="refund-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="refund-reference">Reference (optional)</Label>
          <Input id="refund-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
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
