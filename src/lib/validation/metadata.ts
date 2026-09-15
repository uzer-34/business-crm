import { z } from "zod";
import { isEntityKey, isSupportedDataType, DATA_TYPE_SPECS } from "@/lib/metadata/entities";
import { isTemplateKey } from "@/lib/metadata/attribute-library";
import type { FieldDataType } from "@/generated/prisma/enums";

/*
 * Schemas for the configuration engine.
 *
 * Structured throughout: validation rules are a typed object, never a free
 * string, and entity keys / data types / template keys are checked against the
 * code registries rather than accepted as arbitrary text.
 */

const DATA_TYPES = Object.keys(DATA_TYPE_SPECS) as [FieldDataType, ...FieldDataType[]];

/** Machine key: lowercase, digits and underscores, so it is safe in URLs and payload keys. */
export const fieldKeySchema = z
  .string()
  .trim()
  .min(1, "Enter a field key.")
  .max(60, "Field keys can be at most 60 characters.")
  .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores, starting with a letter.");

export const fieldValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(1).optional(),
    pattern: z.string().max(200).optional(),
    step: z.number().positive().optional(),
  })
  .refine((rules) => rules.min === undefined || rules.max === undefined || rules.min <= rules.max, {
    message: "The minimum must not be greater than the maximum.",
  })
  .refine(
    (rules) => rules.minLength === undefined || rules.maxLength === undefined || rules.minLength <= rules.maxLength,
    { message: "The shortest length must not be greater than the longest." },
  );

export type FieldValidationRules = z.infer<typeof fieldValidationSchema>;

export const fieldOptionInputSchema = z.object({
  value: z
    .string()
    .trim()
    .min(1, "Each choice needs a stored value.")
    .max(80, "Choice values can be at most 80 characters."),
  label: z.string().trim().min(1, "Each choice needs a label.").max(120, "Choice labels can be at most 120 characters."),
});

// The admin picker only offers supported types and explains why the rest are
// unavailable; this is the server-side backstop for a hand-crafted request.
const dataTypeSchema = z
  .enum(DATA_TYPES)
  .refine(isSupportedDataType, "That field type isn't available yet — see Settings → Attributes for why.");

const baseFieldShape = {
  label: z.string().trim().min(1, "Enter a field name.").max(120, "Field names can be at most 120 characters."),
  description: z.string().trim().max(300, "Descriptions can be at most 300 characters.").optional(),
  placeholder: z.string().trim().max(120, "Placeholders can be at most 120 characters.").optional(),
  isRequired: z.boolean().default(false),
  sectionId: z.string().trim().optional(),
  searchable: z.boolean().default(false),
  filterable: z.boolean().default(false),
  sortable: z.boolean().default(false),
  hidden: z.boolean().default(false),
  validation: fieldValidationSchema.optional(),
  roleKeys: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  categoryIds: z.array(z.string().trim().min(1)).max(50).default([]),
  options: z.array(fieldOptionInputSchema).max(200, "A field can have at most 200 choices.").default([]),
};

export const createFieldSchema = z
  .object({
    entityKey: z.string().refine(isEntityKey, "Unknown entity."),
    key: fieldKeySchema,
    dataType: dataTypeSchema,
    ...baseFieldShape,
  })
  .refine((input) => !DATA_TYPE_SPECS[input.dataType].usesOptions || input.options.length > 0, {
    message: "Add at least one choice for this field type.",
    path: ["options"],
  });

export type CreateFieldInput = z.infer<typeof createFieldSchema>;

// The key and data type are immutable after creation: both are baked into
// every stored value, so changing them would silently invalidate existing data.
export const updateFieldSchema = z.object(baseFieldShape);

export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;

export const reorderFieldsSchema = z.object({
  entityKey: z.string().refine(isEntityKey, "Unknown entity."),
  orderedFieldIds: z.array(z.string().trim().min(1)).max(500),
});

export const createSectionSchema = z.object({
  entityKey: z.string().refine(isEntityKey, "Unknown entity."),
  key: fieldKeySchema,
  label: z.string().trim().min(1, "Enter a section name.").max(120),
  description: z.string().trim().max(300).optional(),
});

export const createCategorySchema = z.object({
  kind: z.enum(["PRODUCT", "SERVICE", "EXPENSE"]),
  name: z.string().trim().min(1, "Enter a category name.").max(120, "Category names can be at most 120 characters."),
  parentId: z.string().trim().optional(),
});

export const updateRecommendationSchema = z.object({
  recommendRequired: z.boolean().optional(),
  defaultSelected: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

export const addRecommendationSchema = z.object({
  categoryId: z.string().trim().min(1),
  templateKey: z.string().refine(isTemplateKey, "Unknown attribute template."),
  recommendRequired: z.boolean().default(false),
  reason: z.string().trim().max(200).optional(),
});

export const applyRecommendationsSchema = z.object({
  categoryId: z.string().trim().min(1),
  entityKey: z.string().refine(isEntityKey, "Unknown entity."),
  templateKeys: z.array(z.string().refine(isTemplateKey, "Unknown attribute template.")).min(1, "Choose at least one attribute."),
  /** Limit the created fields to this category rather than the whole entity. */
  scopeToCategory: z.boolean().default(true),
});
