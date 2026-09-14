"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { editSupplierAction } from "@/lib/purchasing/supplier-actions";

type Initial = { name: string; contactName: string | null; email: string | null; phone: string | null };

export function EditSupplierForm({ supplierId, initial }: { supplierId: string; initial: Initial }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [contactName, setContactName] = useState(initial.contactName ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
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
            const result = await editSupplierAction(supplierId, {
              name,
              contactName: contactName || undefined,
              email,
              phone,
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
        <h2 className="text-lg font-semibold">Edit supplier</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-supplier-name">Supplier name</Label>
          <Input id="edit-supplier-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-supplier-contact">Contact person</Label>
          <Input id="edit-supplier-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-supplier-email">Email</Label>
            <Input id="edit-supplier-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-supplier-phone">Phone</Label>
            <Input id="edit-supplier-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
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
