"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { FormField, FormSection } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createProductAction } from "@/lib/catalog/product-actions";

export function NewProductForm({
  organizationId,
  categoryNames,
  suppliers,
  defaultOpen = false,
}: {
  organizationId: string;
  categoryNames: string[];
  suppliers: { id: string; name: string }[];
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [preferredSupplierId, setPreferredSupplierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          Add product
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createProductAction(organizationId, {
                name,
                sku,
                categoryName: categoryName || undefined,
                costPrice,
                sellingPrice,
                reorderPoint: reorderPoint || undefined,
                preferredSupplierId: preferredSupplierId || undefined,
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
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>You can add variants, images and stock after it exists.</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <FormSection title="Basics">
              <FormField label="Name" required>
                {(field) => (
                  <Input {...field} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
                )}
              </FormField>
              <FormField label="SKU" description="Your own stock code. Must be unique in this business." required>
                {(field) => <Input {...field} value={sku} onChange={(event) => setSku(event.target.value)} />}
              </FormField>
              <FormField label="Category" description="Type a new name to create it, or pick an existing one.">
                {(field) => (
                  <>
                    <Input
                      {...field}
                      value={categoryName}
                      onChange={(event) => setCategoryName(event.target.value)}
                      placeholder="e.g. Shirts"
                      list="product-category-options"
                    />
                    <datalist id="product-category-options">
                      {categoryNames.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </>
                )}
              </FormField>
            </FormSection>

            <FormSection title="Pricing" columns={2}>
              <FormField label="Cost price" required>
                {(field) => (
                  <Input
                    {...field}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={costPrice}
                    onChange={(event) => setCostPrice(event.target.value)}
                  />
                )}
              </FormField>
              <FormField label="Selling price" required>
                {(field) => (
                  <Input
                    {...field}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={sellingPrice}
                    onChange={(event) => setSellingPrice(event.target.value)}
                  />
                )}
              </FormField>
            </FormSection>

            <FormSection title="Inventory">
              <FormField label="Reorder point" description="Flag this product as low stock at or below this quantity.">
                {(field) => (
                  <Input
                    {...field}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={reorderPoint}
                    onChange={(event) => setReorderPoint(event.target.value)}
                    placeholder="Optional"
                  />
                )}
              </FormField>
              {suppliers.length > 0 && (
                <FormField label="Preferred supplier" description="Used as the default on purchase orders.">
                  {(field) => (
                    <NativeSelect
                      {...field}
                      value={preferredSupplierId}
                      onChange={(event) => setPreferredSupplierId(event.target.value)}
                    >
                      <option value="">None</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
              )}
            </FormSection>

            {error && <Alert tone="danger">{error}</Alert>}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending} disabled={!name.trim() || !sku.trim()}>
              {isPending ? "Creating…" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
