"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { archiveServiceAction } from "@/lib/catalog/service-actions";

export function ArchiveServiceButton({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="danger"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm("Archive this service? It'll no longer show up in the service list.")) return;
        startTransition(async () => {
          await archiveServiceAction(serviceId);
          router.push("/services");
        });
      }}
    >
      {isPending ? "Archiving…" : "Archive"}
    </Button>
  );
}
