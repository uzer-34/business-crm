"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { archiveProductAction } from "@/lib/catalog/product-actions";

export function ArchiveProductButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="danger"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm("Archive this product? It'll no longer show up in the product list.")) return;
        startTransition(async () => {
          await archiveProductAction(productId);
          router.push("/products");
        });
      }}
    >
      {isPending ? "Archiving…" : "Archive"}
    </Button>
  );
}
