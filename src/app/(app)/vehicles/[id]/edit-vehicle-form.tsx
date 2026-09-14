"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editVehicleAction } from "@/lib/vehicles/vehicle-actions";

export function EditVehicleForm({
  vehicleId,
  initial,
}: {
  vehicleId: string;
  initial: { make: string; model: string; year: number | null; plateNumber: string | null; vin: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [make, setMake] = useState(initial.make);
  const [model, setModel] = useState(initial.model);
  const [year, setYear] = useState(initial.year?.toString() ?? "");
  const [plateNumber, setPlateNumber] = useState(initial.plateNumber ?? "");
  const [vin, setVin] = useState(initial.vin ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await editVehicleAction(vehicleId, {
              make,
              model,
              year: year || undefined,
              plateNumber: plateNumber || undefined,
              vin: vin || undefined,
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
        <h2 className="text-lg font-semibold">Edit vehicle</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-vehicle-make">Make</Label>
            <Input id="edit-vehicle-make" value={make} onChange={(e) => setMake(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-vehicle-model">Model</Label>
            <Input id="edit-vehicle-model" value={model} onChange={(e) => setModel(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-vehicle-year">Year</Label>
            <Input id="edit-vehicle-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-vehicle-plate">Plate number</Label>
            <Input id="edit-vehicle-plate" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-vehicle-vin">VIN (optional)</Label>
          <Input id="edit-vehicle-vin" value={vin} onChange={(e) => setVin(e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !make || !model}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
