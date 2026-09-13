"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBranchAction } from "@/lib/branch/actions";

export function NewBranchForm({ organizationId, defaultCountryCode }: { organizationId: string; defaultCountryCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add branch
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createBranchAction(organizationId, {
            name,
            countryCode: countryCode.toUpperCase(),
            city: city || undefined,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setOpen(false);
          setName("");
          setCity("");
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="branch-name">Branch name</Label>
          <Input id="branch-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="branch-city">City</Label>
          <Input id="branch-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="branch-country">Country code</Label>
          <Input
            id="branch-country"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            maxLength={2}
            required
          />
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !name}>
          {isPending ? "Adding…" : "Save branch"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
