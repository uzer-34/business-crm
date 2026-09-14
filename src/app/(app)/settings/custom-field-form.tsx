"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomFieldDefinitionAction } from "@/lib/industry/custom-field-actions";

const FIELD_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Yes/No" },
  { value: "SELECT", label: "Dropdown" },
];

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function CustomFieldForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("TEXT");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Add field</Button>;
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createCustomFieldDefinitionAction(organizationId, {
            entityType: "CUSTOMER",
            key: slugify(label),
            label,
            fieldType,
            required,
            options:
              fieldType === "SELECT"
                ? options
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean)
                : undefined,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setOpen(false);
          setLabel("");
          setOptions("");
          setRequired(false);
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="field-label">Field label</Label>
          <Input id="field-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Vehicle plate number" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="field-type">Type</Label>
          <select
            id="field-type"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value)}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end gap-1.5 pb-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Required
          </label>
        </div>
      </div>

      {fieldType === "SELECT" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="field-options">Options (comma-separated)</Label>
          <Input id="field-options" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Sedan, SUV, Truck" />
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !label.trim()}>
          {isPending ? "Adding…" : "Save field"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
