"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createCustomerSchema, editCustomerSchema } from "@/lib/validation/customer";
import { logActivity } from "./activity";
import { notifyMembership } from "@/lib/notifications/notify";
import type { ActionResult } from "@/lib/auth/actions";

export async function createCustomerAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ customerId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "customers.create");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, ...rest } = parsed.data;

  const customer = await db.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        organizationId: ctx.organizationId,
        email: email || undefined,
        ...rest,
        createdByUserId: user.id,
      },
    });

    await logActivity(tx, {
      organizationId: ctx.organizationId,
      subjectType: "Customer",
      subjectId: created.id,
      type: "customer.created",
      actorUserId: user.id,
    });

    return created;
  });

  return { ok: true, data: { customerId: customer.id } };
}

/**
 * Loads a customer scoped to the caller's membership. Never trusts a
 * client-supplied organizationId: the customer's own organizationId (read
 * from the database) is what gets checked against the caller's membership.
 */
async function loadCustomerContext(userId: string, customerId: string) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;

  const ctx = await loadTenantContext(userId, customer.organizationId);
  if (!ctx) return null;

  return { customer, ctx };
}

export async function assignCustomerAction(
  customerId: string,
  assignedToId: string | null,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadCustomerContext(user.id, customerId);
  if (!loaded) return { ok: false, error: "Customer not found" };
  const { ctx } = loaded;

  try {
    requirePermission(ctx, "customers.assign");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (assignedToId) {
    const targetMembership = await db.membership.findFirst({
      where: { id: assignedToId, organizationId: ctx.organizationId, status: "ACTIVE" },
    });
    if (!targetMembership) return { ok: false, error: "Employee not found in this organization" };
  }

  await db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customerId }, data: { assignedToId } });
    await logActivity(tx, {
      organizationId: ctx.organizationId,
      subjectType: "Customer",
      subjectId: customerId,
      type: "customer.assigned",
      actorUserId: user.id,
      metadata: { assignedToId },
    });

    if (assignedToId) {
      await notifyMembership(tx, {
        organizationId: ctx.organizationId,
        membershipId: assignedToId,
        actingMembershipId: ctx.membershipId,
        type: "CUSTOMER_ASSIGNED",
        message: `${loaded.customer.name} was assigned to you`,
        linkPath: `/customers/${customerId}`,
      });
    }
  });

  return { ok: true, data: undefined };
}

export async function editCustomerAction(customerId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadCustomerContext(user.id, customerId);
  if (!loaded) return { ok: false, error: "Customer not found" };
  const { ctx } = loaded;

  try {
    requirePermission(ctx, "customers.edit");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = editCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, ...rest } = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customerId }, data: { email: email || null, ...rest } });
    await logActivity(tx, {
      organizationId: ctx.organizationId,
      subjectType: "Customer",
      subjectId: customerId,
      type: "customer.updated",
      actorUserId: user.id,
    });
  });

  return { ok: true, data: undefined };
}

export async function archiveCustomerAction(customerId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadCustomerContext(user.id, customerId);
  if (!loaded) return { ok: false, error: "Customer not found" };
  const { ctx } = loaded;

  try {
    requirePermission(ctx, "customers.delete");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  await db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customerId }, data: { archivedAt: new Date() } });
    await logActivity(tx, {
      organizationId: ctx.organizationId,
      subjectType: "Customer",
      subjectId: customerId,
      type: "customer.archived",
      actorUserId: user.id,
    });
  });

  return { ok: true, data: undefined };
}
