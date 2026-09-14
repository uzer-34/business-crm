"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getActiveOrganizationId } from "@/lib/organization/active-org";
import { loadTenantContext } from "@/lib/rbac/guard";
import { db } from "@/lib/db";

/*
 * Global search backing the command palette.
 *
 * Every branch is scoped by organizationId resolved from the session (never
 * from the client) and gated on the same permission that guards the
 * corresponding list screen, so search can never surface a record the caller
 * could not open. Results are a flat, ranked list of {type, id, title,
 * subtitle, href} — a deliberately narrow shape so a future natural-language
 * layer can produce the same structure without the UI changing.
 */

export type SearchResultType = "customer" | "product" | "order" | "invoice" | "vehicle" | "supplier" | "task";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const PER_TYPE_LIMIT = 5;

export async function globalSearch(rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const user = await getCurrentUser();
  if (!user) return [];

  const organizationId = await getActiveOrganizationId(user.id);
  if (!organizationId) return [];

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return [];

  const contains = { contains: query, mode: "insensitive" as const };
  const can = (permission: string) => ctx.permissions.has(permission as never);

  const [customers, products, orders, invoices, vehicles, suppliers, tasks] = await Promise.all([
    can("customers.view")
      ? db.customer.findMany({
          where: {
            organizationId,
            archivedAt: null,
            OR: [{ name: contains }, { email: contains }, { phone: contains }, { companyName: contains }],
          },
          select: { id: true, name: true, email: true, phone: true },
          take: PER_TYPE_LIMIT,
        })
      : [],
    can("products.view")
      ? db.product.findMany({
          where: { organizationId, archivedAt: null, OR: [{ name: contains }, { sku: contains }, { barcode: contains }] },
          select: { id: true, name: true, sku: true },
          take: PER_TYPE_LIMIT,
        })
      : [],
    can("sales.view")
      ? db.order.findMany({
          where: { organizationId, OR: [{ orderNumber: contains }, { customer: { name: contains } }] },
          select: { id: true, orderNumber: true, customer: { select: { name: true } } },
          take: PER_TYPE_LIMIT,
        })
      : [],
    can("invoices.view")
      ? db.invoice.findMany({
          where: { organizationId, OR: [{ invoiceNumber: contains }, { customer: { name: contains } }] },
          select: { id: true, invoiceNumber: true, customer: { select: { name: true } } },
          take: PER_TYPE_LIMIT,
        })
      : [],
    can("vehicles.view")
      ? db.vehicle.findMany({
          where: {
            organizationId,
            archivedAt: null,
            OR: [{ plateNumber: contains }, { make: contains }, { model: contains }, { vin: contains }],
          },
          select: { id: true, make: true, model: true, plateNumber: true },
          take: PER_TYPE_LIMIT,
        })
      : [],
    can("suppliers.view")
      ? db.supplier.findMany({
          where: { organizationId, archivedAt: null, OR: [{ name: contains }, { email: contains }, { phone: contains }] },
          select: { id: true, name: true, email: true },
          take: PER_TYPE_LIMIT,
        })
      : [],
    can("tasks.view")
      ? db.task.findMany({
          where: { organizationId, title: contains },
          select: { id: true, title: true, status: true, customerId: true },
          take: PER_TYPE_LIMIT,
        })
      : [],
  ]);

  return [
    ...customers.map((row) => ({
      type: "customer" as const,
      id: row.id,
      title: row.name,
      subtitle: row.email ?? row.phone,
      href: `/customers/${row.id}`,
    })),
    ...orders.map((row) => ({
      type: "order" as const,
      id: row.id,
      title: row.orderNumber,
      subtitle: row.customer?.name ?? null,
      href: `/orders/${row.id}`,
    })),
    ...invoices.map((row) => ({
      type: "invoice" as const,
      id: row.id,
      title: row.invoiceNumber,
      subtitle: row.customer?.name ?? null,
      href: `/invoices/${row.id}`,
    })),
    ...products.map((row) => ({
      type: "product" as const,
      id: row.id,
      title: row.name,
      subtitle: row.sku,
      href: `/products/${row.id}`,
    })),
    ...vehicles.map((row) => ({
      type: "vehicle" as const,
      id: row.id,
      title: [row.make, row.model].filter(Boolean).join(" "),
      subtitle: row.plateNumber,
      href: `/vehicles/${row.id}`,
    })),
    ...suppliers.map((row) => ({
      type: "supplier" as const,
      id: row.id,
      title: row.name,
      subtitle: row.email,
      href: `/suppliers/${row.id}`,
    })),
    ...tasks.map((row) => ({
      type: "task" as const,
      id: row.id,
      title: row.title,
      subtitle: row.status,
      href: row.customerId ? `/customers/${row.customerId}?tab=tasks` : "/tasks",
    })),
  ];
}
