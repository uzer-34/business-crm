import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Categories are created inline from the product/service/expense form
 * rather than through a dedicated management screen (brief §19-20 don't
 * call for one yet) — this is the shared find-or-create used by all three.
 * Case-insensitive match on name within (organization, kind) so "Parts"
 * and "parts" don't become two categories.
 */
export async function findOrCreateCategory(
  tx: Prisma.TransactionClient | typeof db,
  params: { organizationId: string; kind: "PRODUCT" | "SERVICE" | "EXPENSE"; name: string },
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
    data: { organizationId: params.organizationId, kind: params.kind, name: trimmed },
  });
  return created.id;
}
