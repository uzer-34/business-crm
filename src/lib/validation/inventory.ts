import { z } from "zod";

export const recordMovementSchema = z.object({
  branchId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().optional(),
  type: z.enum(["OPENING", "ADJUSTMENT", "DAMAGED"]),
  // Sign matches the movement's real-world effect: positive adds stock,
  // negative removes it. The UI collects a positive magnitude and a
  // direction, then combines them into this signed value.
  quantityDelta: z.coerce.number().int().refine((n) => n !== 0, "Quantity can't be zero"),
  reason: z.string().trim().max(500).optional(),
});

export const transferStockSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.coerce.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});
