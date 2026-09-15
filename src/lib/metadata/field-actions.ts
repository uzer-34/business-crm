"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError, type TenantContext } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit/record";
import {
  applyRecommendationsSchema,
  createFieldSchema,
  createSectionSchema,
  reorderFieldsSchema,
  updateFieldSchema,
} from "@/lib/validation/metadata";
import { getTemplate } from "./attribute-library";
import { ensureDefaultSections } from "./field-service";
import { getEntityDefinition } from "./entities";
import type { ActionResult } from "@/lib/auth/actions";
import { Prisma } from "@/generated/prisma/client";

/*
 * Configuration actions.
 *
 * Changing what fields exist reshapes every future record, so all of these are
 * gated on organization.manage — the same permission that governs the business
 * itself. An employee cannot alter the business's schema.
 *
 * Every change is audited: configuration edits leave no Activity trail of
 * their own, so the audit log is the only record that they happened.
 */

const CONFIG_PERMISSION = "organization.manage";

async function requireConfigAccess(
  organizationId: string,
): Promise<{ ctx: TenantContext; userId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { error: "Not a member of this organization" };

  try {
    requirePermission(ctx, CONFIG_PERMISSION);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: error.message };
    throw error;
  }

  return { ctx, userId: user.id };
}

/** Confirms every id belongs to this organization before it is linked. */
async function assertCategoriesOwned(
  client: Prisma.TransactionClient,
  organizationId: string,
  categoryIds: string[],
): Promise<void> {
  if (categoryIds.length === 0) return;
  const owned = await client.category.count({ where: { id: { in: categoryIds }, organizationId } });
  if (owned !== categoryIds.length) {
    throw new ForbiddenError("One of those categories does not belong to this business");
  }
}

