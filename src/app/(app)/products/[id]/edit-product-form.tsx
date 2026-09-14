"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editProductAction } from "@/lib/catalog/product-actions";

type Initial = {
  name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  taxRatePercent: string;
  categoryName: string;
};

export function EditProductForm({ productId, initial }: { productId: string; initial: Initial }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [sku, setSku] = useState(initial.sku);
  const [brand, setBrand] = useState(initial.brand ?? "");
  const [costPrice, setCostPrice] = useState(initial.costPrice);
  const [sellingPrice, setSellingPrice] = useState(initial.sellingPrice);
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
            const result = await editProductAction(productId, {
              name,
              sku,
              brand: brand || undefined,
              unit: initial.unit,
              costPrice,
              sellingPrice,
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
        <h2 className="text-lg font-semibold">Edit product</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-product-name">Name</Label>
          <Input id="edit-product-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-product-sku">SKU</Label>
            <Input id="edit-product-sku" value={sku} onChange={(e) => setSku(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-product-brand">Brand</Label>
            <Input id="edit-product-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-product-cost">Cost price</Label>
            <Input
              id="edit-product-cost"
              type="number"
              step="0.01"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-product-price">Selling price</Label>
            <Input
              id="edit-product-price"
              type="number"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-product-tax">Tax rate %</Label>
            <Input
              id="edit-product-tax"
              type="number"
              step="0.01"
              value={taxRatePercent}
              onChange={(e) => setTaxRatePercent(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-product-category">Category</Label>
            <Input id="edit-product-category" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name || !sku}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
