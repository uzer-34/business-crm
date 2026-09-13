import { z } from "zod";
import { paymentMethodSchema } from "./invoicing";

export const createExpenseSchema = z.object({
  branchId: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: paymentMethodSchema,
  payee: z.string().trim().max(160).optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  categoryName: z.string().trim().max(80).optional(),
  incurredAt: z.coerce.date(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
