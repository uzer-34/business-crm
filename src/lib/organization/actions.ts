"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { createOrganizationSchema } from "@/lib/validation/organization";
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
