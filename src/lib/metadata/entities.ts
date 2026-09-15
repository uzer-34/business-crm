import type { FieldDataType } from "@/generated/prisma/enums";

/*
 * Entity registry.
 *
 * The set of entities that can carry configured fields. This lives in code
 * rather than a database table because these entities are backed by real
 * Prisma models — a row describing an entity that has no table would be
 * fiction. Adding an entity here is a code change with no migration, and
 * `field_definitions.entityKey` is validated against this registry on every
 * write.
 *
 * Only entities that genuinely exist are listed. The architecture supports
 * more (Lead, Contact, Appointment) the moment those models are built.
 */

export interface EntityDefinition {
  key: string;
  label: string;
  pluralLabel: string;
  description: string;
  /** Permission required to read records of this entity. */
  viewPermission: string;
  /** Whether records of this entity can be scoped by category. */
  supportsCategories: boolean;
  /** Default sections created for an organization the first time it configures this entity. */
  defaultSections: { key: string; label: string; description?: string }[];
}

export const ENTITY_DEFINITIONS: readonly EntityDefinition[] = [
  {
    key: "customer",
    label: "Customer",
    pluralLabel: "Customers",
    description: "People and businesses you sell to.",
    viewPermission: "customers.view",
    supportsCategories: false,
    defaultSections: [
      { key: "details", label: "Details", description: "Core information about this customer." },
      { key: "preferences", label: "Preferences" },
    ],
  },
  {
    key: "product",
    label: "Product",
    pluralLabel: "Products",
    description: "Physical goods you buy, stock and sell.",
    viewPermission: "products.view",
    supportsCategories: true,
    defaultSections: [
      { key: "attributes", label: "Attributes", description: "What distinguishes this product." },
      { key: "classification", label: "Classification" },
    ],
  },
  {
    key: "service",
    label: "Service",
    pluralLabel: "Services",
    description: "Work you perform and charge for.",
    viewPermission: "services.view",
    supportsCategories: true,
    defaultSections: [{ key: "attributes", label: "Attributes" }],
  },
  {
    key: "vehicle",
    label: "Vehicle",
    pluralLabel: "Vehicles",
    description: "Vehicles belonging to your customers.",
    viewPermission: "vehicles.view",
    supportsCategories: false,
    defaultSections: [
      { key: "identity", label: "Vehicle identity", description: "How this vehicle is identified." },
      { key: "technical", label: "Technical details" },
      { key: "ownership", label: "Ownership & cover", description: "Insurance, warranty and paperwork." },
    ],
  },
  {
    key: "supplier",
    label: "Supplier",
    pluralLabel: "Suppliers",
    description: "Businesses you buy from.",
    viewPermission: "suppliers.view",
    supportsCategories: false,
    defaultSections: [{ key: "details", label: "Details" }],
  },
] as const;

export type EntityKey = (typeof ENTITY_DEFINITIONS)[number]["key"];

export function isEntityKey(value: string): boolean {
  return ENTITY_DEFINITIONS.some((entity) => entity.key === value);
}

export function getEntityDefinition(key: string): EntityDefinition | null {
  return ENTITY_DEFINITIONS.find((entity) => entity.key === key) ?? null;
}

/*
 * Data-type capabilities.
 *
 * Says plainly which of the 26 declared types the engine can actually store,
 * render and validate today. A type that is modelled but not yet implemented
 * is marked unsupported and is rejected at creation time rather than silently
 * rendering as a broken text box — the schema is ready for it, the runtime is
 * honest that it is not.
 */
export interface DataTypeSpec {
  label: string;
  /** Fully implemented: rendered, validated and stored. */
  supported: boolean;
  /** Needs a managed option list. */
  usesOptions: boolean;
  /** Reads its choices from a suggestion provider instead of stored options. */
  providerId?: string;
  /** Explains why a type is not yet usable, shown in the admin UI. */
  unsupportedReason?: string;
}

export const DATA_TYPE_SPECS: Record<FieldDataType, DataTypeSpec> = {
  TEXT: { label: "Text", supported: true, usesOptions: false },
  LONG_TEXT: { label: "Long text", supported: true, usesOptions: false },
  NUMBER: { label: "Whole number", supported: true, usesOptions: false },
  DECIMAL: { label: "Decimal number", supported: true, usesOptions: false },
  CURRENCY: { label: "Money", supported: true, usesOptions: false },
  PERCENTAGE: { label: "Percentage", supported: true, usesOptions: false },
  DATE: { label: "Date", supported: true, usesOptions: false },
  DATETIME: { label: "Date and time", supported: true, usesOptions: false },
  TIME: { label: "Time", supported: true, usesOptions: false },
  BOOLEAN: { label: "Yes / no", supported: true, usesOptions: false },
  SINGLE_SELECT: { label: "Choose one", supported: true, usesOptions: true },
  MULTI_SELECT: { label: "Choose several", supported: true, usesOptions: true },
  PHONE: { label: "Phone number", supported: true, usesOptions: false },
  EMAIL: { label: "Email address", supported: true, usesOptions: false },
  URL: { label: "Web address", supported: true, usesOptions: false },
  COUNTRY: { label: "Country", supported: true, usesOptions: false, providerId: "reference.country" },
  BRANCH: { label: "Branch", supported: true, usesOptions: false, providerId: "organization.branch" },
  USER: { label: "Team member", supported: true, usesOptions: false, providerId: "organization.member" },
  STATE: {
    label: "State / province",
    supported: false,
    usesOptions: false,
    unsupportedReason: "Needs a licensed country-to-state dataset, which this build does not ship.",
  },
  CITY: {
    label: "City",
    supported: false,
    usesOptions: false,
    unsupportedReason: "Needs a licensed city dataset, which this build does not ship.",
  },
  ADDRESS: {
    label: "Address",
    supported: false,
    usesOptions: false,
    unsupportedReason: "Needs a multi-part address control and validation rules per country.",
  },
  TEAM: {
    label: "Team",
    supported: false,
    usesOptions: false,
    unsupportedReason: "There is no Team model yet.",
  },
  ORGANIZATION: {
    label: "Organization",
    supported: false,
    usesOptions: false,
    unsupportedReason: "Cross-organization references are out of scope for a multi-tenant boundary.",
  },
  RELATIONSHIP: {
    label: "Link to another record",
    supported: false,
    usesOptions: false,
    unsupportedReason: "Needs a record picker and referential cleanup rules.",
  },
  FILE: {
    label: "File",
    supported: false,
    usesOptions: false,
    unsupportedReason: "Needs file storage, which is not configured.",
  },
  IMAGE: {
    label: "Image",
    supported: false,
    usesOptions: false,
    unsupportedReason: "Needs file storage, which is not configured.",
  },
};

export function isSupportedDataType(dataType: FieldDataType): boolean {
  return DATA_TYPE_SPECS[dataType].supported;
}

export function supportedDataTypes(): FieldDataType[] {
  return (Object.keys(DATA_TYPE_SPECS) as FieldDataType[]).filter((type) => DATA_TYPE_SPECS[type].supported);
}
