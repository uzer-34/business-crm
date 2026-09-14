"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editServiceAction } from "@/lib/catalog/service-actions";

type Initial = {
  name: string;
  price: string;
  durationMinutes: number | null;
  taxRatePercent: string;
  categoryName: string;
};

export function EditServiceForm({ serviceId, initial }: { serviceId: string; initial: Initial }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [price, setPrice] = useState(initial.price);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes?.toString() ?? "");
  const [taxRatePercent, setTaxRatePercent] = useState(initial.taxRatePercent);
  const [categoryName, setCategoryName] = useState(initial.categoryName);
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
            const result = await editServiceAction(serviceId, {
              name,
              price,
              durationMinutes: durationMinutes || undefined,
              taxRatePercent,
              categoryName: categoryName || undefined,
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
        <h2 className="text-lg font-semibold">Edit service</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-service-name">Name</Label>
          <Input id="edit-service-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-service-category">Category</Label>
          <Input id="edit-service-category" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-service-price">Price</Label>
            <Input
              id="edit-service-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-service-duration">Duration (min)</Label>
            <Input
              id="edit-service-duration"
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-service-tax">Tax rate %</Label>
            <Input
              id="edit-service-tax"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={taxRatePercent}
              onChange={(e) => setTaxRatePercent(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name || !price}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
