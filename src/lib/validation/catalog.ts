import { z } from "zod";

export const categoryKindSchema = z.enum(["PRODUCT", "SERVICE"]);

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().max(64).optional(),
  brand: z.string().trim().max(120).optional(),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  costPrice: z.coerce.number().nonnegative(),
  sellingPrice: z.coerce.number().nonnegative(),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
  reorderPoint: z.coerce.number().int().nonnegative().optional(),
  categoryName: z.string().trim().max(80).optional(),
  preferredSupplierId: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const createVariantSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  attributes: z.record(z.string().min(1).max(40), z.string().min(1).max(80)).refine((obj) => Object.keys(obj).length > 0, {
    message: "Add at least one attribute",
  }),
  costPrice: z.coerce.number().nonnegative().optional(),
  sellingPrice: z.coerce.number().nonnegative().optional(),
});

export const generateVariantMatrixSchema = z.object({
  sizes: z.array(z.string().trim().min(1).max(40)).min(1, "Add at least one size"),
  colors: z.array(z.string().trim().min(1).max(40)).min(1, "Add at least one color"),
});

export type GenerateVariantMatrixInput = z.infer<typeof generateVariantMatrixSchema>;

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  price: z.coerce.number().nonnegative(),
  durationMinutes: z.coerce.number().int().positive().max(24 * 60).optional(),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
  categoryName: z.string().trim().max(80).optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
