"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordInvoicePaymentAction } from "@/lib/invoicing/invoice-actions";

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
];

export function InvoicePaymentForm({ invoiceId, outstanding }: { invoiceId: string; outstanding: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await recordInvoicePaymentAction(invoiceId, { amount, method, reference: reference || undefined });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setReference("");
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-amount">Amount</Label>
          <Input
            id="payment-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-method">Method</Label>
          <select
            id="payment-method"
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
          <Label htmlFor="payment-reference">Reference (optional)</Label>
          <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" size="sm" className="self-start" disabled={isPending || Number(amount) <= 0}>
        {isPending ? "Recording…" : "Record payment"}
      </Button>
    </form>
  );
}
