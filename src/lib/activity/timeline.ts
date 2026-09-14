import "server-only";
import { db } from "@/lib/db";
import { summarizeActivity } from "@/lib/customer/activity-summary";

/*
 * Timeline read model.
 *
 * Reads the existing Activity table — the business event log that records what
 * happened to a record. It deliberately does NOT merge in AuditLog: that is a
 * security trail (who changed a role, who exported data, who signed in) with a
 * different audience, retention expectation and permission. Blending the two
 * would put security events in front of anyone who can view a customer.
 *
 * Both share this shape, so a future unified read model can join them behind
 * one interface without the UI changing.
 */

export type TimelineSource = "activity" | "audit";

export interface TimelineEvent {
  id: string;
  type: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
  source: TimelineSource;
}

export async function getTimeline(
  organizationId: string,
  subjectType: string,
  subjectId: string,
  limit = 50,
): Promise<TimelineEvent[]> {
  const activities = await db.activity.findMany({
    where: { organizationId, subjectType, subjectId },
    include: { actor: { select: { name: true, email: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    summary: summarizeActivity(activity),
    actorName: activity.actor ? (activity.actor.name ?? activity.actor.email ?? activity.actor.phone) : null,
    createdAt: activity.createdAt.toISOString(),
    source: "activity" as const,
  }));
}
