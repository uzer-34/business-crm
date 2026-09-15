import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { CategoryKind } from "@/generated/prisma/enums";
import { getTemplate, recommendationsForCategoryName } from "./attribute-library";

/*
 * Category engine.
 *
 * Categories form a tree of arbitrary depth. Depth is stored so a tree can be
 * ordered and indented in one query, and recomputed whenever a parent changes.
 */

export interface CategoryNode {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  depth: number;
  childCount: number;
  productCount: number;
  recommendationCount: number;
  /** Full ancestry, e.g. "Clothing > Men > Shirts". */
  path: string;
}

/**
 * Whole tree for a kind, flattened depth-first so the UI can render indentation
 * without recursing. One query plus in-memory assembly, not a query per node.
 */
export async function loadCategoryTree(organizationId: string, kind: CategoryKind): Promise<CategoryNode[]> {
  const rows = await db.category.findMany({
    where: { organizationId, kind, archivedAt: null },
    include: { _count: { select: { children: true, products: true, recommendations: true } } },
    orderBy: [{ depth: "asc" }, { name: "asc" }],
  });

  const byParent = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const siblings = byParent.get(row.parentId) ?? [];
    siblings.push(row);
    byParent.set(row.parentId, siblings);
  }

  const flattened: CategoryNode[] = [];

  const walk = (parentId: string | null, ancestry: string[]) => {
    for (const row of byParent.get(parentId) ?? []) {
      const path = [...ancestry, row.name];
      flattened.push({
        id: row.id,
        name: row.name,
        kind: row.kind,
        parentId: row.parentId,
        depth: row.depth,
        childCount: row._count.children,
        productCount: row._count.products,
        recommendationCount: row._count.recommendations,
        path: path.join(" › "),
      });
      walk(row.id, path);
    }
  };

  walk(null, []);
  return flattened;
}

export interface CategoryRecommendationView {
  id: string;
  templateKey: string;
  label: string;
  reason: string | null;
  recommendRequired: boolean;
  defaultSelected: boolean;
  displayOrder: number;
  isActive: boolean;
  /** True once a field created from this template exists for the entity. */
  alreadyApplied: boolean;
  /** Null when the template has been removed from the code library. */
  dataTypeLabel: string | null;
}

export async function loadRecommendations(
  organizationId: string,
  categoryId: string,
  entityKey: string,
): Promise<CategoryRecommendationView[]> {
  const [recommendations, existingFields] = await Promise.all([
    db.categoryFieldRecommendation.findMany({
      where: { organizationId, categoryId },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
    }),
    db.fieldDefinition.findMany({
      where: { organizationId, entityKey, archivedAt: null },
      select: { key: true, templateKey: true },
    }),
  ]);

  const appliedKeys = new Set(existingFields.flatMap((field) => [field.key, field.templateKey ?? ""]));

  return recommendations.map((recommendation) => {
    const template = getTemplate(recommendation.templateKey);
    return {
      id: recommendation.id,
      templateKey: recommendation.templateKey,
      label: recommendation.label,
      reason: recommendation.reason,
      recommendRequired: recommendation.recommendRequired,
      defaultSelected: recommendation.defaultSelected,
      displayOrder: recommendation.displayOrder,
      isActive: recommendation.isActive,
      alreadyApplied: appliedKeys.has(recommendation.templateKey),
      dataTypeLabel: template?.dataType ?? null,
    };
  });
}

/**
 * Seeds recommendations for a newly created category from the code library.
 *
 * A no-op when the category name matches no known taxonomy — most categories a
 * business invents are their own, and inventing recommendations for them would
 * be guessing. Existing rows are never overwritten, so an owner's edits survive.
 */
export async function seedRecommendationsForCategory(
  client: Prisma.TransactionClient,
  organizationId: string,
  categoryId: string,
  categoryName: string,
): Promise<number> {
  const recommended = recommendationsForCategoryName(categoryName);
  if (recommended.length === 0) return 0;

  const existing = await client.categoryFieldRecommendation.findMany({
    where: { categoryId },
    select: { templateKey: true },
  });
  const existingKeys = new Set(existing.map((row) => row.templateKey));

  const rows = recommended
    .map((recommendation, index) => ({ recommendation, index }))
    .filter(({ recommendation }) => !existingKeys.has(recommendation.templateKey))
    .flatMap(({ recommendation, index }) => {
      const template = getTemplate(recommendation.templateKey);
      if (!template) return [];
      return [
        {
          organizationId,
          categoryId,
          templateKey: recommendation.templateKey,
          label: template.label,
          reason: recommendation.reason ?? null,
          recommendRequired: recommendation.recommendRequired ?? false,
          defaultSelected: recommendation.defaultSelected ?? true,
          displayOrder: index,
        },
      ];
    });

  if (rows.length === 0) return 0;

  await client.categoryFieldRecommendation.createMany({ data: rows });
  return rows.length;
}

/** Depth of a prospective child, validating that the parent is owned and same-kind. */
export async function resolveChildDepth(
  client: Prisma.TransactionClient,
  organizationId: string,
  kind: CategoryKind,
  parentId: string | null,
): Promise<number> {
  if (!parentId) return 0;

  const parent = await client.category.findFirst({
    where: { id: parentId, organizationId, kind },
    select: { depth: true },
  });
  if (!parent) throw new Error("Parent category not found");

  return parent.depth + 1;
}
