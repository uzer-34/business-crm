import { z } from "zod";

const orderItemSchema = z
  .object({
    productId: z.string().optional(),
    variantId: z.string().optional(),
    serviceId: z.string().optional(),
    quantityOrdered: z.coerce.number().int().positive(),
    unitPrice: z.coerce.number().nonnegative(),
    discountPercent: z.coerce.number().min(0).max(100).default(0),
    taxRatePercent: z.coerce.number().min(0).max(100).default(0),
  })
  .refine((item) => Boolean(item.productId) !== Boolean(item.serviceId), {
    message: "Each line must be either a product or a service, not both",
  });

export const createOrderSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  assignedToId: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(orderItemSchema).min(1, "Add at least one line item"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const fulfillOrderItemSchema = z.object({
  orderItemId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});
