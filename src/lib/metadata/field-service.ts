import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { FieldDataType, FieldSource } from "@/generated/prisma/enums";
import { getEntityDefinition } from "./entities";

/*
 * Read side of the metadata engine.
 *
 * Every query is scoped by organizationId taken from the caller's tenant
 * context — a field definition, option or value belonging to another business
 * is never reachable from here.
 */

export interface ResolvedFieldOption {
  value: string;
  label: string;
}

export interface ResolvedField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  dataType: FieldDataType;
  source: FieldSource;
  templateKey: string | null;
  isRequired: boolean;
  hidden: boolean;
  displayOrder: number;
  sectionId: string | null;
  validation: Record<string, number | string> | null;
  roleKeys: string[];
  options: ResolvedFieldOption[];
  categoryIds: string[];
}

export interface ResolvedSection {
  id: string;
  key: string;
  label: string;
  description: string | null;
  displayOrder: number;
  fields: ResolvedField[];
}

export interface FieldQueryOptions {
  /**
   * Restricts to fields that apply to this category, i.e. fields with no
   * category scope at all plus fields explicitly scoped to it. Omit to get
   * every field for the entity.
   */
  categoryId?: string | null;
  /** Drops fields whose roleKeys exclude this role. */
  roleKey?: string;
  /** Include fields marked hidden (the configuration screen needs them). */
  includeHidden?: boolean;
}

type FieldRow = Prisma.FieldDefinitionGetPayload<{
  include: { options: true; categories: { select: { categoryId: true } } };
}>;

function toResolvedField(row: FieldRow): ResolvedField {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    placeholder: row.placeholder,
    dataType: row.dataType,
    source: row.source,
    templateKey: row.templateKey,
    isRequired: row.isRequired,
    hidden: row.hidden,
    displayOrder: row.displayOrder,
    sectionId: row.sectionId,
    validation: (row.validation as Record<string, number | string> | null) ?? null,
    roleKeys: row.roleKeys,
    options: row.options
      .filter((option) => option.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((option) => ({ value: option.value, label: option.label })),
    categoryIds: row.categories.map((link) => link.categoryId),
  };
}

export async function loadFields(
  organizationId: string,
  entityKey: string,
  options: FieldQueryOptions = {},
): Promise<ResolvedField[]> {
  const rows = await db.fieldDefinition.findMany({
    where: {
      organizationId,
      entityKey,
      archivedAt: null,
      ...(options.includeHidden ? {} : { hidden: false }),
    },
    include: { options: true, categories: { select: { categoryId: true } } },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  return rows
    .map(toResolvedField)
    .filter((field) => {
      // A field with no category links is global to the entity; one with links
      // only applies to the categories it names.
      if (options.categoryId === undefined) return true;
      if (field.categoryIds.length === 0) return true;
      return options.categoryId !== null && field.categoryIds.includes(options.categoryId);
    })
    .filter((field) => field.roleKeys.length === 0 || !options.roleKey || field.roleKeys.includes(options.roleKey));
}

/** Fields grouped into their sections, with anything unsectioned last. */
export async function loadFieldLayout(
  organizationId: string,
  entityKey: string,
  options: FieldQueryOptions = {},
): Promise<ResolvedSection[]> {
  const [fields, sections] = await Promise.all([
    loadFields(organizationId, entityKey, options),
    db.fieldSection.findMany({
      where: { organizationId, entityKey, archivedAt: null },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const grouped: ResolvedSection[] = sections.map((section) => ({
    id: section.id,
    key: section.key,
    label: section.label,
    description: section.description,
    displayOrder: section.displayOrder,
    fields: fields.filter((field) => field.sectionId === section.id),
  }));

  const unsectioned = fields.filter((field) => !field.sectionId || !sections.some((s) => s.id === field.sectionId));
  if (unsectioned.length > 0) {
    grouped.push({
      id: "__unsectioned",
      key: "__unsectioned",
      label: "Other details",
      description: null,
      displayOrder: Number.MAX_SAFE_INTEGER,
      fields: unsectioned,
    });
  }

  return grouped.filter((section) => section.fields.length > 0);
}

/** Stored values for one record, keyed by field id. */
export async function loadFieldValues(
  organizationId: string,
  entityKey: string,
  entityId: string,
): Promise<Record<string, unknown>> {
  const rows = await db.fieldValue.findMany({
    // Joining through the definition keeps this tenant-safe: an entityId
    // guessed from another organization resolves to nothing.
    where: { entityId, fieldDefinition: { organizationId, entityKey } },
    select: { fieldDefinitionId: true, value: true },
  });

  return Object.fromEntries(rows.map((row) => [row.fieldDefinitionId, row.value]));
}

/**
 * Values for many records at once, keyed by entity id then field id — used by
 * list views so rendering N records stays a single query rather than N.
 */
export async function loadFieldValuesForMany(
  organizationId: string,
  entityKey: string,
  entityIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  if (entityIds.length === 0) return new Map();

  const rows = await db.fieldValue.findMany({
    where: { entityId: { in: entityIds }, fieldDefinition: { organizationId, entityKey } },
    select: { entityId: true, fieldDefinitionId: true, value: true },
  });

  const byEntity = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const existing = byEntity.get(row.entityId) ?? {};
    existing[row.fieldDefinitionId] = row.value;
    byEntity.set(row.entityId, existing);
  }
  return byEntity;
}

/**
 * Creates an entity's default sections the first time it is configured, so an
 * owner never has to invent a section layout before adding a single field.
 */
export async function ensureDefaultSections(
  client: Prisma.TransactionClient,
  organizationId: string,
  entityKey: string,
): Promise<void> {
  const entity = getEntityDefinition(entityKey);
  if (!entity) return;

  const existing = await client.fieldSection.findMany({
    where: { organizationId, entityKey },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((section) => section.key));

  const missing = entity.defaultSections
    .map((section, index) => ({ ...section, index }))
    .filter((section) => !existingKeys.has(section.key));

  if (missing.length === 0) return;

  await client.fieldSection.createMany({
    data: missing.map((section) => ({
      organizationId,
      entityKey,
      key: section.key,
      label: section.label,
      description: section.description ?? null,
      displayOrder: section.index,
    })),
  });
}
