"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProductAction } from "@/lib/catalog/product-actions";

export function NewProductForm({
  organizationId,
  categoryNames,
}: {
  organizationId: string;
  categoryNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Add product</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createProductAction(organizationId, {
              name,
              sku,
              categoryName: categoryName || undefined,
              costPrice,
              sellingPrice,
              reorderPoint: reorderPoint || undefined,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.push(`/products/${result.data.productId}`);
          });
        }}
      >
        <h2 className="text-lg font-semibold">Add product</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-name">Name</Label>
          <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-sku">SKU</Label>
          <Input id="product-sku" value={sku} onChange={(e) => setSku(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-category">Category</Label>
          <Input
            id="product-category"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Type to create or reuse a category"
            list="product-category-options"
          />
          <datalist id="product-category-options">
            {categoryNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-cost">Cost price</Label>
            <Input
              id="product-cost"
              type="number"
              min="0"
              step="0.01"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-price">Selling price</Label>
            <Input
              id="product-price"
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-reorder">Reorder point (optional)</Label>
          <Input
            id="product-reorder"
            type="number"
            min="0"
            step="1"
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value)}
            placeholder="Get a low-stock alert at or below this quantity"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name || !sku}>
            {isPending ? "Creating…" : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}
