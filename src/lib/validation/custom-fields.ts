import { z } from "zod";

export const customFieldEntityTypeSchema = z.enum(["CUSTOMER"]);
export const customFieldTypeSchema = z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"]);

export const createCustomFieldDefinitionSchema = z
  .object({
    entityType: customFieldEntityTypeSchema,
    key: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores, starting with a letter"),
    label: z.string().trim().min(1).max(120),
    fieldType: customFieldTypeSchema,
    options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    required: z.boolean().default(false),
  })
  .refine((data) => data.fieldType !== "SELECT" || (data.options && data.options.length > 0), {
    message: "Select fields need at least one option",
    path: ["options"],
  });

export type CreateCustomFieldDefinitionInput = z.infer<typeof createCustomFieldDefinitionSchema>;

// The value's shape depends on fieldType, which we can't know at the Zod
// schema level without also passing the definition — validated by hand in
// setCustomFieldValueAction instead.
export const setCustomFieldValueSchema = z.object({
  definitionId: z.string().min(1),
  entityId: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
