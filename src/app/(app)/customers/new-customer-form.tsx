"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomerAction } from "@/lib/customer/actions";
import { setCustomFieldValueAction } from "@/lib/industry/custom-field-actions";

type CustomFieldDefinition = {
  id: string;
  key: string;
  label: string;
  fieldType: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT";
  options: string[] | null;
  required: boolean;
};

export function NewCustomerForm({
  organizationId,
  customFields = [],
}: {
  organizationId: string;
  customFields?: CustomFieldDefinition[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"INDIVIDUAL" | "BUSINESS">("INDIVIDUAL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
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

            for (const field of customFields) {
              const raw = fieldValues[field.id];
              if (raw === undefined || raw === "") continue;
              const value = field.fieldType === "NUMBER" ? Number(raw) : raw;
              await setCustomFieldValueAction(organizationId, {
                definitionId: field.id,
                entityId: result.data.customerId,
                value,
              });
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

        {customFields.map((field) => (
          <div key={field.id} className="flex flex-col gap-1.5">
            <Label htmlFor={`custom-${field.id}`}>
              {field.label}
              {field.required && " *"}
            </Label>
            {field.fieldType === "BOOLEAN" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  id={`custom-${field.id}`}
                  type="checkbox"
                  checked={Boolean(fieldValues[field.id])}
                  onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.checked }))}
                />
                Yes
              </label>
            ) : field.fieldType === "SELECT" ? (
              <select
                id={`custom-${field.id}`}
                value={(fieldValues[field.id] as string) ?? ""}
                onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                className="h-10 rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="">Select…</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`custom-${field.id}`}
                type={field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : "text"}
                value={(fieldValues[field.id] as string) ?? ""}
                onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                required={field.required}
              />
            )}
          </div>
        ))}

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
