"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createTaskSchema } from "@/lib/validation/customer";
import { logActivity } from "./activity";
import { recordAudit } from "@/lib/audit/record";
import { notifyMembership } from "@/lib/notifications/notify";
import type { ActionResult } from "@/lib/auth/actions";

export async function createTaskAction(customerId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Customer not found" };

  const ctx = await loadTenantContext(user.id, customer.organizationId);
  if (!ctx) return { ok: false, error: "Customer not found" };

  try {
    requirePermission(ctx, "customers.edit");
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
        customerId,
        title: parsed.data.title,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
        assignedToId: parsed.data.assignedToId,
        createdByUserId: user.id,
      },
    });

    await logActivity(tx, {
      organizationId: ctx.organizationId,
      subjectType: "Customer",
      subjectId: customerId,
      type: "task.created",
      actorUserId: user.id,
      metadata: { title: parsed.data.title },
    });

    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "task.created",
      targetType: "Customer",
      targetId: customerId,
      metadata: { title: parsed.data.title },
    });

    if (parsed.data.assignedToId) {
      await notifyMembership(tx, {
        organizationId: ctx.organizationId,
        membershipId: parsed.data.assignedToId,
        actingMembershipId: ctx.membershipId,
        type: "TASK_ASSIGNED",
        message: `New task: ${parsed.data.title}`,
        linkPath: `/customers/${customerId}`,
      });
    }
  });

  return { ok: true, data: undefined };
}

export async function completeTaskAction(taskId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found" };

  const ctx = await loadTenantContext(user.id, task.organizationId);
  if (!ctx) return { ok: false, error: "Task not found" };

  // Completing your own assigned task is always allowed; completing one
  // assigned to someone else needs the module permission that applies
  // (customers.edit for a customer-linked task, tasks.edit otherwise).
  const canComplete =
    task.assignedToId === ctx.membershipId ||
    ctx.permissions.has(task.customerId ? "customers.edit" : "tasks.edit");
  if (!canComplete) {
    return { ok: false, error: "Missing permission to complete this task" };
  }

  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: "DONE", completedAt: new Date() },
    });

    if (task.customerId) {
      await logActivity(tx, {
        organizationId: ctx.organizationId,
        subjectType: "Customer",
        subjectId: task.customerId,
        type: "task.completed",
        actorUserId: user.id,
        metadata: { title: task.title },
      });
    }

    // Recorded for every task, including standalone ones with no customer.
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "task.completed",
      targetType: "Task",
      targetId: taskId,
      metadata: { title: task.title },
    });
  });

  return { ok: true, data: undefined };
}
