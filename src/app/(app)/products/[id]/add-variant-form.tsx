"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProductVariantAction } from "@/lib/catalog/product-actions";

export function AddVariantForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sku, setSku] = useState("");
  const [attrKey, setAttrKey] = useState("Size");
  const [attrValue, setAttrValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Add variant
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createProductVariantAction(productId, {
            sku,
            attributes: { [attrKey]: attrValue },
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setOpen(false);
          setSku("");
          setAttrValue("");
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="variant-sku">SKU</Label>
          <Input id="variant-sku" value={sku} onChange={(e) => setSku(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="variant-attr-key">Attribute</Label>
          <Input id="variant-attr-key" value={attrKey} onChange={(e) => setAttrKey(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="variant-attr-value">Value</Label>
          <Input id="variant-attr-value" value={attrValue} onChange={(e) => setAttrValue(e.target.value)} required />
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !sku || !attrValue}>
          {isPending ? "Adding…" : "Save variant"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
