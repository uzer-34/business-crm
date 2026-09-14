"use server";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import {
  createCustomFieldDefinitionSchema,
  setCustomFieldValueSchema,
} from "@/lib/validation/custom-fields";
import { recordAudit } from "@/lib/audit/record";
import type { ActionResult } from "@/lib/auth/actions";
import type { CustomFieldEntityType, CustomFieldType } from "@/generated/prisma/client";

// Definitions are a structural decision (what fields exist at all), so they
// share organization.manage with the industry-classification setting on the
// same page. Values are day-to-day data entry and should use whatever
// permission already governs editing that entity type -- this is the one
// spot that grows a case per entity type as later phases add more.
function requiredEditPermission(entityType: CustomFieldEntityType) {
  switch (entityType) {
    case "CUSTOMER":
      return "customers.edit" as const;
  }
}

export async function createCustomFieldDefinitionAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ definitionId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "organization.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createCustomFieldDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.customFieldDefinition.findUnique({
    where: {
      organizationId_entityType_key: {
        organizationId: ctx.organizationId,
        entityType: parsed.data.entityType,
        key: parsed.data.key,
      },
    },
  });
  if (existing) return { ok: false, error: "A field with this key already exists" };

  const definition = await db.$transaction(async (tx) => {
    const created = await tx.customFieldDefinition.create({
      data: {
        organizationId: ctx.organizationId,
        entityType: parsed.data.entityType,
        key: parsed.data.key,
        label: parsed.data.label,
        fieldType: parsed.data.fieldType,
        options: parsed.data.options,
        required: parsed.data.required,
      },
    });

    // Configuration changes alter what every future record can store, so they
    // are audited even though no business record changed.
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "field.created",
      targetType: "CustomFieldDefinition",
      targetId: created.id,
      metadata: {
        entityType: parsed.data.entityType,
        key: parsed.data.key,
        fieldType: parsed.data.fieldType,
        required: parsed.data.required,
      },
    });

    return created;
  });

  return { ok: true, data: { definitionId: definition.id } };
}

export async function archiveCustomFieldDefinitionAction(definitionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const definition = await db.customFieldDefinition.findUnique({ where: { id: definitionId } });
  if (!definition) return { ok: false, error: "Field not found" };

  const ctx = await loadTenantContext(user.id, definition.organizationId);
  if (!ctx) return { ok: false, error: "Field not found" };

  try {
    requirePermission(ctx, "organization.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  await db.$transaction(async (tx) => {
    await tx.customFieldDefinition.update({ where: { id: definitionId }, data: { archivedAt: new Date() } });
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "field.archived",
      targetType: "CustomFieldDefinition",
      targetId: definitionId,
      metadata: { entityType: definition.entityType, key: definition.key },
    });
  });

  return { ok: true, data: undefined };
}

function validateValueForType(fieldType: CustomFieldType, options: unknown, value: unknown): string | null {
  if (value === null || value === "") return null;
  switch (fieldType) {
    case "NUMBER":
      return typeof value === "number" && Number.isFinite(value) ? null : "Enter a number";
    case "BOOLEAN":
      return typeof value === "boolean" ? null : "Invalid value";
    case "DATE":
      return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? null : "Enter a valid date";
    case "SELECT": {
      const allowed = Array.isArray(options) ? (options as string[]) : [];
      return typeof value === "string" && allowed.includes(value) ? null : "Choose one of the listed options";
    }
    case "TEXT":
      return typeof value === "string" ? null : "Enter text";
  }
}

export async function setCustomFieldValueAction(organizationId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = setCustomFieldValueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const definition = await db.customFieldDefinition.findUnique({ where: { id: parsed.data.definitionId } });
  if (!definition || definition.organizationId !== organizationId) {
    return { ok: false, error: "Field not found" };
  }

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, requiredEditPermission(definition.entityType));
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (definition.required && (parsed.data.value === null || parsed.data.value === "")) {
    return { ok: false, error: `${definition.label} is required` };
  }

  const valueError = validateValueForType(definition.fieldType, definition.options, parsed.data.value);
  if (valueError) return { ok: false, error: valueError };

  const value = parsed.data.value === null ? Prisma.JsonNull : parsed.data.value;
  await db.customFieldValue.upsert({
    where: { definitionId_entityId: { definitionId: definition.id, entityId: parsed.data.entityId } },
    create: { definitionId: definition.id, entityId: parsed.data.entityId, value },
    update: { value },
  });

  return { ok: true, data: undefined };
}
