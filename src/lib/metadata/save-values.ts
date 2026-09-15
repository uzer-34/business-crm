import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { loadFields } from "./field-service";
import { persistFieldValues, validateFieldValues, type FieldValueError } from "./field-values";

/*
 * One helper every entity action uses to store its configured field values,
 * so validation can never be skipped by a caller that forgets to run it.
 *
 * Fields are loaded server-side from the caller's organization and entity —
 * the submitted payload only supplies values, never which fields exist.
 */

export type FieldValueSaveResult =
  | { ok: true; apply: (tx: Prisma.TransactionClient, entityId: string) => Promise<void> }
  | { ok: false; error: string; errors: FieldValueError[] };

export async function prepareFieldValues(
  organizationId: string,
  entityKey: string,
  submitted: Record<string, unknown> | undefined,
  options: { categoryId?: string | null } = {},
): Promise<FieldValueSaveResult> {
  if (!submitted || Object.keys(submitted).length === 0) {
    // Still run validation with an empty payload so a required field that the
    // client omitted entirely is caught rather than silently skipped.
    const fields = await loadFields(organizationId, entityKey, { categoryId: options.categoryId });
    const required = fields.filter((field) => field.isRequired);
    if (required.length === 0) {
      return { ok: true, apply: async () => {} };
    }
  }

  const fields = await loadFields(organizationId, entityKey, { categoryId: options.categoryId });
  const result = validateFieldValues(fields, submitted ?? {});

  if (!result.ok) {
    return {
      ok: false,
      error: result.errors[0]?.message ?? "Some details need attention.",
      errors: result.errors,
    };
  }

  return {
    ok: true,
    apply: (tx, entityId) => persistFieldValues(tx, entityId, result.values),
  };
}
