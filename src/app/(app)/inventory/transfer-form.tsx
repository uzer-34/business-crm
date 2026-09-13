"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { transferStockAction } from "@/lib/inventory/actions";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  variants: { id: string; sku: string }[];
};

export function TransferForm({
  organizationId,
  fromBranchId,
  branches,
  products,
}: {
  organizationId: string;
  fromBranchId: string;
  branches: { id: string; name: string }[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toBranchId, setToBranchId] = useState(branches.find((b) => b.id !== fromBranchId)?.id ?? "");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const destinationOptions = branches.filter((b) => b.id !== fromBranchId);
  const selectedProduct = products.find((p) => p.id === productId);

  if (destinationOptions.length === 0) return null;

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Transfer stock
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await transferStockAction(organizationId, {
              fromBranchId,
              toBranchId,
              productId,
              variantId: variantId || undefined,
              quantity,
              reason: reason || undefined,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            setQuantity("");
            setReason("");
            router.refresh();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Transfer stock</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-to">To branch</Label>
          <select
            id="transfer-to"
            value={toBranchId}
            onChange={(e) => setToBranchId(e.target.value)}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          >
            {destinationOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-product">Product</Label>
          <select
            id="transfer-product"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setVariantId("");
            }}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </div>

        {selectedProduct && selectedProduct.variants.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-variant">Variant</Label>
            <select
              id="transfer-variant"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              <option value="">Base product</option>
              {selectedProduct.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.sku}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-quantity">Quantity</Label>
          <Input
            id="transfer-quantity"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="transfer-reason">Reason (optional)</Label>
          <Input id="transfer-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !productId || !toBranchId || Number(quantity) <= 0}>
            {isPending ? "Transferring…" : "Transfer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
