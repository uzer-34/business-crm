"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createVehicleSchema, editVehicleSchema } from "@/lib/validation/vehicles";
import type { ActionResult } from "@/lib/auth/actions";

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

  const vehicle = await db.vehicle.create({
    data: {
      organizationId: ctx.organizationId,
      customerId,
      createdByUserId: user.id,
      ...parsed.data,
    },
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

  await db.vehicle.update({ where: { id: vehicleId }, data: parsed.data });
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

  await db.vehicle.update({ where: { id: vehicleId }, data: { archivedAt: new Date() } });
  return { ok: true, data: undefined };
}
