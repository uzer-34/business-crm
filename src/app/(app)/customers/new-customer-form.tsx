"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form";
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
  customerNoun,
  defaultOpen = false,
}: {
  organizationId: string;
  customFields?: CustomFieldDefinition[];
  customerNoun: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [type, setType] = useState<"INDIVIDUAL" | "BUSINESS">("INDIVIDUAL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const title = `Add ${customerNoun.toLowerCase()}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
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
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>They&apos;ll start as a lead — you can change that any time.</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <div className="flex rounded-md border border-border p-1" role="group" aria-label="Customer type">
              {(["INDIVIDUAL", "BUSINESS"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={type === option}
                  onClick={() => setType(option)}
                  className={`flex-1 cursor-pointer rounded-sm py-1.5 text-[13px] font-medium transition-colors ${
                    type === option ? "bg-selected text-foreground" : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {option === "INDIVIDUAL" ? "Individual" : "Business"}
                </button>
              ))}
            </div>

            <FormField label={type === "BUSINESS" ? "Company name" : "Full name"} required>
              {(field) => (
                <Input {...field} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
              )}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email">
                {(field) => (
                  <Input
                    {...field}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                  />
                )}
              </FormField>
              <FormField label="Phone">
                {(field) => <Input {...field} value={phone} onChange={(event) => setPhone(event.target.value)} />}
              </FormField>
            </div>

            {customFields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={fieldValues[field.id]}
                onChange={(value) => setFieldValues((previous) => ({ ...previous, [field.id]: value }))}
              />
            ))}

            {error && <Alert tone="danger">{error}</Alert>}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending} disabled={!name.trim()}>
              {isPending ? "Creating…" : `Create ${customerNoun.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renders one organization-defined field by its stored type. Milestone 2's
 * attribute engine generalizes this into a shared renderer; keeping the switch
 * in one component now means there is a single place for it to move from.
 */
function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (field.fieldType === "BOOLEAN") {
    const id = `custom-${field.id}`;
    return (
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked === true)} />
        <Label htmlFor={id} required={field.required}>
          {field.label}
        </Label>
      </div>
    );
  }

  return (
    <FormField label={field.label} required={field.required}>
      {(fieldProps) =>
        field.fieldType === "SELECT" ? (
          <NativeSelect
            {...fieldProps}
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Input
            {...fieldProps}
            type={field.fieldType === "NUMBER" ? "number" : field.fieldType === "DATE" ? "date" : "text"}
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      }
    </FormField>
  );
}
