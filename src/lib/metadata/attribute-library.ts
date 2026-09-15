import type { FieldDataType } from "@/generated/prisma/enums";

/*
 * Attribute template library.
 *
 * Reusable field definitions that a category can recommend. Templates are the
 * versioned, code-level source of truth; applying one creates a real
 * FieldDefinition row owned by the organization, which the owner can then
 * rename, reorder or archive like any other field.
 *
 * Option lists here are genuine domain standards (garment sizes, fuel types,
 * gold purity grades, shirt collar styles). Where a real attribute has no
 * enumerable standard — vehicle makes and models being the clear case — the
 * template is free text rather than a fabricated list. Inventing a partial
 * list of car manufacturers would be worse than asking the user to type it.
 */

export interface AttributeTemplate {
  key: string;
  label: string;
  description?: string;
  dataType: FieldDataType;
  /** Section key within the entity; must exist in that entity's defaultSections. */
  sectionKey: string;
  /** Option values for select types. Value and label are separate so labels can be renamed safely. */
  options?: { value: string; label: string }[];
  validation?: { min?: number; max?: number; maxLength?: number };
  placeholder?: string;
}

const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"].map((size) => ({ value: size, label: size }));

const COMMON_COLORS = [
  "Black",
  "White",
  "Grey",
  "Navy",
  "Blue",
  "Red",
  "Green",
  "Yellow",
  "Brown",
  "Beige",
  "Pink",
  "Purple",
].map((color) => ({ value: color.toLowerCase(), label: color }));

