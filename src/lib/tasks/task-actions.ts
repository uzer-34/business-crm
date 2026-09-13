"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createTaskSchema } from "@/lib/validation/customer";
import { notifyMembership } from "@/lib/notifications/notify";
import type { ActionResult } from "@/lib/auth/actions";

// A task not tied to any customer — team/back-office work (e.g. "restock
// shelves", "call the accountant"). Gated by tasks.create rather than
// customers.edit since it has nothing to do with the customer module.
// Completing it goes through the same completeTaskAction customer-scoped
// tasks use (see src/lib/customer/tasks-actions.ts) — one Task model, one
// completion path, regardless of how the task was created.
export async function createStandaloneTaskAction(organizationId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "tasks.create");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (parsed.data.assignedToId) {
    const target = await db.membership.findFirst({
      where: { id: parsed.data.assignedToId, organizationId: ctx.organizationId, status: "ACTIVE" },
    });
    if (!target) return { ok: false, error: "Employee not found in this organization" };
  }

  await db.$transaction(async (tx) => {
    await tx.task.create({
      data: {
        organizationId: ctx.organizationId,
        title: parsed.data.title,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
        assignedToId: parsed.data.assignedToId,
        createdByUserId: user.id,
      },
    });

    if (parsed.data.assignedToId) {
      await notifyMembership(tx, {
        organizationId: ctx.organizationId,
        membershipId: parsed.data.assignedToId,
        actingMembershipId: ctx.membershipId,
        type: "TASK_ASSIGNED",
        message: `New task: ${parsed.data.title}`,
        linkPath: "/tasks",
      });
    }
  });

  return { ok: true, data: undefined };
}
