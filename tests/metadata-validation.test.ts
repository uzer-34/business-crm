import { describe, expect, it } from "vitest";
import { validateFieldValues } from "@/lib/metadata/field-values";
import type { ResolvedField } from "@/lib/metadata/field-service";
import { createFieldSchema, fieldKeySchema, fieldValidationSchema } from "@/lib/validation/metadata";
import {
  ATTRIBUTE_TEMPLATES,
  getTemplate,
  normalizeCategoryName,
  recommendationsForCategoryName,
} from "@/lib/metadata/attribute-library";
import { DATA_TYPE_SPECS, isEntityKey, isSupportedDataType, supportedDataTypes } from "@/lib/metadata/entities";

/*
 * The engine's rules, tested without a database. These are the checks that
 * stop a client inventing fields or widening option lists, so they are
 * asserted directly rather than only through the UI.
 */

function field(overrides: Partial<ResolvedField> = {}): ResolvedField {
  return {
    id: "field-1",
    key: "size",
    label: "Size",
    description: null,
    placeholder: null,
    dataType: "TEXT",
    source: "CUSTOM",
    templateKey: null,
    isRequired: false,
    hidden: false,
    displayOrder: 0,
    sectionId: null,
    validation: null,
    roleKeys: [],
    options: [],
    categoryIds: [],
    ...overrides,
  };
}

describe("dynamic value validation", () => {
  it("rejects a field id the caller was never offered", () => {
    const result = validateFieldValues([field()], { "field-1": "M", "smuggled-field": "anything" });

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.fieldId)).toContain("smuggled-field");
  });

  it("refuses a select value outside the configured options", () => {
    const select = field({
      dataType: "SINGLE_SELECT",
      options: [
        { value: "s", label: "S" },
        { value: "m", label: "M" },
      ],
    });

    expect(validateFieldValues([select], { "field-1": "m" }).ok).toBe(true);
    expect(validateFieldValues([select], { "field-1": "xxl" }).ok).toBe(false);
  });

  it("refuses any invalid entry in a multi-select", () => {
    const multi = field({
      dataType: "MULTI_SELECT",
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
      ],
    });

    expect(validateFieldValues([multi], { "field-1": ["red", "blue"] }).ok).toBe(true);
    expect(validateFieldValues([multi], { "field-1": ["red", "chartreuse"] }).ok).toBe(false);
  });

  it("deduplicates multi-select entries", () => {
    const multi = field({
      dataType: "MULTI_SELECT",
      options: [{ value: "red", label: "Red" }],
    });

    const result = validateFieldValues([multi], { "field-1": ["red", "red"] });
    expect(result.values.get("field-1")).toEqual(["red"]);
  });

  it("enforces required even when the client omits the field entirely", () => {
    const required = field({ isRequired: true });

    const result = validateFieldValues([required], {});
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toBe("Size is required.");
  });

  it("treats an explicitly blank optional field as a clear, not an error", () => {
    const result = validateFieldValues([field()], { "field-1": "" });

    expect(result.ok).toBe(true);
    expect(result.values.get("field-1")).toBeNull();
  });

  it("does not clear a field the client never mentioned", () => {
    const result = validateFieldValues([field()], {});

    expect(result.ok).toBe(true);
    expect(result.values.has("field-1")).toBe(false);
  });

  it("requires whole numbers for NUMBER and allows decimals for DECIMAL", () => {
    const whole = field({ dataType: "NUMBER" });
    const decimal = field({ dataType: "DECIMAL" });

    expect(validateFieldValues([whole], { "field-1": "32" }).ok).toBe(true);
    expect(validateFieldValues([whole], { "field-1": "32.5" }).ok).toBe(false);
    expect(validateFieldValues([decimal], { "field-1": "32.5" }).ok).toBe(true);
  });

  it("coerces numeric strings to numbers so stored values stay typed", () => {
    const result = validateFieldValues([field({ dataType: "NUMBER" })], { "field-1": "42" });

    expect(result.values.get("field-1")).toBe(42);
  });

  it("applies min and max from the field's stored validation rules", () => {
    const waist = field({ dataType: "NUMBER", label: "Waist size", validation: { min: 20, max: 60 } });

    expect(validateFieldValues([waist], { "field-1": 32 }).ok).toBe(true);
    expect(validateFieldValues([waist], { "field-1": 12 }).ok).toBe(false);
    expect(validateFieldValues([waist], { "field-1": 80 }).ok).toBe(false);
  });

  it("bounds a percentage to 0-100 regardless of stored rules", () => {
    const percent = field({ dataType: "PERCENTAGE" });

    expect(validateFieldValues([percent], { "field-1": 50 }).ok).toBe(true);
    expect(validateFieldValues([percent], { "field-1": 140 }).ok).toBe(false);
  });

  it("validates emails, urls, dates and times", () => {
    expect(validateFieldValues([field({ dataType: "EMAIL" })], { "field-1": "a@b.co" }).ok).toBe(true);
    expect(validateFieldValues([field({ dataType: "EMAIL" })], { "field-1": "nope" }).ok).toBe(false);
    expect(validateFieldValues([field({ dataType: "URL" })], { "field-1": "https://example.com" }).ok).toBe(true);
    expect(validateFieldValues([field({ dataType: "URL" })], { "field-1": "javascript:alert(1)" }).ok).toBe(false);
    expect(validateFieldValues([field({ dataType: "DATE" })], { "field-1": "2026-01-31" }).ok).toBe(true);
    expect(validateFieldValues([field({ dataType: "DATE" })], { "field-1": "31/01/2026" }).ok).toBe(false);
    expect(validateFieldValues([field({ dataType: "TIME" })], { "field-1": "14:30" }).ok).toBe(true);
    expect(validateFieldValues([field({ dataType: "TIME" })], { "field-1": "2pm" }).ok).toBe(false);
  });

  it("enforces text length rules", () => {
    const text = field({ validation: { maxLength: 5 } });

    expect(validateFieldValues([text], { "field-1": "short" }).ok).toBe(true);
    expect(validateFieldValues([text], { "field-1": "far too long" }).ok).toBe(false);
  });

  it("does not let a malformed stored pattern block a save", () => {
    const broken = field({ validation: { pattern: "([unclosed" } });

    expect(validateFieldValues([broken], { "field-1": "anything" }).ok).toBe(true);
  });

  it("reports every failing field, not just the first", () => {
    const fields = [
      field({ id: "a", label: "A", isRequired: true }),
      field({ id: "b", label: "B", isRequired: true }),
    ];

    expect(validateFieldValues(fields, {}).errors).toHaveLength(2);
  });
});