export const ATTRIBUTE_TEMPLATES: readonly AttributeTemplate[] = [
  // --- Apparel -------------------------------------------------------------
  {
    key: "size",
    label: "Size",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: CLOTHING_SIZES,
  },
  { key: "color", label: "Colour", dataType: "SINGLE_SELECT", sectionKey: "attributes", options: COMMON_COLORS },
  {
    key: "fabric",
    label: "Fabric",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: ["Cotton", "Linen", "Silk", "Wool", "Denim", "Polyester", "Rayon", "Blend"].map((f) => ({
      value: f.toLowerCase(),
      label: f,
    })),
  },
  {
    key: "fit",
    label: "Fit",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: ["Slim", "Regular", "Relaxed", "Oversized"].map((f) => ({ value: f.toLowerCase(), label: f })),
  },
  {
    key: "sleeve",
    label: "Sleeve",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: ["Full sleeve", "Half sleeve", "Three-quarter sleeve", "Sleeveless"].map((s) => ({
      value: s.toLowerCase().replace(/\s+/g, "_"),
      label: s,
    })),
  },
  {
    key: "collar",
    label: "Collar",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: ["Spread", "Button-down", "Mandarin", "Club", "Cutaway", "Band"].map((c) => ({
      value: c.toLowerCase().replace(/[^a-z]+/g, "_"),
      label: c,
    })),
  },
  {
    key: "pattern",
    label: "Pattern",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: ["Solid", "Striped", "Checked", "Printed", "Floral", "Embroidered"].map((p) => ({
      value: p.toLowerCase(),
      label: p,
    })),
  },
  {
    key: "brand",
    label: "Brand",
    description: "Free text — brands are specific to your business.",
    dataType: "TEXT",
    sectionKey: "classification",
    validation: { maxLength: 80 },
  },
  {
    key: "season",
    label: "Season",
    dataType: "SINGLE_SELECT",
    sectionKey: "classification",
    options: [
      { value: "spring_summer", label: "Spring / Summer" },
      { value: "autumn_winter", label: "Autumn / Winter" },
      { value: "all_season", label: "All season" },
    ],
  },
  {
    key: "gender",
    label: "Gender",
    dataType: "SINGLE_SELECT",
    sectionKey: "classification",
    options: [
      { value: "men", label: "Men" },
      { value: "women", label: "Women" },
      { value: "unisex", label: "Unisex" },
      { value: "kids", label: "Kids" },
    ],
  },

  // --- Denim ---------------------------------------------------------------
  {
    key: "waist_size",
    label: "Waist size",
    description: "In inches.",
    dataType: "NUMBER",
    sectionKey: "attributes",
    validation: { min: 20, max: 60 },
  },
  {
    key: "inseam_length",
    label: "Inseam length",
    description: "In inches.",
    dataType: "NUMBER",
    sectionKey: "attributes",
    validation: { min: 20, max: 40 },
  },
  {
    key: "wash",
    label: "Wash",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: ["Light", "Medium", "Dark", "Raw", "Distressed"].map((w) => ({ value: w.toLowerCase(), label: w })),
  },
  {
    key: "stretch",
    label: "Stretch",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: [
      { value: "non_stretch", label: "Non-stretch" },
      { value: "stretch", label: "Stretch" },
      { value: "super_stretch", label: "Super stretch" },
    ],
  },

  // --- Jewellery -----------------------------------------------------------
  {
    key: "metal",
    label: "Metal",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    options: ["Gold", "Silver", "Platinum", "White gold", "Rose gold"].map((m) => ({
      value: m.toLowerCase().replace(/\s+/g, "_"),
      label: m,
    })),
  },
  {
    key: "purity",
    label: "Purity",
    description: "Hallmark grade.",
    dataType: "SINGLE_SELECT",
    sectionKey: "attributes",
    // Real hallmarking standards: karat grades for gold, millesimal fineness
    // for silver and platinum.
    options: [
      { value: "24k", label: "24K" },
      { value: "22k", label: "22K" },
      { value: "18k", label: "18K" },
      { value: "14k", label: "14K" },
      { value: "9k", label: "9K" },
      { value: "925", label: "925 (sterling silver)" },
      { value: "950", label: "950 (platinum)" },
    ],
  },
  {
    key: "gross_weight",
    label: "Gross weight",
    description: "In grams.",
    dataType: "DECIMAL",
    sectionKey: "attributes",
    validation: { min: 0 },
  },
  { key: "ring_size", label: "Ring size", dataType: "TEXT", sectionKey: "attributes", validation: { maxLength: 12 } },
  { key: "stone", label: "Stone", dataType: "TEXT", sectionKey: "attributes", validation: { maxLength: 80 } },
  {
    key: "stone_weight",
    label: "Stone weight",
    description: "In carats.",
    dataType: "DECIMAL",
    sectionKey: "attributes",
    validation: { min: 0 },
  },
  {
    key: "certification",
    label: "Certification",
    description: "Certifying body and certificate number, if any.",
    dataType: "TEXT",
    sectionKey: "classification",
    validation: { maxLength: 120 },
  },
  { key: "making_charge", label: "Making charge", dataType: "CURRENCY", sectionKey: "classification", validation: { min: 0 } },
  { key: "occasion", label: "Occasion", dataType: "TEXT", sectionKey: "classification", validation: { maxLength: 80 } },

  // --- Vehicle -------------------------------------------------------------
  {
    key: "registration_number",
    label: "Registration number",
    description: "Formats vary by country, so this is free text.",
    dataType: "TEXT",
    sectionKey: "identity",
    validation: { maxLength: 24 },
  },
  {
    key: "vin",
    label: "VIN / chassis number",
    dataType: "TEXT",
    sectionKey: "identity",
    validation: { maxLength: 32 },
  },
  { key: "engine_number", label: "Engine number", dataType: "TEXT", sectionKey: "identity", validation: { maxLength: 32 } },
  {
    key: "make",
    label: "Make",
    // Deliberately free text: there is no bundled manufacturer dataset, and a
    // hand-written partial list would be invented reference data.
    description: "Manufacturer, e.g. the name on the badge.",
    dataType: "TEXT",
    sectionKey: "identity",
    validation: { maxLength: 60 },
  },
  { key: "model", label: "Model", dataType: "TEXT", sectionKey: "identity", validation: { maxLength: 60 } },
  { key: "variant", label: "Variant", dataType: "TEXT", sectionKey: "identity", validation: { maxLength: 60 } },
  {
    key: "manufacture_year",
    label: "Year",
    dataType: "NUMBER",
    sectionKey: "technical",
    validation: { min: 1900, max: 2100 },
  },
  {
    key: "fuel",
    label: "Fuel",
    dataType: "SINGLE_SELECT",
    sectionKey: "technical",
    options: ["Petrol", "Diesel", "Hybrid", "Electric", "CNG", "LPG"].map((f) => ({ value: f.toLowerCase(), label: f })),
  },
  {
    key: "transmission",
    label: "Transmission",
    dataType: "SINGLE_SELECT",
    sectionKey: "technical",
    options: ["Manual", "Automatic", "CVT", "AMT", "DCT"].map((t) => ({ value: t.toLowerCase(), label: t })),
  },
  {
    key: "odometer",
    label: "Odometer reading",
    description: "Distance shown at the last visit.",
    dataType: "NUMBER",
    sectionKey: "technical",
    validation: { min: 0 },
  },
  { key: "vehicle_colour", label: "Colour", dataType: "SINGLE_SELECT", sectionKey: "technical", options: COMMON_COLORS },
  {
    key: "insurance_provider",
    label: "Insurance provider",
    dataType: "TEXT",
    sectionKey: "ownership",
    validation: { maxLength: 120 },
  },
  { key: "insurance_policy_number", label: "Policy number", dataType: "TEXT", sectionKey: "ownership", validation: { maxLength: 60 } },
  { key: "insurance_expiry", label: "Insurance expires", dataType: "DATE", sectionKey: "ownership" },
  { key: "warranty_expiry", label: "Warranty expires", dataType: "DATE", sectionKey: "ownership" },
  { key: "purchase_date", label: "Purchase date", dataType: "DATE", sectionKey: "ownership" },
] as const;

