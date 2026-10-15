import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getActiveOrganizationId } from "@/lib/organization/active-org";
import { assertBranchAccess, ForbiddenError, getAccessibleBranchIds, loadTenantContext, type TenantContext } from "@/lib/rbac/guard";

/**
 * Builds the server-side Customer scope shared by search, selectors, and
 * Customer-linked lookups. Null-branch Customers remain organization-wide.
 */
export function buildAccessibleCustomerWhere(
  organizationId: string,
  accessibleBranchIds: readonly string[],
  extra?: Prisma.CustomerWhereInput,
): Prisma.CustomerWhereInput {
  return {
    AND: [
      { organizationId },
      { OR: [{ branchId: null }, { branchId: { in: [...accessibleBranchIds] } }] },
      ...(extra ? [extra] : []),
    ],
  };
}

export async function getAccessibleCustomerWhere(
  ctx: TenantContext,
  extra?: Prisma.CustomerWhereInput,
): Promise<Prisma.CustomerWhereInput> {
  const accessibleBranchIds = await getAccessibleBranchIds(ctx);
  return buildAccessibleCustomerWhere(ctx.organizationId, accessibleBranchIds, extra);
}

export async function getAccessibleCustomerNames(
  ctx: TenantContext,
  customerIds: readonly string[],
): Promise<Map<string, string>> {
  if (customerIds.length === 0) return new Map();

  const customers = await db.customer.findMany({
    where: await getAccessibleCustomerWhere(ctx, { id: { in: [...new Set(customerIds)] } }),
    select: { id: true, name: true },
  });
  return new Map(customers.map((customer) => [customer.id, customer.name]));
}

export async function listAccessibleCustomerOptions(ctx: TenantContext) {
  return db.customer.findMany({
    where: await getAccessibleCustomerWhere(ctx, { archivedAt: null }),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function loadAccessibleCustomerForOrganization(
  userId: string,
  customerId: string,
  organizationId: string,
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId },
    include: {
      organization: { select: { industryKey: true, currencyCode: true, locale: true, timezone: true } },
      branch: { select: { name: true } },
    },
  });
  if (!customer) return null;

  const ctx = await loadTenantContext(userId, organizationId);
  if (!ctx) return null;

  if (customer.branchId) {
    try {
      await assertBranchAccess(ctx, customer.branchId);
    } catch (error) {
      if (error instanceof ForbiddenError) return null;
      throw error;
    }
  }

  return { customer, ctx };
}

/**
 * Loads a customer only when the caller has an active membership in its
 * active organization and access to its assigned branch. A null branch
 * remains organization-wide, matching the approved CRM scope semantics.
 */
export async function loadAccessibleCustomerContext(userId: string, customerId: string) {
  const organizationId = await getActiveOrganizationId(userId);
  if (!organizationId) return null;
  return loadAccessibleCustomerForOrganization(userId, customerId, organizationId);
}

/** Loads a Customer only when it is visible in the specified tenant. */
export async function loadAccessibleCustomerInOrganization(
  userId: string,
  customerId: string,
  organizationId: string,
) {
  const activeOrganizationId = await getActiveOrganizationId(userId);
  if (activeOrganizationId !== organizationId) return null;
  return loadAccessibleCustomerForOrganization(userId, customerId, organizationId);
}
