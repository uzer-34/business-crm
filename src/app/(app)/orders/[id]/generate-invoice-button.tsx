"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createInvoiceFromOrderAction } from "@/lib/invoicing/invoice-actions";

export function GenerateInvoiceButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await createInvoiceFromOrderAction(orderId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/invoices/${result.data.invoiceId}`);
          });
        }}
      >
        {isPending ? "Generating…" : "Generate invoice"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
