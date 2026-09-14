"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createOrganizationSchema, changeIndustrySchema } from "@/lib/validation/organization";
import { createOrganizationForUser } from "./create-organization";
import type { ActionResult } from "@/lib/auth/actions";

const ACTIVE_ORG_COOKIE_NAME = "active_org_id";

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
 * Loads the current user's ACTIVE membership for the org they're currently
 * viewing — the one named by the `active_org_id` cookie, or (no cookie, or
 * it names an org they're no longer a member of) the first membership
 * found. Also returns every ACTIVE membership so the UI can render a
 * switcher when there's more than one. Never used to authorize a mutation:
 * server actions/route handlers must call loadTenantContext with an
 * explicit organizationId instead.
 */
export async function getDefaultMembershipOrRedirect() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const memberships = await db.membership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true, role: true },
    orderBy: { invitedAt: "asc" },
  });

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;
  const membership = memberships.find((m) => m.organizationId === activeOrgId) ?? memberships[0];

  return { user, membership, memberships };
}

// Switches which org subsequent page loads resolve to via
// getDefaultMembershipOrRedirect, for a user who belongs to more than one.
// Purely a UI preference, not a security boundary — every mutation still
// derives its organizationId from loadTenantContext(userId, orgId), which
// re-checks ACTIVE membership from the database regardless of this cookie.
export async function switchOrganizationAction(organizationId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const membership = await db.membership.findFirst({
    where: { userId: user.id, organizationId, status: "ACTIVE" },
  });
  if (!membership) return { ok: false, error: "Not a member of this organization" };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE_NAME, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { ok: true, data: undefined };
}
