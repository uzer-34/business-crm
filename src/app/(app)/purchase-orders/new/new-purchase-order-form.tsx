"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createPurchaseOrderAction } from "@/lib/purchasing/purchase-order-actions";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  variants: { id: string; sku: string }[];
};

type LineItem = {
  productId: string;
  variantId: string;
  quantityOrdered: string;
  unitCost: string;
  taxRatePercent: string;
};

function emptyLine(defaultProductId: string): LineItem {
  return { productId: defaultProductId, variantId: "", quantityOrdered: "1", unitCost: "", taxRatePercent: "0" };
}

export function NewPurchaseOrderForm({
  organizationId,
  branches,
  suppliers,
  products,
}: {
  organizationId: string;
  branches: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([emptyLine(products[0]?.id ?? "")]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  const canSubmit =
    branchId &&
    supplierId &&
    items.length > 0 &&
    items.every((item) => item.productId && Number(item.quantityOrdered) > 0 && item.unitCost !== "");

  if (suppliers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Add a supplier first from the Suppliers page.
        </CardContent>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Add a product first from the Products page.
        </CardContent>
      </Card>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createPurchaseOrderAction(organizationId, {
            branchId,
            supplierId,
            notes: notes || undefined,
            items: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || undefined,
              quantityOrdered: item.quantityOrdered,
              unitCost: item.unitCost,
              taxRatePercent: item.taxRatePercent,
            })),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/purchase-orders/${result.data.purchaseOrderId}`);
        });
      }}
    >
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-branch">Branch</Label>
            <select
              id="po-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-supplier">Supplier</Label>
            <select
              id="po-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="po-notes">Notes (optional)</Label>
            <Input id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <h2 className="text-sm font-semibold">Line items</h2>
          {items.map((item, index) => {
            const product = products.find((p) => p.id === item.productId);
            return (
              <div key={index} className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-12">
                <div className="flex flex-col gap-1.5 sm:col-span-4">
                  <Label>Product</Label>
                  <select
                    value={item.productId}
                    onChange={(e) => updateItem(index, { productId: e.target.value, variantId: "" })}
                    className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </div>
                {product && product.variants.length > 0 && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label>Variant</Label>
                    <select
                      value={item.variantId}
                      onChange={(e) => updateItem(index, { variantId: e.target.value })}
                      className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                    >
                      <option value="">Base</option>
                      {product.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.sku}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={item.quantityOrdered}
                    onChange={(e) => updateItem(index, { quantityOrdered: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Unit cost</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitCost}
                    onChange={(e) => updateItem(index, { unitCost: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <Label>Tax %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.taxRatePercent}
                    onChange={(e) => updateItem(index, { taxRatePercent: e.target.value })}
                  />
                </div>
                <div className="flex items-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={items.length === 1}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setItems((prev) => [...prev, emptyLine(products[0]?.id ?? "")])}
          >
            Add line item
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={!canSubmit || isPending}>
          {isPending ? "Creating…" : "Create purchase order"}
        </Button>
      </div>
    </form>
  );
}
