"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { archiveCustomerAction } from "@/lib/customer/actions";

export function ArchiveCustomerButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="danger"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm("Archive this customer? They'll no longer show up in the customer list.")) return;
        startTransition(async () => {
          await archiveCustomerAction(customerId);
          router.push("/customers");
        });
      }}
    >
      {isPending ? "Archiving…" : "Archive"}
    </Button>
  );
}
