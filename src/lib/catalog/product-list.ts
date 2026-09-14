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

export const PRODUCT_LIST_CONFIG = {
  sortableKeys: ["name", "sku", "sellingPrice", "createdAt"] as const,
  filterKeys: ["categoryId", "archived", "lowStock"] as const,
  defaultSort: "createdAt",
  defaultDirection: "desc" as const,
};

export interface ProductListRow {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  categoryName: string | null;
  sellingPrice: string;
  costPrice: string;
  unit: string;
  variantCount: number;
  stockQuantity: number;
  reorderPoint: number | null;
  createdAt: string;
  archived: boolean;
}

export function parseProductListQuery(params: RawSearchParams): ListQuery {
  return parseListQuery(params, PRODUCT_LIST_CONFIG);
}

export function buildProductWhere(organizationId: string, query: ListQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { organizationId };

  where.archivedAt = query.filters.archived === "true" ? { not: null } : null;

  if (query.filters.categoryId) where.categoryId = query.filters.categoryId;

  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    where.OR = [{ name: contains }, { sku: contains }, { barcode: contains }, { brand: contains }];
  }

  return where;
}

function buildOrderBy(query: ListQuery): Prisma.ProductOrderByWithRelationInput {
  switch (query.sort) {
    case "name":
      return { name: query.dir };
    case "sku":
      return { sku: query.dir };
    case "sellingPrice":
      return { sellingPrice: query.dir };
    default:
      return { createdAt: query.dir };
  }
}

export async function getProductList(organizationId: string, query: ListQuery): Promise<ListResult<ProductListRow>> {
  const where = buildProductWhere(organizationId, query);
  const { skip, take } = toPrismaPagination(query);

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        _count: { select: { variants: true } },
      },
      orderBy: buildOrderBy(query),
      skip,
      take,
    }),
    db.product.count({ where }),
  ]);

  // Stock is summed in one grouped query across the page's products rather
  // than a per-product include, which would fan out across every branch.
  const stockTotals = await db.stockLevel.groupBy({
    by: ["productId"],
    where: { organizationId, productId: { in: products.map((product) => product.id) } },
    _sum: { quantity: true },
  });
  const stockByProductId = new Map(stockTotals.map((entry) => [entry.productId, entry._sum.quantity ?? 0]));

  const rows: ProductListRow[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    brand: product.brand,
    categoryName: product.category?.name ?? null,
    sellingPrice: product.sellingPrice.toString(),
    costPrice: product.costPrice.toString(),
    unit: product.unit,
    variantCount: product._count.variants,
    stockQuantity: stockByProductId.get(product.id) ?? 0,
    reorderPoint: product.reorderPoint,
    createdAt: product.createdAt.toISOString(),
    archived: product.archivedAt !== null,
  }));

  return buildListResult(rows, total, query);
}
