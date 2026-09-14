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

export const CUSTOMER_LIST_CONFIG = {
  sortableKeys: ["name", "status", "createdAt"] as const,
  filterKeys: ["status", "type", "assignedToId", "branchId", "archived"] as const,
  defaultSort: "createdAt",
  defaultDirection: "desc" as const,
};

export interface CustomerListRow {
  id: string;
  name: string;
  type: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  ownerName: string | null;
  branchName: string | null;
  tags: string[];
  createdAt: string;
  lastActivityAt: string | null;
  archived: boolean;
}

export function parseCustomerListQuery(params: RawSearchParams): ListQuery {
  return parseListQuery(params, CUSTOMER_LIST_CONFIG);
}

/**
 * Builds the Prisma filter for a customer list view. Exported separately from
 * the query so the same predicate can be unit tested without a database, and
 * so `organizationId` is always an explicit argument rather than something a
 * caller can forget.
 */
export function buildCustomerWhere(organizationId: string, query: ListQuery): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { organizationId };

  // Archived records are hidden unless explicitly asked for, so a normal list
  // never mixes live and archived rows.
  where.archivedAt = query.filters.archived === "true" ? { not: null } : null;

  if (query.filters.status) where.status = query.filters.status as Prisma.CustomerWhereInput["status"];
  if (query.filters.type) where.type = query.filters.type as Prisma.CustomerWhereInput["type"];
  if (query.filters.assignedToId) where.assignedToId = query.filters.assignedToId;
  if (query.filters.branchId) where.branchId = query.filters.branchId;

  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    where.OR = [{ name: contains }, { companyName: contains }, { email: contains }, { phone: contains }];
  }

  return where;
}

function buildOrderBy(query: ListQuery): Prisma.CustomerOrderByWithRelationInput {
  const direction = query.dir;
  switch (query.sort) {
    case "name":
      return { name: direction };
    case "status":
      return { status: direction };
    default:
      return { createdAt: direction };
  }
}

export async function getCustomerList(organizationId: string, query: ListQuery): Promise<ListResult<CustomerListRow>> {
  const where = buildCustomerWhere(organizationId, query);
  const { skip, take } = toPrismaPagination(query);

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        assignedTo: { include: { user: { select: { name: true, email: true, phone: true } } } },
        branch: { select: { name: true } },
      },
      orderBy: buildOrderBy(query),
      skip,
      take,
    }),
    db.customer.count({ where }),
  ]);

  // One grouped query for the page's rows rather than a per-row lookup.
  const lastActivity = await db.activity.groupBy({
    by: ["customerId"],
    where: { organizationId, customerId: { in: customers.map((customer) => customer.id) } },
    _max: { createdAt: true },
  });
  const lastActivityById = new Map(
    lastActivity.map((entry) => [entry.customerId, entry._max.createdAt?.toISOString() ?? null]),
  );

  const rows: CustomerListRow[] = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    type: customer.type,
    companyName: customer.companyName,
    email: customer.email,
    phone: customer.phone,
    status: customer.status,
    ownerName: customer.assignedTo
      ? (customer.assignedTo.user.name ?? customer.assignedTo.user.email ?? customer.assignedTo.user.phone)
      : null,
    branchName: customer.branch?.name ?? null,
    tags: customer.tags,
    createdAt: customer.createdAt.toISOString(),
    lastActivityAt: customer.id ? (lastActivityById.get(customer.id) ?? null) : null,
    archived: customer.archivedAt !== null,
  }));

  return buildListResult(rows, total, query);
}
