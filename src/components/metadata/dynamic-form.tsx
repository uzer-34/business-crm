"use client";

import * as React from "react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormField, FormSection } from "@/components/ui/form";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/*
 * Dynamic form renderer.
 *
 * Renders whatever the metadata engine describes: sections, fields, controls
 * and choices all come from configuration, never from JSX written per screen.
 * Adding an attribute to a category adds it here with no code change.
 *
 * Values are keyed by field id rather than field key, because ids are stable
 * while a business can rename a key's label at will, and the server validates
 * against the same ids.
 */

export interface DynamicFieldOption {
  value: string;
  label: string;
}

export interface DynamicField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  dataType: string;
  isRequired: boolean;
  options: DynamicFieldOption[];
  validation: Record<string, number | string> | null;
}

export interface DynamicSection {
  id: string;
  label: string;
  description: string | null;
  fields: DynamicField[];
}

export type DynamicValues = Record<string, unknown>;

const NUMERIC_TYPES = new Set(["NUMBER", "DECIMAL", "CURRENCY", "PERCENTAGE"]);

/** HTML input type for the simple text-like data types. */
function inputTypeFor(dataType: string): string {
  switch (dataType) {
    case "DATE":
      return "date";
    case "DATETIME":
      return "datetime-local";
    case "TIME":
      return "time";
    case "EMAIL":
      return "email";
    case "URL":
      return "url";
    case "PHONE":
      return "tel";
    default:
      return NUMERIC_TYPES.has(dataType) ? "number" : "text";
  }
}

function DynamicControl({
  field,
  value,
  onChange,
  countryOptions,
}: {
  field: DynamicField;
  value: unknown;
  onChange: (value: unknown) => void;
  countryOptions: DynamicFieldOption[];
}) {
  const rules = field.validation ?? {};

  /*
   * Required is announced to assistive tech but the native HTML attribute is
   * deliberately dropped: the browser would block submission with its own
   * tooltip, in its own wording, before the request ever reached the server —
   * which both bypasses the server-side check that is the real authority and
   * presents an error that looks nothing like the rest of the app.
   */
  const controlProps = (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    required: boolean | undefined;
  }) => {
    const { required, ...rest } = props;
    return { ...rest, "aria-required": required ? true : undefined, "data-field-key": field.key };
  };

  if (field.dataType === "BOOLEAN") {
    const id = `field-${field.id}`;
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          data-field-key={field.key}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Label htmlFor={id}>Yes</Label>
      </div>
    );
  }

  if (field.dataType === "LONG_TEXT") {
    return (
      <FormField label={field.label} description={field.description ?? undefined} required={field.isRequired}>
        {(props) => (
          <Textarea
            {...controlProps(props)}
            value={(value as string) ?? ""}
            placeholder={field.placeholder ?? undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </FormField>
    );
  }

  if (field.dataType === "SINGLE_SELECT") {
    return (
      <FormField label={field.label} description={field.description ?? undefined} required={field.isRequired}>
        {(props) => (
          <NativeSelect
            {...controlProps(props)}
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Select…</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
    );
  }

  if (field.dataType === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <FormField label={field.label} description={field.description ?? undefined} required={field.isRequired}>
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((option) => {
            const isOn = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isOn}
                onClick={() =>
                  onChange(isOn ? selected.filter((entry) => entry !== option.value) : [...selected, option.value])
                }
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  isOn
                    ? "border-transparent bg-accent text-accent-foreground"
                    : "border-border text-foreground-muted hover:bg-hover",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </FormField>
    );
  }

  if (field.dataType === "COUNTRY") {
    return (
      <FormField label={field.label} description={field.description ?? undefined} required={field.isRequired}>
        {(props) => (
          <Combobox
            id={props.id}
            describedBy={props["aria-describedby"]}
            options={countryOptions}
            value={(value as string) ?? ""}
            onValueChange={onChange}
            placeholder="Choose a country"
            searchPlaceholder="Search countries…"
          />
        )}
      </FormField>
    );
  }

  return (
    <FormField label={field.label} description={field.description ?? undefined} required={field.isRequired}>
      {(props) => (
        <Input
          {...controlProps(props)}
          type={inputTypeFor(field.dataType)}
          inputMode={NUMERIC_TYPES.has(field.dataType) ? "decimal" : undefined}
          step={field.dataType === "NUMBER" ? 1 : field.dataType === "DECIMAL" || field.dataType === "CURRENCY" ? "0.01" : undefined}
          min={typeof rules.min === "number" ? rules.min : undefined}
          max={typeof rules.max === "number" ? rules.max : undefined}
          maxLength={typeof rules.maxLength === "number" ? rules.maxLength : undefined}
          value={(value as string | number) ?? ""}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}

export function DynamicForm({
  sections,
  values,
  onChange,
  errors = {},
  countryOptions = [],
  emptyMessage,
}: {
  sections: DynamicSection[];
  values: DynamicValues;
  onChange: (fieldId: string, value: unknown) => void;
  /** Server-side errors keyed by field id. */
  errors?: Record<string, string>;
  countryOptions?: DynamicFieldOption[];
  emptyMessage?: React.ReactNode;
}) {
  if (sections.length === 0) {
    return emptyMessage ? <div className="text-[13px] text-foreground-muted">{emptyMessage}</div> : null;
  }

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <FormSection key={section.id} title={section.label} description={section.description ?? undefined} columns={2}>
          {section.fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1">
              <DynamicControl
                field={field}
                value={values[field.id]}
                onChange={(next) => onChange(field.id, next)}
                countryOptions={countryOptions}
              />
              {/* BOOLEAN renders its own inline label, so it needs the field name shown here. */}
              {field.dataType === "BOOLEAN" && (
                <span className="order-first text-[13px] font-medium">
                  {field.label}
                  {field.isRequired && <span className="ml-0.5 text-danger">*</span>}
                </span>
              )}
              {errors[field.id] && <p className="text-[12px] font-medium text-danger">{errors[field.id]}</p>}
            </div>
          ))}
        </FormSection>
      ))}
    </div>
  );
}

/** Read-only rendering of configured values, for detail pages. */
export function DynamicFieldSummary({ sections, values }: { sections: DynamicSection[]; values: DynamicValues }) {
  const populated = sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => {
        const value = values[field.id];
        return value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);
      }),
    }))
    .filter((section) => section.fields.length > 0);

  if (populated.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {populated.map((section) => (
        <div key={section.id}>
          <h3 className="mb-2 text-[13px] font-semibold">{section.label}</h3>
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                <dt className="shrink-0 text-foreground-subtle">{field.label}</dt>
                <dd className="min-w-0 text-right">{formatValue(field, values[field.id])}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function formatValue(field: DynamicField, value: unknown): React.ReactNode {
  if (field.dataType === "BOOLEAN") return value === true ? "Yes" : "No";

  if (field.dataType === "MULTI_SELECT" && Array.isArray(value)) {
    return (
      <span className="flex flex-wrap justify-end gap-1">
        {(value as string[]).map((entry) => (
          <Badge key={entry}>{field.options.find((option) => option.value === entry)?.label ?? entry}</Badge>
        ))}
      </span>
    );
  }

  if (field.dataType === "SINGLE_SELECT") {
    return field.options.find((option) => option.value === value)?.label ?? String(value);
  }

  return String(value);
}
