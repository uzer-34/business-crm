import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export type MonthlyRevenuePoint = { monthLabel: string; total: string };
export type TopCustomer = { customerId: string; name: string; total: string };
export type TopProduct = { productId: string; name: string; quantity: number };
export type ExpenseCategoryTotal = { categoryId: string | null; categoryName: string; total: string };

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

// Prisma can't group by a truncated date directly, so this fetches the raw
// rows for the window and buckets them in JS — the same approach
// loadLowStock (dashboard) already uses for a comparison Prisma's query
// builder can't express. Fine at the scale a single org's invoice volume
// reaches over 6 months; revisit with a raw query if that stops being true.
export async function getMonthlyRevenueTrend(organizationId: string, months = 6): Promise<MonthlyRevenuePoint[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const invoices = await db.invoice.findMany({
    where: { organizationId, status: "ISSUED", issuedAt: { gte: start } },
    select: { issuedAt: true, total: true },
  });

  const buckets = new Map<string, Prisma.Decimal>();
  const labels = new Map<string, string>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    const key = monthKey(d);
    buckets.set(key, new Prisma.Decimal(0));
    labels.set(key, monthLabel(d));
  }

  for (const invoice of invoices) {
    const key = monthKey(invoice.issuedAt);
    const current = buckets.get(key);
    if (current) buckets.set(key, current.plus(invoice.total));
  }

  return Array.from(buckets.entries()).map(([key, total]) => ({
    monthLabel: labels.get(key) ?? key,
    total: total.toString(),
  }));
}

export async function getTopCustomersByRevenue(organizationId: string, take = 5, days = 180): Promise<TopCustomer[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const grouped = await db.invoice.groupBy({
    by: ["customerId"],
    where: { organizationId, status: "ISSUED", customerId: { not: null }, issuedAt: { gte: since } },
    _sum: { total: true },
    orderBy: { _sum: { total: "desc" } },
    take,
  });

  const customerIds = grouped.map((g) => g.customerId).filter((id): id is string => Boolean(id));
  const customers = await db.customer.findMany({ where: { id: { in: customerIds } } });
  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  return grouped
    .filter((g): g is typeof g & { customerId: string } => Boolean(g.customerId))
    .map((g) => ({
      customerId: g.customerId,
      name: nameById.get(g.customerId) ?? "Unknown",
      total: (g._sum.total ?? new Prisma.Decimal(0)).toString(),
    }));
}

export async function getTopProductsByQuantityFulfilled(
  organizationId: string,
  take = 5,
  days = 180,
): Promise<TopProduct[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const grouped = await db.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null }, order: { organizationId, createdAt: { gte: since } } },
    _sum: { quantityFulfilled: true },
    orderBy: { _sum: { quantityFulfilled: "desc" } },
    take,
  });

  const productIds = grouped.map((g) => g.productId).filter((id): id is string => Boolean(id));
  const products = await db.product.findMany({ where: { id: { in: productIds } } });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  return grouped
    .filter((g): g is typeof g & { productId: string } => Boolean(g.productId))
    .map((g) => ({
      productId: g.productId,
      name: nameById.get(g.productId) ?? "Unknown",
      quantity: g._sum.quantityFulfilled ?? 0,
    }));
}

export async function getExpenseBreakdownByCategory(
  organizationId: string,
  days = 30,
): Promise<ExpenseCategoryTotal[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const grouped = await db.expense.groupBy({
    by: ["categoryId"],
    where: { organizationId, status: "RECORDED", incurredAt: { gte: since } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });

  const categoryIds = grouped.map((g) => g.categoryId).filter((id): id is string => Boolean(id));
  const categories = await db.category.findMany({ where: { id: { in: categoryIds } } });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return grouped.map((g) => ({
    categoryId: g.categoryId,
    categoryName: g.categoryId ? (nameById.get(g.categoryId) ?? "Unknown") : "Uncategorized",
    total: (g._sum.amount ?? new Prisma.Decimal(0)).toString(),
  }));
}
