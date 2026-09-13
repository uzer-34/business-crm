import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { InventoryMovementType } from "@/generated/prisma/enums";

/** "" for the base product, or the variant's id — see schema.prisma for why. */
export function variantKeyOf(variantId: string | null | undefined): string {
  return variantId ?? "";
}

/**
 * Inserts one InventoryMovement row and applies its delta to the matching
 * StockLevel row (creating it at 0 first if this is the first movement for
 * that branch/product/variant). Always call within a transaction alongside
 * whatever else the caller is doing (e.g. the paired OUT+IN of a transfer)
 * so the ledger and the projection never disagree.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    branchId: string;
    productId: string;
    variantId?: string | null;
    type: InventoryMovementType;
    quantityDelta: number;
    reason?: string;
    reference?: string;
    transferGroupId?: string;
    purchaseOrderItemId?: string;
    actorUserId: string;
  },
): Promise<void> {
  const variantId = params.variantId ?? null;
  const variantKey = variantKeyOf(variantId);

  await tx.inventoryMovement.create({
    data: {
      organizationId: params.organizationId,
      branchId: params.branchId,
      productId: params.productId,
      variantId,
      variantKey,
      type: params.type,
      quantityDelta: params.quantityDelta,
      reason: params.reason,
      reference: params.reference,
      transferGroupId: params.transferGroupId,
      purchaseOrderItemId: params.purchaseOrderItemId,
      actorUserId: params.actorUserId,
    },
  });

  await tx.stockLevel.upsert({
    where: { branchId_productId_variantKey: { branchId: params.branchId, productId: params.productId, variantKey } },
    create: {
      organizationId: params.organizationId,
      branchId: params.branchId,
      productId: params.productId,
      variantId,
      variantKey,
      quantity: params.quantityDelta,
    },
    update: {
      quantity: { increment: params.quantityDelta },
    },
  });
}

export async function getStockQuantity(
  tx: Prisma.TransactionClient,
  params: { branchId: string; productId: string; variantId?: string | null },
): Promise<number> {
  const variantKey = variantKeyOf(params.variantId);
  const level = await tx.stockLevel.findUnique({
    where: {
      branchId_productId_variantKey: { branchId: params.branchId, productId: params.productId, variantKey },
    },
  });
  return level?.quantity ?? 0;
}
