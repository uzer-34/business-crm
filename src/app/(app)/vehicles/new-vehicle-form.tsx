"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVehicleAction } from "@/lib/vehicles/vehicle-actions";

export function NewVehicleForm({
  customers,
  fixedCustomerId,
  onCreated,
}: {
  customers: { id: string; name: string }[];
  fixedCustomerId?: string;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? customers[0]?.id ?? "");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vin, setVin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Add vehicle</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createVehicleAction(customerId, {
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
            setMake("");
            setModel("");
            setYear("");
            setPlateNumber("");
            setVin("");
            onCreated?.();
            router.refresh();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Add vehicle</h2>

        {!fixedCustomerId && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-customer">Customer</Label>
            <select
              id="vehicle-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-make">Make</Label>
            <Input id="vehicle-make" value={make} onChange={(e) => setMake(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-model">Model</Label>
            <Input id="vehicle-model" value={model} onChange={(e) => setModel(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-year">Year</Label>
            <Input id="vehicle-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicle-plate">Plate number</Label>
            <Input id="vehicle-plate" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vehicle-vin">VIN (optional)</Label>
          <Input id="vehicle-vin" value={vin} onChange={(e) => setVin(e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !customerId || !make || !model}>
            {isPending ? "Adding…" : "Save vehicle"}
          </Button>
        </div>
      </form>
    </div>
  );
}
