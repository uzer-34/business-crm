import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * In-app only (see the Notification model's own comment) — this is the
 * shared write path every trigger site calls. Never notifies a membership
 * about its own action (e.g. assigning a task to yourself).
 */
export async function notifyMembership(
  tx: Prisma.TransactionClient | typeof db,
  params: {
    organizationId: string;
    membershipId: string;
    actingMembershipId: string | null;
    type: "TASK_ASSIGNED" | "CUSTOMER_ASSIGNED";
    message: string;
    linkPath?: string;
  },
) {
  if (params.membershipId === params.actingMembershipId) return;

  await tx.notification.create({
    data: {
      organizationId: params.organizationId,
      membershipId: params.membershipId,
      type: params.type,
      message: params.message,
      linkPath: params.linkPath,
    },
  });
}
