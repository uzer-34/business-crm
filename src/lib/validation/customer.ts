import { z } from "zod";

export const customerTypeSchema = z.enum(["INDIVIDUAL", "BUSINESS"]);
export const customerStatusSchema = z.enum(["LEAD", "ACTIVE", "INACTIVE"]);

export const createCustomerSchema = z.object({
  type: customerTypeSchema,
  name: z.string().trim().min(1, "Enter a name.").max(160, "Name can be at most 160 characters."),
  companyName: z.string().trim().max(160, "Company name can be at most 160 characters.").optional(),
  email: z.email("Enter a valid email address, such as name@example.com.").optional().or(z.literal("")),
  phone: z.string().trim().max(32, "Phone number can be at most 32 characters.").optional(),
  status: customerStatusSchema.default("LEAD"),
  source: z.string().trim().max(80, "Source can be at most 80 characters.").optional(),
  tags: z
    .array(z.string().trim().min(1, "Tags cannot be empty.").max(40, "Each tag can be at most 40 characters."))
    .max(20, "You can add at most 20 tags.")
    .default([]),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const editCustomerSchema = createCustomerSchema;

export const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Write a note before saving.").max(4000, "Notes can be at most 4000 characters."),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title.").max(200, "Title can be at most 200 characters."),
  dueAt: z.string().datetime("Choose a valid due date.").optional(),
  assignedToId: z.string().optional(),
});
