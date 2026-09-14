import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  buildListResult,
  parseListQuery,
  toPrismaPagination,
  type ListQuery,
  type ListResult,
  type RawSearchParams,
} from "@/lib/list-view/query";

export const AUDIT_LIST_CONFIG = {
  sortableKeys: ["createdAt"] as const,
  filterKeys: ["action", "actorUserId", "targetType", "from", "to"] as const,
  defaultSort: "createdAt",
  defaultDirection: "desc" as const,
};

export interface AuditListRow {
  id: string;
  action: string;
  actorName: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export function parseAuditListQuery(params: RawSearchParams): ListQuery {
  return parseListQuery(params, AUDIT_LIST_CONFIG);
}

export function buildAuditWhere(organizationId: string, query: ListQuery): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { organizationId };

  if (query.filters.action) where.action = query.filters.action;
  if (query.filters.actorUserId) where.actorUserId = query.filters.actorUserId;
  if (query.filters.targetType) where.targetType = query.filters.targetType;

  // Dates arrive as YYYY-MM-DD; `to` is made inclusive by advancing a day.
  const from = query.filters.from ? new Date(query.filters.from) : null;
  const to = query.filters.to ? new Date(query.filters.to) : null;
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    where.createdAt = {};
    if (from && !Number.isNaN(from.getTime())) where.createdAt.gte = from;
    if (to && !Number.isNaN(to.getTime())) {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      where.createdAt.lt = end;
    }
  }

  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    where.OR = [{ action: contains }, { targetType: contains }, { targetId: contains }];
  }

  return where;
}

export async function getAuditList(organizationId: string, query: ListQuery): Promise<ListResult<AuditListRow>> {
  const where = buildAuditWhere(organizationId, query);
  const { skip, take } = toPrismaPagination(query);

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actorUser: { select: { name: true, email: true, phone: true } } },
      orderBy: { createdAt: query.dir },
      skip,
      take,
    }),
    db.auditLog.count({ where }),
  ]);

  const rows: AuditListRow[] = entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actorName: entry.actorUser
      ? (entry.actorUser.name ?? entry.actorUser.email ?? entry.actorUser.phone ?? "Unknown")
      : "System",
    targetType: entry.targetType,
    targetId: entry.targetId,
    createdAt: entry.createdAt.toISOString(),
  }));

  return buildListResult(rows, total, query);
}

/** Distinct action keys actually present for this org, for the filter list. */
export async function getAuditActions(organizationId: string): Promise<string[]> {
  const grouped = await db.auditLog.groupBy({
    by: ["action"],
    where: { organizationId },
    orderBy: { action: "asc" },
  });
  return grouped.map((entry) => entry.action);
}
