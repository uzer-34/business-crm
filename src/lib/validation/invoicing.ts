import { z } from "zod";

export const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER", "CARD", "ONLINE", "OTHER"]);

export const recordInvoicePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: paymentMethodSchema,
  reference: z.string().trim().max(120).optional(),
});

export type RecordInvoicePaymentInput = z.infer<typeof recordInvoicePaymentSchema>;
