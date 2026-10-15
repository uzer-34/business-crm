import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { loadFields, type ResolvedField } from "./field-service";
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

async function validateTenantReferences(
  organizationId: string,
  fields: readonly ResolvedField[],
  values: ReadonlyMap<string, Prisma.InputJsonValue | null>,
): Promise<FieldValueError[]> {
  const branchFields = fields.filter((field) => field.dataType === "BRANCH");
  const memberFields = fields.filter((field) => field.dataType === "USER");
  const branchIds = branchFields.flatMap((field) => {
    const value = values.get(field.id);
    return typeof value === "string" ? [value] : [];
  });
  const membershipIds = memberFields.flatMap((field) => {
    const value = values.get(field.id);
    return typeof value === "string" ? [value] : [];
  });

  const [branches, memberships] = await Promise.all([
    branchIds.length > 0
      ? db.branch.findMany({
          where: { organizationId, id: { in: [...new Set(branchIds)] } },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    membershipIds.length > 0
      ? db.membership.findMany({
          where: {
            organizationId,
            id: { in: [...new Set(membershipIds)] },
            role: { organizationId },
          },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
  ]);

  const branchIdSet = new Set(branches.map((branch) => branch.id));
  const membershipIdSet = new Set(memberships.map((membership) => membership.id));
  const errors: FieldValueError[] = [];

  for (const field of branchFields) {
    const value = values.get(field.id);
    if (typeof value === "string" && !branchIdSet.has(value)) {
      errors.push({
        fieldId: field.id,
        label: field.label,
        message: `${field.label} must refer to a branch in this organization.`,
      });
    }
  }
  for (const field of memberFields) {
    const value = values.get(field.id);
    if (typeof value === "string" && !membershipIdSet.has(value)) {
      errors.push({
        fieldId: field.id,
        label: field.label,
        message: `${field.label} must refer to a team member in this organization.`,
      });
    }
  }

  return errors;
}

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

  // BRANCH and USER values are stored in the polymorphic FieldValue JSON
  // column, so enforce tenant ownership here as there is no typed database FK.
  const referenceErrors = await validateTenantReferences(organizationId, fields, result.values);
  if (referenceErrors.length > 0) {
    return {
      ok: false,
      error: referenceErrors[0]?.message ?? "A selected reference is not available in this organization.",
      errors: referenceErrors,
    };
  }

  return {
    ok: true,
    apply: (tx, entityId) => persistFieldValues(tx, entityId, result.values),
  };
}
