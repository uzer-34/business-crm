import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const ACTIVE_ORG_COOKIE_NAME = "active_org_id";

/**
 * Resolves which organization the user is currently viewing, re-checking
 * ACTIVE membership so a stale cookie can never select an org the user has
 * been removed from. Deliberately not exported from a "use server" module:
 * it takes a userId and must only ever be called with one derived from the
 * verified session, never from client input.
 */
export async function getActiveOrganizationId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;

  if (activeOrgId) {
    const membership = await db.membership.findFirst({
      where: { userId, organizationId: activeOrgId, status: "ACTIVE" },
      select: { organizationId: true },
    });
    if (membership) return membership.organizationId;
  }

  const fallback = await db.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { invitedAt: "asc" },
    select: { organizationId: true },
  });

  return fallback?.organizationId ?? null;
}
