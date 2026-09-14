"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createOrganizationSchema, changeIndustrySchema } from "@/lib/validation/organization";
import { createOrganizationForUser } from "./create-organization";
import type { ActionResult } from "@/lib/auth/actions";

export async function createOrganizationAction(
  input: unknown,
): Promise<ActionResult<{ organizationId: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Not signed in" };
  }

  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const organization = await createOrganizationForUser(user.id, parsed.data);
  return { ok: true, data: { organizationId: organization.id } };
}

export async function changeIndustryAction(organizationId: string, input: unknown): Promise<ActionResult> {
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

  const parsed = changeIndustrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { industryKey: parsed.data.industryKey },
    });
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "organization.industry_changed",
        targetType: "Organization",
        targetId: ctx.organizationId,
        metadata: { industryKey: parsed.data.industryKey },
      },
    });
  });

  return { ok: true, data: undefined };
}

/**
 * Loads the first ACTIVE membership for the current user, or null. Phase 1
 * has no organization switcher UI yet — a user with multiple orgs always
 * lands on the first one found. Never used to authorize a mutation: server
 * actions/route handlers must call loadTenantContext with an explicit
 * organizationId instead.
 */
export async function getDefaultMembershipOrRedirect() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const membership = await db.membership.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true, role: true },
    orderBy: { invitedAt: "asc" },
  });

  if (!membership) {
    redirect("/onboarding");
  }

  return { user, membership };
}
