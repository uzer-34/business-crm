"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateVariantMatrixAction } from "@/lib/catalog/product-actions";

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function VariantMatrixForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Generate variants
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        startTransition(async () => {
          const response = await generateVariantMatrixAction(productId, {
            sizes: parseList(sizes),
            colors: parseList(colors),
          });
          if (!response.ok) {
            setError(response.error);
            return;
          }
          setResult(response.data);
          setSizes("");
          setColors("");
          router.refresh();
        });
      }}
    >
      <p className="text-sm font-medium">Generate size × color variants</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="matrix-sizes">Sizes (comma-separated)</Label>
          <Input id="matrix-sizes" value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="matrix-colors">Colors (comma-separated)</Label>
          <Input
            id="matrix-colors"
            value={colors}
            onChange={(e) => setColors(e.target.value)}
            placeholder="Red, Blue, Black"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {result && (
        <p className="text-sm text-success">
          Created {result.created} variant{result.created === 1 ? "" : "s"}
          {result.skipped > 0 && ` (${result.skipped} already existed)`}.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !sizes.trim() || !colors.trim()}>
          {isPending ? "Generating…" : "Generate"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}
