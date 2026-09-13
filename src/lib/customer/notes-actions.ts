"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createNoteSchema } from "@/lib/validation/customer";
import { logActivity } from "./activity";
import type { ActionResult } from "@/lib/auth/actions";

export async function addNoteAction(customerId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Customer not found" };

  const ctx = await loadTenantContext(user.id, customer.organizationId);
  if (!ctx) return { ok: false, error: "Customer not found" };

  try {
    // Notes are child records of a customer — gated on the same permission
    // as editing the customer rather than a separate notes.* permission.
    requirePermission(ctx, "customers.edit");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.$transaction(async (tx) => {
    await tx.note.create({
      data: {
        organizationId: ctx.organizationId,
        customerId,
        authorUserId: user.id,
        body: parsed.data.body,
      },
    });

    await logActivity(tx, {
      organizationId: ctx.organizationId,
      subjectType: "Customer",
      subjectId: customerId,
      type: "note.added",
      actorUserId: user.id,
    });
  });

  return { ok: true, data: undefined };
}