export async function createFieldAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ fieldId: string }>> {
  const access = await requireConfigAccess(organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  const parsed = createFieldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const duplicate = await db.fieldDefinition.findUnique({
    where: { organizationId_entityKey_key: { organizationId: ctx.organizationId, entityKey: data.entityKey, key: data.key } },
  });
  if (duplicate) return { ok: false, error: "A field with this key already exists for this record type." };

  try {
    const field = await db.$transaction(async (tx) => {
      await ensureDefaultSections(tx, ctx.organizationId, data.entityKey);
      await assertCategoriesOwned(tx, ctx.organizationId, data.categoryIds);

      // New fields land at the end of the entity's existing order.
      const last = await tx.fieldDefinition.findFirst({
        where: { organizationId: ctx.organizationId, entityKey: data.entityKey },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      });

      const created = await tx.fieldDefinition.create({
        data: {
          organizationId: ctx.organizationId,
          entityKey: data.entityKey,
          key: data.key,
          label: data.label,
          description: data.description || null,
          placeholder: data.placeholder || null,
          dataType: data.dataType,
          source: "CUSTOM",
          isRequired: data.isRequired,
          displayOrder: (last?.displayOrder ?? -1) + 1,
          sectionId: data.sectionId || null,
          searchable: data.searchable,
          filterable: data.filterable,
          sortable: data.sortable,
          hidden: data.hidden,
          validation: data.validation ? (data.validation as Prisma.InputJsonValue) : undefined,
          roleKeys: data.roleKeys,
          options: {
            create: data.options.map((option, index) => ({
              value: option.value,
              label: option.label,
              displayOrder: index,
            })),
          },
          categories: { create: data.categoryIds.map((categoryId) => ({ categoryId })) },
        },
      });

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: userId,
        action: "field.created",
        targetType: "FieldDefinition",
        targetId: created.id,
        metadata: { entityKey: data.entityKey, key: data.key, dataType: data.dataType, isRequired: data.isRequired },
      });

      return created;
    });

    return { ok: true, data: { fieldId: field.id } };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function updateFieldAction(fieldId: string, input: unknown): Promise<ActionResult> {
  const existing = await db.fieldDefinition.findUnique({ where: { id: fieldId }, include: { options: true } });
  if (!existing) return { ok: false, error: "Field not found" };

  const access = await requireConfigAccess(existing.organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  const parsed = updateFieldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      await assertCategoriesOwned(tx, ctx.organizationId, data.categoryIds);

      await tx.fieldDefinition.update({
        where: { id: fieldId },
        data: {
          label: data.label,
          description: data.description || null,
          placeholder: data.placeholder || null,
          isRequired: data.isRequired,
          sectionId: data.sectionId || null,
          searchable: data.searchable,
          filterable: data.filterable,
          sortable: data.sortable,
          hidden: data.hidden,
          validation: data.validation ? (data.validation as Prisma.InputJsonValue) : Prisma.DbNull,
          roleKeys: data.roleKeys,
        },
      });

      /*
       * Options are reconciled rather than replaced: an option still referenced
       * by stored values must keep its id and value, so existing records do not
       * lose their answers. Removed options are deactivated, not deleted.
       */
      const submittedValues = new Set(data.options.map((option) => option.value));
      for (const [index, option] of data.options.entries()) {
        await tx.fieldOption.upsert({
          where: { fieldDefinitionId_value: { fieldDefinitionId: fieldId, value: option.value } },
          create: { fieldDefinitionId: fieldId, value: option.value, label: option.label, displayOrder: index },
          update: { label: option.label, displayOrder: index, isActive: true },
        });
      }
      await tx.fieldOption.updateMany({
        where: { fieldDefinitionId: fieldId, value: { notIn: Array.from(submittedValues) } },
        data: { isActive: false },
      });

      await tx.fieldDefinitionCategory.deleteMany({ where: { fieldDefinitionId: fieldId } });
      if (data.categoryIds.length > 0) {
        await tx.fieldDefinitionCategory.createMany({
          data: data.categoryIds.map((categoryId) => ({ fieldDefinitionId: fieldId, categoryId })),
        });
      }

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: userId,
        action: "field.updated",
        targetType: "FieldDefinition",
        targetId: fieldId,
        metadata: { key: existing.key, isRequired: data.isRequired, hidden: data.hidden },
      });
    });

    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function archiveFieldAction(fieldId: string): Promise<ActionResult> {
  const existing = await db.fieldDefinition.findUnique({ where: { id: fieldId } });
  if (!existing) return { ok: false, error: "Field not found" };

  const access = await requireConfigAccess(existing.organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  // Archiving hides the field from forms but keeps captured values, so
  // un-archiving restores the data rather than resurrecting an empty field.
  await db.$transaction(async (tx) => {
    await tx.fieldDefinition.update({ where: { id: fieldId }, data: { archivedAt: new Date() } });
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: userId,
      action: "field.archived",
      targetType: "FieldDefinition",
      targetId: fieldId,
      metadata: { entityKey: existing.entityKey, key: existing.key },
    });
  });

  return { ok: true, data: undefined };
}

export async function reorderFieldsAction(organizationId: string, input: unknown): Promise<ActionResult> {
  const access = await requireConfigAccess(organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  const parsed = reorderFieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const owned = await db.fieldDefinition.findMany({
    where: { id: { in: parsed.data.orderedFieldIds }, organizationId: ctx.organizationId, entityKey: parsed.data.entityKey },
    select: { id: true },
  });
  if (owned.length !== parsed.data.orderedFieldIds.length) {
    return { ok: false, error: "One of those fields does not belong to this record type." };
  }

  await db.$transaction(async (tx) => {
    for (const [index, fieldId] of parsed.data.orderedFieldIds.entries()) {
      await tx.fieldDefinition.update({ where: { id: fieldId }, data: { displayOrder: index } });
    }
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: userId,
      action: "field.reordered",
      targetType: "FieldDefinition",
      metadata: { entityKey: parsed.data.entityKey, count: parsed.data.orderedFieldIds.length },
    });
  });

  return { ok: true, data: undefined };
}

