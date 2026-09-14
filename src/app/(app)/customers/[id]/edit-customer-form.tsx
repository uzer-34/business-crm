"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editCustomerAction } from "@/lib/customer/actions";

type Initial = {
  type: "INDIVIDUAL" | "BUSINESS";
  name: string;
  email: string | null;
  phone: string | null;
  status: "LEAD" | "ACTIVE" | "INACTIVE";
};

export function EditCustomerForm({ customerId, initial }: { customerId: string; initial: Initial }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"INDIVIDUAL" | "BUSINESS">(initial.type);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [status, setStatus] = useState(initial.status);
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
            const result = await editCustomerAction(customerId, { type, name, email, phone, status, tags: [] });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Edit customer</h2>

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
          <Label htmlFor="edit-customer-name">{type === "BUSINESS" ? "Company name" : "Full name"}</Label>
          <Input id="edit-customer-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-customer-email">Email</Label>
          <Input id="edit-customer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-customer-phone">Phone</Label>
          <Input id="edit-customer-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-customer-status">Status</Label>
          <select
            id="edit-customer-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="LEAD">Lead</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
