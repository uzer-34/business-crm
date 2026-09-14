import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(160).optional(),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional(),
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/).optional(),
  city: z.string().trim().max(120).optional(),
  taxId: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const editSupplierSchema = createSupplierSchema;

const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantityOrdered: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().nonnegative(),
  taxRatePercent: z.coerce.number().min(0).max(100).default(0),
});

export const createPurchaseOrderSchema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(purchaseOrderItemSchema).min(1, "Add at least one line item"),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const receiveItemSchema = z.object({
  purchaseOrderItemId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
});
