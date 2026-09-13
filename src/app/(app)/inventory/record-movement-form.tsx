"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordMovementAction } from "@/lib/inventory/actions";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  variants: { id: string; sku: string }[];
};

const MOVEMENT_TYPES = [
  { value: "OPENING", label: "Opening stock", direction: "in" as const },
  { value: "ADJUSTMENT", label: "Adjustment", direction: "either" as const },
  { value: "DAMAGED", label: "Damaged / written off", direction: "out" as const },
];

export function RecordMovementForm({
  organizationId,
  branchId,
  products,
}: {
  organizationId: string;
  branchId: string;
  products: ProductOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof MOVEMENT_TYPES)[number]["value"]>("ADJUSTMENT");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedProduct = products.find((p) => p.id === productId);
  const movementType = MOVEMENT_TYPES.find((t) => t.value === type)!;
  const effectiveDirection = movementType.direction === "either" ? direction : movementType.direction;

  const magnitude = useMemo(() => Number(quantity) || 0, [quantity]);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Record stock</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await recordMovementAction(organizationId, {
              branchId,
              productId,
              variantId: variantId || undefined,
              type,
              quantityDelta: effectiveDirection === "out" ? -magnitude : magnitude,
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
        <h2 className="text-lg font-semibold">Record stock movement</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movement-type">Type</Label>
          <select
            id="movement-type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          >
            {MOVEMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movement-product">Product</Label>
          <select
            id="movement-product"
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
            <Label htmlFor="movement-variant">Variant</Label>
            <select
              id="movement-variant"
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

        <div className="grid grid-cols-2 gap-3">
          {movementType.direction === "either" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="movement-direction">Direction</Label>
              <select
                id="movement-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as "in" | "out")}
                className="h-10 rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="in">Add stock</option>
                <option value="out">Remove stock</option>
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-quantity">Quantity</Label>
            <Input
              id="movement-quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movement-reason">Reason (optional)</Label>
          <Input id="movement-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !productId || magnitude <= 0}>
            {isPending ? "Saving…" : "Save movement"}
          </Button>
        </div>
      </form>
    </div>
  );
}
