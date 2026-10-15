"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { loadAccessibleCustomerContext } from "./access";
import { createNoteSchema } from "@/lib/validation/customer";
import { logActivity } from "./activity";
import { recordAudit } from "@/lib/audit/record";
import type { ActionResult } from "@/lib/auth/actions";

export async function addNoteAction(customerId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadAccessibleCustomerContext(user.id, customerId);
  if (!loaded) return { ok: false, error: "Customer not found" };
  const { ctx } = loaded;

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

    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "note.added",
      targetType: "Customer",
      targetId: customerId,
    });
  });

  return { ok: true, data: undefined };
}
