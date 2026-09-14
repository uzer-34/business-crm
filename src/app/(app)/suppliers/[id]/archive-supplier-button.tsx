"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { archiveSupplierAction } from "@/lib/purchasing/supplier-actions";

export function ArchiveSupplierButton({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="danger"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm("Archive this supplier? They'll no longer show up in the supplier list.")) return;
        startTransition(async () => {
          await archiveSupplierAction(supplierId);
          router.push("/suppliers");
        });
      }}
    >
      {isPending ? "Archiving…" : "Archive"}
    </Button>
  );
}
