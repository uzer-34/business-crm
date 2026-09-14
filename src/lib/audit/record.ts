import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/*
 * Audit trail writer.
 *
 * Distinct from `logActivity`: Activity is the business event log shown on a
 * record's timeline, while AuditLog is the security/compliance trail of who
 * changed what — different audience, different retention, different
 * permission to read. Some operations legitimately write both.
 *
 * Always called with the surrounding transaction client so the audit row
 * commits or rolls back with the change it describes; an audit entry for a
 * write that never landed is worse than none.
 *
 * Never put secrets, OTP codes or full record snapshots in `metadata` — only
 * the identifying fields needed to understand what changed.
 */

export interface AuditEntry {
  organizationId: string;
  actorUserId: string | null;
  /** Namespaced, past tense, e.g. "customer.updated", "field.archived". */
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export async function recordAudit(client: AuditClient, entry: AuditEntry): Promise<void> {
  await client.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata,
    },
  });
}
