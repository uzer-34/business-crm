"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, assertBranchAccess, ForbiddenError } from "@/lib/rbac/guard";
import { createExpenseSchema } from "@/lib/validation/expenses";
import { findOrCreateCategory } from "@/lib/catalog/category";
import type { ActionResult } from "@/lib/auth/actions";

export async function createExpenseAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ expenseId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "expenses.create");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await assertBranchAccess(ctx, parsed.data.branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const expense = await db.$transaction(async (tx) => {
    const { categoryName, ...rest } = parsed.data;
    const categoryId = categoryName
      ? await findOrCreateCategory(tx, { organizationId: ctx.organizationId, kind: "EXPENSE", name: categoryName })
      : undefined;

    const created = await tx.expense.create({
      data: {
        organizationId: ctx.organizationId,
        categoryId,
        recordedByUserId: user.id,
        ...rest,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "expense.created",
        targetType: "Expense",
        targetId: created.id,
        metadata: { amount: created.amount.toString(), method: created.method },
      },
    });

    return created;
  });

  return { ok: true, data: { expenseId: expense.id } };
}

export async function voidExpenseAction(expenseId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const expense = await db.expense.findUnique({ where: { id: expenseId } });
  if (!expense) return { ok: false, error: "Expense not found" };

  const ctx = await loadTenantContext(user.id, expense.organizationId);
  if (!ctx) return { ok: false, error: "Expense not found" };

  try {
    requirePermission(ctx, "expenses.void");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (expense.status === "VOID") {
    return { ok: false, error: "This expense is already void" };
  }

  await db.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id: expenseId },
      data: { status: "VOID", voidedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "expense.voided",
        targetType: "Expense",
        targetId: expenseId,
      },
    });
  });

  return { ok: true, data: undefined };
}