export async function createSectionAction(organizationId: string, input: unknown): Promise<ActionResult> {
  const access = await requireConfigAccess(organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  const parsed = createSectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const duplicate = await db.fieldSection.findUnique({
    where: {
      organizationId_entityKey_key: {
        organizationId: ctx.organizationId,
        entityKey: parsed.data.entityKey,
        key: parsed.data.key,
      },
    },
  });
  if (duplicate) return { ok: false, error: "A section with this key already exists." };

  await db.$transaction(async (tx) => {
    const last = await tx.fieldSection.findFirst({
      where: { organizationId: ctx.organizationId, entityKey: parsed.data.entityKey },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });

    const created = await tx.fieldSection.create({
      data: {
        organizationId: ctx.organizationId,
        entityKey: parsed.data.entityKey,
        key: parsed.data.key,
        label: parsed.data.label,
        description: parsed.data.description || null,
        displayOrder: (last?.displayOrder ?? -1) + 1,
      },
    });

    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: userId,
      action: "field_section.created",
      targetType: "FieldSection",
      targetId: created.id,
      metadata: { entityKey: parsed.data.entityKey, key: parsed.data.key },
    });
  });

  return { ok: true, data: undefined };
}

/**
 * Turns selected category recommendations into real fields.
 *
 * Templates already applied are skipped rather than duplicated, so pressing
 * "Apply" twice is safe. Created fields are scoped to the category by default,
 * which is what makes Sleeve appear on Shirts but not on Jeans.
 */
export async function applyRecommendationsAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ createdCount: number; skippedCount: number }>> {
  const access = await requireConfigAccess(organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  const parsed = applyRecommendationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { categoryId, entityKey, templateKeys, scopeToCategory } = parsed.data;

  const entity = getEntityDefinition(entityKey);
  if (!entity) return { ok: false, error: "Unknown record type." };

  const category = await db.category.findFirst({ where: { id: categoryId, organizationId: ctx.organizationId } });
  if (!category) return { ok: false, error: "Category not found." };

  const result = await db.$transaction(async (tx) => {
    await ensureDefaultSections(tx, ctx.organizationId, entityKey);

    const sections = await tx.fieldSection.findMany({
      where: { organizationId: ctx.organizationId, entityKey },
      select: { id: true, key: true },
    });
    const sectionIdByKey = new Map(sections.map((section) => [section.key, section.id]));

    const existing = await tx.fieldDefinition.findMany({
      where: { organizationId: ctx.organizationId, entityKey },
      select: { id: true, key: true, templateKey: true },
    });
    const existingKeys = new Set(existing.map((field) => field.key));

    let createdCount = 0;
    let skippedCount = 0;
    let order = existing.length;

    for (const templateKey of templateKeys) {
      const template = getTemplate(templateKey);
      if (!template) {
        skippedCount += 1;
        continue;
      }

      const already = existing.find((field) => field.templateKey === templateKey || field.key === template.key);
      if (already) {
        // Already present for this entity — just widen its scope to include
        // this category instead of creating a second copy.
        if (scopeToCategory) {
          await tx.fieldDefinitionCategory.upsert({
            where: { fieldDefinitionId_categoryId: { fieldDefinitionId: already.id, categoryId } },
            create: { fieldDefinitionId: already.id, categoryId },
            update: {},
          });
        }
        skippedCount += 1;
        continue;
      }

      if (existingKeys.has(template.key)) {
        skippedCount += 1;
        continue;
      }

      const recommendation = await tx.categoryFieldRecommendation.findUnique({
        where: { categoryId_templateKey: { categoryId, templateKey } },
      });

      await tx.fieldDefinition.create({
        data: {
          organizationId: ctx.organizationId,
          entityKey,
          key: template.key,
          label: template.label,
          description: template.description ?? null,
          placeholder: template.placeholder ?? null,
          dataType: template.dataType,
          source: "CATEGORY",
          templateKey: template.key,
          isRequired: recommendation?.recommendRequired ?? false,
          displayOrder: order,
          sectionId: sectionIdByKey.get(template.sectionKey) ?? null,
          validation: template.validation ? (template.validation as Prisma.InputJsonValue) : undefined,
          options: {
            create: (template.options ?? []).map((option, index) => ({
              value: option.value,
              label: option.label,
              displayOrder: index,
            })),
          },
          categories: scopeToCategory ? { create: [{ categoryId }] } : undefined,
        },
      });

      existingKeys.add(template.key);
      createdCount += 1;
      order += 1;
    }

    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: userId,
      action: "field.recommendations_applied",
      targetType: "Category",
      targetId: categoryId,
      metadata: { entityKey, requested: templateKeys.length, created: createdCount, skipped: skippedCount },
    });

    return { createdCount, skippedCount };
  });

  return { ok: true, data: result };
}
