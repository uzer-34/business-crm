import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { seedRecommendationsForCategory } from "@/lib/metadata/category-service";

/**
 * Shared find-or-create used when a category is typed inline on the
 * product/service/expense form. Case-insensitive match on name within
 * (organization, kind) so "Parts" and "parts" don't become two categories.
 *
 * A newly created category is seeded with its recommended attributes from the
 * code library, which is what makes "Shirts" offer Size/Colour/Sleeve/Collar
 * the moment it comes into existence. Seeding is a no-op for a name the
 * library doesn't recognize.
 */
export async function findOrCreateCategory(
  tx: Prisma.TransactionClient | typeof db,
  params: { organizationId: string; kind: "PRODUCT" | "SERVICE" | "EXPENSE"; name: string; parentId?: string | null },
): Promise<string> {
  const trimmed = params.name.trim();

  const existing = await tx.category.findFirst({
    where: {
      organizationId: params.organizationId,
      kind: params.kind,
      name: { equals: trimmed, mode: "insensitive" },
    },
  });
  if (existing) return existing.id;

  const created = await tx.category.create({
    data: {
      organizationId: params.organizationId,
      kind: params.kind,
      name: trimmed,
      parentId: params.parentId ?? null,
    },
  });

  await seedRecommendationsForCategory(tx as Prisma.TransactionClient, params.organizationId, created.id, trimmed);

  return created.id;
}