describe("field configuration schema", () => {
  const base = {
    entityKey: "product",
    key: "sleeve",
    label: "Sleeve",
    dataType: "SINGLE_SELECT" as const,
    options: [{ value: "full", label: "Full sleeve" }],
  };

  it("accepts a well-formed field", () => {
    expect(createFieldSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an entity that is not in the registry", () => {
    expect(createFieldSchema.safeParse({ ...base, entityKey: "spaceship" }).success).toBe(false);
  });

  it("requires choices for a select field", () => {
    const result = createFieldSchema.safeParse({ ...base, options: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Add at least one choice for this field type.");
  });

  it("rejects a data type the runtime cannot honour", () => {
    // IMAGE is modelled in the schema but not implemented, so it must not be
    // creatable — a field that renders as nothing is worse than no field.
    expect(createFieldSchema.safeParse({ ...base, dataType: "IMAGE", options: [] }).success).toBe(false);
  });

  it("only accepts machine-safe field keys", () => {
    expect(fieldKeySchema.safeParse("sleeve_length").success).toBe(true);
    expect(fieldKeySchema.safeParse("Sleeve Length").success).toBe(false);
    expect(fieldKeySchema.safeParse("1st_choice").success).toBe(false);
    expect(fieldKeySchema.safeParse("drop table").success).toBe(false);
  });

  it("rejects contradictory validation rules", () => {
    expect(fieldValidationSchema.safeParse({ min: 10, max: 2 }).success).toBe(false);
    expect(fieldValidationSchema.safeParse({ minLength: 10, maxLength: 2 }).success).toBe(false);
    expect(fieldValidationSchema.safeParse({ min: 2, max: 10 }).success).toBe(true);
  });
});

describe("entity and data type registry", () => {
  it("only lists entities that exist", () => {
    expect(isEntityKey("product")).toBe(true);
    expect(isEntityKey("vehicle")).toBe(true);
    expect(isEntityKey("lead")).toBe(false);
  });

  it("marks unimplemented types unsupported with a stated reason", () => {
    for (const [type, spec] of Object.entries(DATA_TYPE_SPECS)) {
      if (!spec.supported) {
        expect(spec.unsupportedReason, `${type} must explain why it is unavailable`).toBeTruthy();
      }
    }
  });

  it("offers only supported types for creation", () => {
    expect(supportedDataTypes().every(isSupportedDataType)).toBe(true);
    expect(supportedDataTypes()).not.toContain("IMAGE");
  });
});

describe("attribute library", () => {
  it("has a unique key for every template", () => {
    const keys = ATTRIBUTE_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every select template real choices", () => {
    for (const template of ATTRIBUTE_TEMPLATES) {
      if (template.dataType === "SINGLE_SELECT" || template.dataType === "MULTI_SELECT") {
        expect(template.options?.length, `${template.key} needs options`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps vehicle make and model free text rather than inventing a dataset", () => {
    expect(getTemplate("make")?.dataType).toBe("TEXT");
    expect(getTemplate("model")?.dataType).toBe("TEXT");
  });

  it("recommends the defining shirt attributes", () => {
    const keys = recommendationsForCategoryName("Shirts").map((entry) => entry.templateKey);

    expect(keys).toEqual(
      expect.arrayContaining(["size", "color", "fabric", "fit", "pattern", "brand", "season", "sleeve", "collar"]),
    );
  });

  it("recommends waist and inseam for jeans instead of S/M/L sizing", () => {
    const keys = recommendationsForCategoryName("Jeans").map((entry) => entry.templateKey);

    expect(keys).toContain("waist_size");
    expect(keys).toContain("inseam_length");
    expect(keys).not.toContain("size");
  });

  it("recommends nothing for a name the library does not know", () => {
    expect(recommendationsForCategoryName("Artisanal Widgets")).toEqual([]);
  });

  it("matches category names regardless of case and plurality", () => {
    expect(normalizeCategoryName("Shirts")).toBe("shirt");
    expect(normalizeCategoryName("shirt")).toBe("shirt");
    expect(normalizeCategoryName("T-Shirts")).toBe("tshirt");
  });

  it("points every recommendation at a template that exists", () => {
    for (const name of ["shirt", "jeans", "ring", "necklace", "tshirt", "dress", "top", "trousers"]) {
      for (const recommendation of recommendationsForCategoryName(name)) {
        expect(getTemplate(recommendation.templateKey), `${name} -> ${recommendation.templateKey}`).not.toBeNull();
      }
    }
  });
});
