import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * The user-facing business timeline (brief §18) — distinct from AuditLog,
 * which is the security/compliance trail and never rendered to end users.
 * subjectType/subjectId keep this generic so future modules (Sales, Orders,
 * ...) can append events without a schema change; customerId is a real FK
 * kept in sync for the common case so Customer 360 can query it directly.
 */
export async function logActivity(
  tx: Prisma.TransactionClient | typeof db,
  params: {
    organizationId: string;
    subjectType: "Customer";
    subjectId: string;
    type: string;
    actorUserId: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.activity.create({
    data: {
      organizationId: params.organizationId,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      customerId: params.subjectType === "Customer" ? params.subjectId : null,
      type: params.type,
      actorUserId: params.actorUserId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
