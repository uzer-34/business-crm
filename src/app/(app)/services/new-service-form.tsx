"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServiceAction } from "@/lib/catalog/service-actions";

export function NewServiceForm({
  organizationId,
  categoryNames,
}: {
  organizationId: string;
  categoryNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Add service</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createServiceAction(organizationId, {
              name,
              price,
              durationMinutes: durationMinutes || undefined,
              categoryName: categoryName || undefined,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.push("/services");
            router.refresh();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Add service</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-name">Name</Label>
          <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-category">Category</Label>
          <Input
            id="service-category"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Type to create or reuse a category"
            list="service-category-options"
          />
          <datalist id="service-category-options">
            {categoryNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="service-price">Price</Label>
            <Input
              id="service-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="service-duration">Duration (min)</Label>
            <Input
              id="service-duration"
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name || !price}>
            {isPending ? "Creating…" : "Create service"}
          </Button>
        </div>
      </form>
    </div>
  );
}
