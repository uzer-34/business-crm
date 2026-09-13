"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createExpenseAction } from "@/lib/expenses/expense-actions";

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewExpenseForm({
  organizationId,
  branches,
}: {
  organizationId: string;
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [payee, setPayee] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [incurredAt, setIncurredAt] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Record expense</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createExpenseAction(organizationId, {
              branchId,
              amount,
              method,
              payee: payee || undefined,
              categoryName: categoryName || undefined,
              reference: reference || undefined,
              notes: notes || undefined,
              incurredAt: new Date(incurredAt).toISOString(),
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            setAmount("");
            setPayee("");
            setCategoryName("");
            setReference("");
            setNotes("");
            router.refresh();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Record expense</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-branch">Branch</Label>
            <select
              id="expense-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-date">Date</Label>
            <Input
              id="expense-date"
              type="date"
              value={incurredAt}
              onChange={(e) => setIncurredAt(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-amount">Amount</Label>
            <Input
              id="expense-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-method">Method</Label>
            <select
              id="expense-method"
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expense-payee">Paid to (optional)</Label>
          <Input id="expense-payee" value={payee} onChange={(e) => setPayee(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expense-category">Category (optional)</Label>
          <Input
            id="expense-category"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Rent, Utilities, Supplies…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-reference">Reference (optional)</Label>
            <Input id="expense-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expense-notes">Notes (optional)</Label>
            <Input id="expense-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !branchId || Number(amount) <= 0}>
            {isPending ? "Saving…" : "Save expense"}
          </Button>
        </div>
      </form>
    </div>
  );
}
