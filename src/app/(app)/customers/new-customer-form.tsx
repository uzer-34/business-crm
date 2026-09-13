"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomerAction } from "@/lib/customer/actions";

export function NewCustomerForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"INDIVIDUAL" | "BUSINESS">("INDIVIDUAL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Add customer</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createCustomerAction(organizationId, {
              type,
              name,
              email,
              phone,
              status: "LEAD",
              tags: [],
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.push(`/customers/${result.data.customerId}`);
          });
        }}
      >
        <h2 className="text-lg font-semibold">Add customer</h2>

        <div className="flex rounded-md border border-border p-1">
          {(["INDIVIDUAL", "BUSINESS"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-sm py-1.5 text-sm font-medium transition-colors ${
                type === t ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              }`}
            >
              {t === "INDIVIDUAL" ? "Individual" : "Business"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-name">{type === "BUSINESS" ? "Company name" : "Full name"}</Label>
          <Input id="customer-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-email">Email</Label>
          <Input id="customer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-phone">Phone</Label>
          <Input id="customer-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name}>
            {isPending ? "Creating…" : "Create customer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
