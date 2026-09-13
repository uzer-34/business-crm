import { z } from "zod";

export const customerTypeSchema = z.enum(["INDIVIDUAL", "BUSINESS"]);
export const customerStatusSchema = z.enum(["LEAD", "ACTIVE", "INACTIVE"]);

export const createCustomerSchema = z.object({
  type: customerTypeSchema,
  name: z.string().trim().min(1).max(160),
  companyName: z.string().trim().max(160).optional(),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional(),
  status: customerStatusSchema.default("LEAD"),
  source: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().datetime().optional(),
  assignedToId: z.string().optional(),
});
