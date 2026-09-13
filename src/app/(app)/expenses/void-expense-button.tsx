"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { voidExpenseAction } from "@/lib/expenses/expense-actions";

export function VoidExpenseButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="danger"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await voidExpenseAction(expenseId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? "Voiding…" : "Void"}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
