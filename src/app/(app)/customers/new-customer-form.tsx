"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DynamicForm, type DynamicSection, type DynamicValues } from "@/components/metadata/dynamic-form";
import { createCustomerAction } from "@/lib/customer/actions";

export function NewCustomerForm({
  organizationId,
  fieldSections = [],
  customerNoun,
  defaultOpen = false,
}: {
  organizationId: string;
  /** Configured fields for the customer entity, resolved on the server. */
  fieldSections?: DynamicSection[];
  customerNoun: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [type, setType] = useState<"INDIVIDUAL" | "BUSINESS">("INDIVIDUAL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldValues, setFieldValues] = useState<DynamicValues>({});
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
              const result = await createCustomerAction(
                organizationId,
                { type, name, email, phone, status: "LEAD", tags: [] },
                fieldValues,
              );
              if (!result.ok) {
                setError(result.error);
                return;
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

            {/* Everything the business has configured for customers, rendered from metadata. */}
            <DynamicForm
              sections={fieldSections}
              values={fieldValues}
              onChange={(fieldId, value) => setFieldValues((previous) => ({ ...previous, [fieldId]: value }))}
            />

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