export function getTemplate(key: string): AttributeTemplate | null {
  return ATTRIBUTE_TEMPLATES.find((template) => template.key === key) ?? null;
}

export function isTemplateKey(key: string): boolean {
  return ATTRIBUTE_TEMPLATES.some((template) => template.key === key);
}

/*
 * Category taxonomy -> recommended attributes.
 *
 * Matched on a normalized category name, so a business that names its category
 * "Shirts" or "shirt" gets the same recommendations. This is deliberately
 * modest and product-shaped; Milestone 3's industry packages own the broader
 * "this whole industry works like X" configuration and will contribute
 * recommendations through the same table.
 */
export interface CategoryRecommendation {
  templateKey: string;
  recommendRequired?: boolean;
  defaultSelected?: boolean;
  reason?: string;
}

const APPAREL_BASE: CategoryRecommendation[] = [
  { templateKey: "size", recommendRequired: true, reason: "Customers pick clothing by size first." },
  { templateKey: "color", recommendRequired: true },
  { templateKey: "fabric" },
  { templateKey: "fit" },
  { templateKey: "pattern" },
  { templateKey: "brand" },
  { templateKey: "season" },
  { templateKey: "gender" },
];

export const CATEGORY_RECOMMENDATIONS: Record<string, CategoryRecommendation[]> = {
  shirt: [
    ...APPAREL_BASE,
    { templateKey: "sleeve", reason: "Sleeve length is a defining shirt attribute." },
    { templateKey: "collar", reason: "Collar style is a defining shirt attribute." },
  ],
  tshirt: [...APPAREL_BASE, { templateKey: "sleeve" }],
  jeans: [
    { templateKey: "waist_size", recommendRequired: true, reason: "Denim is sized by waist, not S/M/L." },
    { templateKey: "inseam_length", recommendRequired: true },
    { templateKey: "fit" },
    { templateKey: "wash" },
    { templateKey: "stretch" },
    { templateKey: "color" },
    { templateKey: "fabric" },
    { templateKey: "brand" },
    { templateKey: "gender" },
  ],
  dress: [...APPAREL_BASE, { templateKey: "sleeve" }],
  top: APPAREL_BASE,
  trousers: [
    { templateKey: "waist_size", recommendRequired: true },
    { templateKey: "inseam_length" },
    { templateKey: "fit" },
    { templateKey: "color" },
    { templateKey: "fabric" },
    { templateKey: "brand" },
    { templateKey: "gender" },
  ],
  ring: [
    { templateKey: "metal", recommendRequired: true },
    { templateKey: "purity", recommendRequired: true, reason: "Hallmark grade drives the price." },
    { templateKey: "gross_weight", recommendRequired: true },
    { templateKey: "ring_size" },
    { templateKey: "stone" },
    { templateKey: "stone_weight" },
    { templateKey: "certification" },
    { templateKey: "making_charge" },
    { templateKey: "occasion" },
  ],
  necklace: [
    { templateKey: "metal", recommendRequired: true },
    { templateKey: "purity", recommendRequired: true },
    { templateKey: "gross_weight", recommendRequired: true },
    { templateKey: "stone" },
    { templateKey: "certification" },
    { templateKey: "making_charge" },
  ],
};

/**
 * Normalizes a category name to a taxonomy key: "T-Shirts" -> "tshirt".
 *
 * Stripping a trailing "s" is checked against the library rather than applied
 * blindly, because some garment names are already singular — "Jeans" must not
 * become "jean".
 */
export function normalizeCategoryName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "");

  if (slug in CATEGORY_RECOMMENDATIONS) return slug;

  const singular = slug.endsWith("s") ? slug.slice(0, -1) : slug;
  return singular in CATEGORY_RECOMMENDATIONS ? singular : slug;
}

export function recommendationsForCategoryName(name: string): CategoryRecommendation[] {
  return CATEGORY_RECOMMENDATIONS[normalizeCategoryName(name)] ?? [];
}

/** Templates that make sense to recommend for an entity, for the admin picker. */
export function templatesForSectionKeys(sectionKeys: string[]): AttributeTemplate[] {
  return ATTRIBUTE_TEMPLATES.filter((template) => sectionKeys.includes(template.sectionKey));
}
