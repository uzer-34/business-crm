-- Milestone 2: metadata / attribute engine.
--
-- Replaces the CUSTOMER-only custom-field tables with a reusable field system
-- that works for any entity in the code-level entity registry.
--
-- Existing custom_field_definitions / custom_field_values rows are COPIED
-- FORWARD into the new tables before the old ones are dropped, so no
-- configured field or captured value is lost. The five legacy types map onto
-- the new data types, and each legacy JSON options array becomes real
-- field_options rows.
--
-- Ordering matters: create everything, migrate the data, then drop.

-- CreateEnum
CREATE TYPE "FieldDataType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DECIMAL', 'CURRENCY', 'PERCENTAGE', 'DATE', 'DATETIME', 'TIME', 'BOOLEAN', 'SINGLE_SELECT', 'MULTI_SELECT', 'PHONE', 'EMAIL', 'URL', 'COUNTRY', 'STATE', 'CITY', 'ADDRESS', 'USER', 'TEAM', 'ORGANIZATION', 'BRANCH', 'RELATIONSHIP', 'FILE', 'IMAGE');

-- CreateEnum
CREATE TYPE "FieldSource" AS ENUM ('SYSTEM', 'CUSTOM', 'INDUSTRY', 'CATEGORY');

-- DropIndex
DROP INDEX "categories_organizationId_kind_name_key";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "field_sections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "placeholder" TEXT,
    "dataType" "FieldDataType" NOT NULL,
    "source" "FieldSource" NOT NULL DEFAULT 'CUSTOM',
    "templateKey" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" JSONB,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "sectionId" TEXT,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "sortable" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "roleKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "industryKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definition_categories" (
    "id" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "field_definition_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_options" (
    "id" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    CONSTRAINT "field_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_values" (
    "id" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_field_recommendations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT,
    "recommendRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultSelected" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_field_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_sections_organizationId_entityKey_archivedAt_idx" ON "field_sections"("organizationId", "entityKey", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "field_sections_organizationId_entityKey_key_key" ON "field_sections"("organizationId", "entityKey", "key");

-- CreateIndex
CREATE INDEX "field_definitions_organizationId_entityKey_archivedAt_idx" ON "field_definitions"("organizationId", "entityKey", "archivedAt");

-- CreateIndex
CREATE INDEX "field_definitions_sectionId_idx" ON "field_definitions"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "field_definitions_organizationId_entityKey_key_key" ON "field_definitions"("organizationId", "entityKey", "key");

-- CreateIndex
CREATE INDEX "field_definition_categories_categoryId_idx" ON "field_definition_categories"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "field_definition_categories_fieldDefinitionId_categoryId_key" ON "field_definition_categories"("fieldDefinitionId", "categoryId");

-- CreateIndex
CREATE INDEX "field_options_fieldDefinitionId_isActive_idx" ON "field_options"("fieldDefinitionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "field_options_fieldDefinitionId_value_key" ON "field_options"("fieldDefinitionId", "value");

-- CreateIndex
CREATE INDEX "field_values_entityId_idx" ON "field_values"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "field_values_fieldDefinitionId_entityId_key" ON "field_values"("fieldDefinitionId", "entityId");

-- CreateIndex
CREATE INDEX "category_field_recommendations_organizationId_categoryId_is_idx" ON "category_field_recommendations"("organizationId", "categoryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "category_field_recommendations_categoryId_templateKey_key" ON "category_field_recommendations"("categoryId", "templateKey");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organizationId_kind_parentId_name_key" ON "categories"("organizationId", "kind", "parentId", "name");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_sections" ADD CONSTRAINT "field_sections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "field_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definition_categories" ADD CONSTRAINT "field_definition_categories_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definition_categories" ADD CONSTRAINT "field_definition_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_options" ADD CONSTRAINT "field_options_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_field_recommendations" ADD CONSTRAINT "category_field_recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_field_recommendations" ADD CONSTRAINT "category_field_recommendations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data migration: legacy custom fields -> field_definitions / field_options /
-- field_values. Guarded so it is a no-op on a database that never had the
-- legacy tables.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'custom_field_definitions') THEN

    -- Ids are carried over unchanged so existing values reconnect by FK and
    -- any external reference to a definition id keeps resolving.
    INSERT INTO "field_definitions" (
      "id", "organizationId", "entityKey", "key", "label", "dataType", "source",
      "isRequired", "displayOrder", "searchable", "filterable", "sortable",
      "hidden", "roleKeys", "archivedAt", "createdAt", "updatedAt"
    )
    SELECT
      d."id",
      d."organizationId",
      'customer',
      d."key",
      d."label",
      (CASE d."fieldType"::text
        WHEN 'TEXT'    THEN 'TEXT'
        WHEN 'NUMBER'  THEN 'NUMBER'
        WHEN 'DATE'    THEN 'DATE'
        WHEN 'BOOLEAN' THEN 'BOOLEAN'
        WHEN 'SELECT'  THEN 'SINGLE_SELECT'
        ELSE 'TEXT'
      END)::"FieldDataType",
      'CUSTOM'::"FieldSource",
      d."required",
      0, false, false, false, false,
      ARRAY[]::text[],
      d."archivedAt",
      d."createdAt",
      d."createdAt"
    FROM "custom_field_definitions" d;

    -- Legacy options were a JSON array of plain strings, so value and label
    -- both take that string; the label can be renamed later without touching
    -- stored values.
    INSERT INTO "field_options" ("id", "fieldDefinitionId", "value", "label", "displayOrder", "isActive")
    SELECT
      md5(d."id" || ':' || opt.ord::text || ':' || opt.value),
      d."id",
      opt.value,
      opt.value,
      (opt.ord - 1)::int,
      true
    FROM "custom_field_definitions" d
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(d."options") = 'array' THEN d."options" ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS opt(value, ord)
    WHERE d."options" IS NOT NULL;

    INSERT INTO "field_values" ("id", "fieldDefinitionId", "entityId", "value", "updatedAt")
    SELECT v."id", v."definitionId", v."entityId", v."value", v."updatedAt"
    FROM "custom_field_values" v
    -- Skip orphans rather than fail the whole migration on pre-existing bad data.
    WHERE EXISTS (SELECT 1 FROM "field_definitions" f WHERE f."id" = v."definitionId");

  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- The legacy tables are dropped only now that their contents live in the new
-- ones.
-- ---------------------------------------------------------------------------

-- DropForeignKey
ALTER TABLE "custom_field_definitions" DROP CONSTRAINT "custom_field_definitions_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "custom_field_values" DROP CONSTRAINT "custom_field_values_definitionId_fkey";

-- DropTable
DROP TABLE "custom_field_definitions";

-- DropTable
DROP TABLE "custom_field_values";

-- DropEnum
DROP TYPE "CustomFieldEntityType";

-- DropEnum
DROP TYPE "CustomFieldType";
