import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { FieldDataType } from "@/generated/prisma/enums";
import type { ResolvedField } from "./field-service";

/*
 * Server-side validation and persistence of dynamic field values.
 *
 * This is the security boundary for the attribute engine. The client sends a
 * map of fieldId -> value; nothing about that map is trusted. Every entry must
 * name a field that (a) exists, (b) belongs to the caller's organization and
 * the entity being edited, and (c) is not archived — the caller supplies the
 * already-scoped field list, so a fabricated field id simply has no match and
 * is rejected rather than written.
 *
 * Values are then coerced and checked against the field's own data type,
 * option list and validation rules. A client cannot invent a field key, widen
 * an option list, or bypass a required flag.
 */

export interface FieldValueError {
  fieldId: string;
  label: string;
  message: string;
}

export interface ValidatedFieldValues {
  ok: boolean;
  errors: FieldValueError[];
  /** fieldId -> normalized value, ready to persist. Absent keys mean "clear it". */
  values: Map<string, Prisma.InputJsonValue | null>;
}

const NUMERIC_TYPES: FieldDataType[] = ["NUMBER", "DECIMAL", "CURRENCY", "PERCENTAGE"];

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

function validateOne(field: ResolvedField, raw: unknown): { error?: string; value?: Prisma.InputJsonValue } {
  if (isBlank(raw)) {
    if (field.isRequired) return { error: `${field.label} is required.` };
    return {};
  }

  const rules = (field.validation ?? {}) as {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };

  if (NUMERIC_TYPES.includes(field.dataType)) {
    const parsed = coerceNumber(raw);
    if (parsed === null) return { error: `${field.label} must be a number.` };
    if (field.dataType === "NUMBER" && !Number.isInteger(parsed)) {
      return { error: `${field.label} must be a whole number.` };
    }
    if (field.dataType === "PERCENTAGE" && (parsed < 0 || parsed > 100)) {
      return { error: `${field.label} must be between 0 and 100.` };
    }
    if (rules.min !== undefined && parsed < rules.min) return { error: `${field.label} must be at least ${rules.min}.` };
    if (rules.max !== undefined && parsed > rules.max) return { error: `${field.label} must be at most ${rules.max}.` };
    return { value: parsed };
  }

  if (field.dataType === "BOOLEAN") {
    if (typeof raw === "boolean") return { value: raw };
    if (raw === "true" || raw === "false") return { value: raw === "true" };
    return { error: `${field.label} must be yes or no.` };
  }

  if (field.dataType === "SINGLE_SELECT") {
    const value = String(raw);
    // The allowed set comes from the stored options, so a client cannot
    // introduce a value the business never configured.
    if (!field.options.some((option) => option.value === value)) {
      return { error: `${field.label} must be one of the available choices.` };
    }
    return { value };
  }

  if (field.dataType === "MULTI_SELECT") {
    const list = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    const allowed = new Set(field.options.map((option) => option.value));
    const invalid = list.find((entry) => !allowed.has(entry));
    if (invalid) return { error: `${field.label} contains a choice that is not available.` };
    return { value: Array.from(new Set(list)) };
  }

  if (field.dataType === "DATE") {
    const value = String(raw).trim();
    if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(new Date(value).getTime())) {
      return { error: `${field.label} must be a valid date.` };
    }
    return { value };
  }

  if (field.dataType === "DATETIME") {
    const value = String(raw).trim();
    if (Number.isNaN(new Date(value).getTime())) return { error: `${field.label} must be a valid date and time.` };
    return { value };
  }

  if (field.dataType === "TIME") {
    const value = String(raw).trim();
    if (!TIME_PATTERN.test(value)) return { error: `${field.label} must be a valid time, such as 14:30.` };
    return { value };
  }

  if (field.dataType === "EMAIL") {
    const value = String(raw).trim();
    if (!EMAIL_PATTERN.test(value)) return { error: `${field.label} must be a valid email address.` };
    return { value };
  }

  if (field.dataType === "URL") {
    const value = String(raw).trim();
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
    } catch {
      return { error: `${field.label} must be a valid web address starting with http:// or https://.` };
    }
    return { value };
  }

  // Remaining supported types are stored as trimmed text (TEXT, LONG_TEXT,
  // PHONE, COUNTRY, BRANCH, USER). Their controls constrain the input; length
  // and pattern rules are enforced here regardless.
  const value = String(raw).trim();
  if (rules.minLength !== undefined && value.length < rules.minLength) {
    return { error: `${field.label} must be at least ${rules.minLength} characters.` };
  }
  if (rules.maxLength !== undefined && value.length > rules.maxLength) {
    return { error: `${field.label} must be at most ${rules.maxLength} characters.` };
  }
  if (rules.pattern) {
    try {
      if (!new RegExp(rules.pattern).test(value)) return { error: `${field.label} is not in the expected format.` };
    } catch {
      // A malformed stored pattern must not block a legitimate save.
    }
  }
  return { value };
}

/**
 * `fields` must already be scoped to the caller's organization and entity.
 * Any submitted id outside that list is rejected as unknown.
 */
export function validateFieldValues(fields: ResolvedField[], submitted: Record<string, unknown>): ValidatedFieldValues {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const errors: FieldValueError[] = [];
  const values = new Map<string, Prisma.InputJsonValue | null>();

  for (const submittedId of Object.keys(submitted)) {
    if (!byId.has(submittedId)) {
      errors.push({
        fieldId: submittedId,
        label: "Unknown field",
        message: "This field does not exist for this record.",
      });
    }
  }

  for (const field of fields) {
    const result = validateOne(field, submitted[field.id]);
    if (result.error) {
      errors.push({ fieldId: field.id, label: field.label, message: result.error });
      continue;
    }
    // A field present in the payload but blank clears any stored value.
    if (result.value === undefined) {
      if (field.id in submitted) values.set(field.id, null);
      continue;
    }
    values.set(field.id, result.value);
  }

  return { ok: errors.length === 0, errors, values };
}

/** Writes validated values. Nulls delete rather than storing a JSON null. */
export async function persistFieldValues(
  client: Prisma.TransactionClient,
  entityId: string,
  values: Map<string, Prisma.InputJsonValue | null>,
): Promise<void> {
  for (const [fieldDefinitionId, value] of values) {
    if (value === null) {
      await client.fieldValue.deleteMany({ where: { fieldDefinitionId, entityId } });
      continue;
    }

    await client.fieldValue.upsert({
      where: { fieldDefinitionId_entityId: { fieldDefinitionId, entityId } },
      create: { fieldDefinitionId, entityId, value },
      update: { value },
    });
  }
}
