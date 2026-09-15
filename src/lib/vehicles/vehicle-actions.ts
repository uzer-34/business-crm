"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createVehicleSchema, editVehicleSchema } from "@/lib/validation/vehicles";
import { recordAudit } from "@/lib/audit/record";
import { prepareFieldValues } from "@/lib/metadata/save-values";
import { ensureDefaultSections } from "@/lib/metadata/field-service";
import { ATTRIBUTE_TEMPLATES } from "@/lib/metadata/attribute-library";
import { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "@/lib/auth/actions";

// The standard vehicle attribute set, in display order.
const VEHICLE_TEMPLATE_KEYS = [
  "registration_number",
  "vin",
  "engine_number",
  "make",
  "model",
  "variant",
  "manufacture_year",
  "fuel",
  "transmission",
  "odometer",
  "vehicle_colour",
  "insurance_provider",
  "insurance_policy_number",
  "insurance_expiry",
  "warranty_expiry",
  "purchase_date",
];

export async function createVehicleAction(
  customerId: string,
  input: unknown,
): Promise<ActionResult<{ vehicleId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Customer not found" };

  const ctx = await loadTenantContext(user.id, customer.organizationId);
  if (!ctx) return { ok: false, error: "Customer not found" };

  try {
    requirePermission(ctx, "vehicles.create");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const vehicle = await db.$transaction(async (tx) => {
    const created = await tx.vehicle.create({
      data: {
        organizationId: ctx.organizationId,
        customerId,
        createdByUserId: user.id,
        ...parsed.data,
      },
    });

    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "vehicle.created",
      targetType: "Vehicle",
      targetId: created.id,
      metadata: { customerId },
    });

    return created;
  });

  return { ok: true, data: { vehicleId: vehicle.id } };
}

export async function editVehicleAction(vehicleId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  const ctx = await loadTenantContext(user.id, vehicle.organizationId);
  if (!ctx) return { ok: false, error: "Vehicle not found" };

  try {
    requirePermission(ctx, "vehicles.edit");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = editVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: parsed.data });
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "vehicle.updated",
      targetType: "Vehicle",
      targetId: vehicleId,
    });
  });

  return { ok: true, data: undefined };
}

export async function archiveVehicleAction(vehicleId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  const ctx = await loadTenantContext(user.id, vehicle.organizationId);
  if (!ctx) return { ok: false, error: "Vehicle not found" };

  try {
    requirePermission(ctx, "vehicles.archive");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  await db.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { archivedAt: new Date() } });
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "vehicle.archived",
      targetType: "Vehicle",
      targetId: vehicleId,
    });
  });

  return { ok: true, data: undefined };
}

/**
 * Installs the standard vehicle attribute set from the code template library.
 *
 * This is the Vehicle proof: the workshop gets registration number, VIN,
 * engine number, make/model/variant, year, fuel, transmission, odometer,
 * colour, insurance and warranty as real configured fields, rather than those
 * columns being hardcoded onto the Vehicle page. Already-installed templates
 * are skipped, so running it twice is safe.
 */
export async function installVehicleAttributesAction(
  organizationId: string,
): Promise<ActionResult<{ createdCount: number }>> {
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

  const createdCount = await db.$transaction(async (tx) => {
    await ensureDefaultSections(tx, ctx.organizationId, "vehicle");

    const sections = await tx.fieldSection.findMany({
      where: { organizationId: ctx.organizationId, entityKey: "vehicle" },
      select: { id: true, key: true },
    });
    const sectionIdByKey = new Map(sections.map((section) => [section.key, section.id]));

    const existing = await tx.fieldDefinition.findMany({
      where: { organizationId: ctx.organizationId, entityKey: "vehicle" },
      select: { key: true },
    });
    const existingKeys = new Set(existing.map((field) => field.key));

    const templates = ATTRIBUTE_TEMPLATES.filter((template) =>
      VEHICLE_TEMPLATE_KEYS.includes(template.key),
    );

    let created = 0;
    for (const [index, template] of templates.entries()) {
      if (existingKeys.has(template.key)) continue;

      await tx.fieldDefinition.create({
        data: {
          organizationId: ctx.organizationId,
          entityKey: "vehicle",
          key: template.key,
          label: template.label,
          description: template.description ?? null,
          dataType: template.dataType,
          source: "SYSTEM",
          templateKey: template.key,
          displayOrder: index,
          sectionId: sectionIdByKey.get(template.sectionKey) ?? null,
          validation: template.validation ? (template.validation as Prisma.InputJsonValue) : undefined,
          options: {
            create: (template.options ?? []).map((option, optionIndex) => ({
              value: option.value,
              label: option.label,
              displayOrder: optionIndex,
            })),
          },
        },
      });
      created += 1;
    }

    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "field.vehicle_defaults_installed",
      targetType: "FieldDefinition",
      metadata: { created },
    });

    return created;
  });

  return { ok: true, data: { createdCount } };
}

export async function saveVehicleAttributesAction(
  vehicleId: string,
  fieldValues: Record<string, unknown>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  const ctx = await loadTenantContext(user.id, vehicle.organizationId);
  if (!ctx) return { ok: false, error: "Vehicle not found" };

  try {
    requirePermission(ctx, "vehicles.edit");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const prepared = await prepareFieldValues(ctx.organizationId, "vehicle", fieldValues);
  if (!prepared.ok) return { ok: false, error: prepared.error };

  await db.$transaction(async (tx) => {
    await prepared.apply(tx, vehicleId);
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "vehicle.attributes_updated",
      targetType: "Vehicle",
      targetId: vehicleId,
    });
  });

  return { ok: true, data: undefined };
}
