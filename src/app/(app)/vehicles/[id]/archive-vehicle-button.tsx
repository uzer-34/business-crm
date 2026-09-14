"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { archiveVehicleAction } from "@/lib/vehicles/vehicle-actions";

export function ArchiveVehicleButton({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="danger"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await archiveVehicleAction(vehicleId);
          router.push("/vehicles");
        });
      }}
    >
      {isPending ? "Archiving…" : "Archive vehicle"}
    </Button>
  );
}
