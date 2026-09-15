import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { loadFields, loadFieldLayout, loadFieldValues, ensureDefaultSections } from "@/lib/metadata/field-service";
import { persistFieldValues, validateFieldValues } from "@/lib/metadata/field-values";
import { prepareFieldValues } from "@/lib/metadata/save-values";
import { loadCategoryTree, loadRecommendations, seedRecommendationsForCategory } from "@/lib/metadata/category-service";
import { getTemplate } from "@/lib/metadata/attribute-library";

/*
 * Integration tests for the metadata engine against the real database.
 *
 * Two organizations are created with identically named fields and categories,
 * so a query that forgets its organizationId scope fails loudly rather than
 * passing by coincidence.
 */

const RUN = `meta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type Fixture = { organizationId: string; userId: string };

async function createOrg(label: string): Promise<Fixture> {
  const user = await db.user.create({ data: { email: `${RUN}-${label}@example.test`, name: `${label} owner` } });
  const organization = await db.organization.create({
    data: {
      name: `${RUN} ${label}`,
      countryCode: "US",
      currencyCode: "USD",
      timezone: "UTC",
      locale: "en-US",
      industryKey: "generic",
    },
  });
  return { organizationId: organization.id, userId: user.id };
}

let orgA: Fixture;
let orgB: Fixture;
let shirtCategoryA: string;

beforeAll(async () => {
  orgA = await createOrg("alpha");
  orgB = await createOrg("beta");

  // Same category name on both sides.
  for (const fixture of [orgA, orgB]) {
    await db.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: { organizationId: fixture.organizationId, kind: "PRODUCT", name: "Shirts" },
      });
      await seedRecommendationsForCategory(tx, fixture.organizationId, category.id, "Shirts");
      if (fixture === orgA) shirtCategoryA = category.id;
    });
  }
}, 60_000);

afterAll(async () => {
  for (const fixture of [orgA, orgB].filter(Boolean)) {
    await db.fieldValue.deleteMany({ where: { fieldDefinition: { organizationId: fixture.organizationId } } });
    await db.fieldDefinition.deleteMany({ where: { organizationId: fixture.organizationId } });
    await db.fieldSection.deleteMany({ where: { organizationId: fixture.organizationId } });
    await db.categoryFieldRecommendation.deleteMany({ where: { organizationId: fixture.organizationId } });
    await db.category.deleteMany({ where: { organizationId: fixture.organizationId } });
    await db.organization.delete({ where: { id: fixture.organizationId } });
    await db.user.delete({ where: { id: fixture.userId } });
  }
  await db.$disconnect();
}, 60_000);

describe("category recommendations", () => {
  it("seeds a known category with its defining attributes", async () => {
    const recommendations = await loadRecommendations(orgA.organizationId, shirtCategoryA, "product");
    const keys = recommendations.map((entry) => entry.templateKey);

    expect(keys).toEqual(expect.arrayContaining(["size", "color", "sleeve", "collar"]));
    expect(recommendations.every((entry) => entry.alreadyApplied === false)).toBe(true);
  });

  it("marks size as suggested-required for shirts", async () => {
    const recommendations = await loadRecommendations(orgA.organizationId, shirtCategoryA, "product");
    const size = recommendations.find((entry) => entry.templateKey === "size");

    expect(size?.recommendRequired).toBe(true);
    expect(size?.reason).toBeTruthy();
  });

  it("does not seed a category the library does not recognize", async () => {
    const category = await db.category.create({
      data: { organizationId: orgA.organizationId, kind: "PRODUCT", name: `${RUN} Widgets` },
    });
    const seeded = await db.$transaction((tx) =>
      seedRecommendationsForCategory(tx, orgA.organizationId, category.id, `${RUN} Widgets`),
    );

    expect(seeded).toBe(0);
  });

  it("never returns another organization's recommendations", async () => {
    const forA = await loadRecommendations(orgA.organizationId, shirtCategoryA, "product");
    // Same category id, wrong organization.
    const crossTenant = await loadRecommendations(orgB.organizationId, shirtCategoryA, "product");

    expect(forA.length).toBeGreaterThan(0);
    expect(crossTenant).toHaveLength(0);
  });

  it("is idempotent, so re-seeding does not duplicate", async () => {
    const before = await db.categoryFieldRecommendation.count({ where: { categoryId: shirtCategoryA } });
    await db.$transaction((tx) => seedRecommendationsForCategory(tx, orgA.organizationId, shirtCategoryA, "Shirts"));
    const after = await db.categoryFieldRecommendation.count({ where: { categoryId: shirtCategoryA } });

    expect(after).toBe(before);
  });
});

describe("category hierarchy", () => {
  it("builds a depth-first tree with full paths", async () => {
    const clothing = await db.category.create({
      data: { organizationId: orgB.organizationId, kind: "PRODUCT", name: `${RUN} Clothing`, depth: 0 },
    });
    const men = await db.category.create({
      data: { organizationId: orgB.organizationId, kind: "PRODUCT", name: "Men", parentId: clothing.id, depth: 1 },
    });
    await db.category.create({
      data: { organizationId: orgB.organizationId, kind: "PRODUCT", name: "Formal", parentId: men.id, depth: 2 },
    });

    const tree = await loadCategoryTree(orgB.organizationId, "PRODUCT");
    const formal = tree.find((node) => node.name === "Formal");

    expect(formal?.depth).toBe(2);
    expect(formal?.path).toBe(`${RUN} Clothing › Men › Formal`);
    expect(tree.find((node) => node.id === clothing.id)?.childCount).toBe(1);
  });

  it("allows the same child name under different parents", async () => {
    const parentOne = await db.category.create({
      data: { organizationId: orgA.organizationId, kind: "PRODUCT", name: `${RUN} Men` },
    });
    const parentTwo = await db.category.create({
      data: { organizationId: orgA.organizationId, kind: "PRODUCT", name: `${RUN} Women` },
    });

    await db.category.create({
      data: { organizationId: orgA.organizationId, kind: "PRODUCT", name: "Jeans", parentId: parentOne.id, depth: 1 },
    });
    // Same name, different parent — must not collide.
    const second = await db.category.create({
      data: { organizationId: orgA.organizationId, kind: "PRODUCT", name: "Jeans", parentId: parentTwo.id, depth: 1 },
    });

    expect(second.id).toBeTruthy();
  });
});

describe("field definitions", () => {
  async function createField(fixture: Fixture, overrides: Record<string, unknown> = {}) {
    return db.$transaction(async (tx) => {
      await ensureDefaultSections(tx, fixture.organizationId, "product");
      return tx.fieldDefinition.create({
        data: {
          organizationId: fixture.organizationId,
          entityKey: "product",
          key: "shared_key",
          label: "Shared label",
          dataType: "TEXT",
          ...overrides,
        },
      });
    });
  }

  it("keeps identically keyed fields in separate organizations apart", async () => {
    await createField(orgA, { key: `${RUN}_shared` });
    await createField(orgB, { key: `${RUN}_shared` });

    const forA = await loadFields(orgA.organizationId, "product");
    const forB = await loadFields(orgB.organizationId, "product");

    expect(forA.filter((field) => field.key === `${RUN}_shared`)).toHaveLength(1);
    expect(forB.filter((field) => field.key === `${RUN}_shared`)).toHaveLength(1);
    expect(forA.find((f) => f.key === `${RUN}_shared`)?.id).not.toBe(
      forB.find((f) => f.key === `${RUN}_shared`)?.id,
    );
  });

  it("creates an entity's default sections once", async () => {
    await db.$transaction((tx) => ensureDefaultSections(tx, orgA.organizationId, "vehicle"));
    await db.$transaction((tx) => ensureDefaultSections(tx, orgA.organizationId, "vehicle"));

    const sections = await db.fieldSection.findMany({
      where: { organizationId: orgA.organizationId, entityKey: "vehicle" },
    });

    expect(sections).toHaveLength(3);
    expect(sections.map((section) => section.key)).toEqual(
      expect.arrayContaining(["identity", "technical", "ownership"]),
    );
  });

  it("hides archived fields from forms", async () => {
    const archived = await createField(orgA, { key: `${RUN}_archived`, archivedAt: new Date() });
    const fields = await loadFields(orgA.organizationId, "product");

    expect(fields.some((field) => field.id === archived.id)).toBe(false);
  });

  it("hides hidden fields from forms but shows them to configuration", async () => {
    const hidden = await createField(orgA, { key: `${RUN}_hidden`, hidden: true });

    const forForm = await loadFields(orgA.organizationId, "product");
    const forConfig = await loadFields(orgA.organizationId, "product", { includeHidden: true });

    expect(forForm.some((field) => field.id === hidden.id)).toBe(false);
    expect(forConfig.some((field) => field.id === hidden.id)).toBe(true);
  });

  it("scopes a category-limited field to that category only", async () => {
    const scoped = await createField(orgA, { key: `${RUN}_sleeve`, label: "Sleeve" });
    await db.fieldDefinitionCategory.create({
      data: { fieldDefinitionId: scoped.id, categoryId: shirtCategoryA },
    });

    const inShirts = await loadFields(orgA.organizationId, "product", { categoryId: shirtCategoryA });
    const uncategorized = await loadFields(orgA.organizationId, "product", { categoryId: null });

    expect(inShirts.some((field) => field.id === scoped.id)).toBe(true);
    expect(uncategorized.some((field) => field.id === scoped.id)).toBe(false);
  });

  it("shows an unscoped field in every category", async () => {
    const global = await createField(orgA, { key: `${RUN}_brand`, label: "Brand" });

    const inShirts = await loadFields(orgA.organizationId, "product", { categoryId: shirtCategoryA });
    const uncategorized = await loadFields(orgA.organizationId, "product", { categoryId: null });

    expect(inShirts.some((field) => field.id === global.id)).toBe(true);
    expect(uncategorized.some((field) => field.id === global.id)).toBe(true);
  });

  it("honours role visibility", async () => {
    const managerOnly = await createField(orgA, { key: `${RUN}_cost_note`, roleKeys: ["manager"] });

    const asManager = await loadFields(orgA.organizationId, "product", { roleKey: "manager" });
    const asEmployee = await loadFields(orgA.organizationId, "product", { roleKey: "employee" });

    expect(asManager.some((field) => field.id === managerOnly.id)).toBe(true);
    expect(asEmployee.some((field) => field.id === managerOnly.id)).toBe(false);
  });

  it("drops inactive options from what a form may offer", async () => {
    const select = await createField(orgA, { key: `${RUN}_wash`, dataType: "SINGLE_SELECT" });
    await db.fieldOption.createMany({
      data: [
        { fieldDefinitionId: select.id, value: "light", label: "Light", displayOrder: 0 },
        { fieldDefinitionId: select.id, value: "retired", label: "Retired", displayOrder: 1, isActive: false },
      ],
    });

    const fields = await loadFields(orgA.organizationId, "product");
    const loaded = fields.find((field) => field.id === select.id);

    expect(loaded?.options.map((option) => option.value)).toEqual(["light"]);
  });

  it("groups fields into their sections and keeps unsectioned ones last", async () => {
    const layout = await loadFieldLayout(orgA.organizationId, "product");

    expect(layout.length).toBeGreaterThan(0);
    expect(layout.every((section) => section.fields.length > 0)).toBe(true);
    if (layout.some((section) => section.key === "__unsectioned")) {
      expect(layout[layout.length - 1].key).toBe("__unsectioned");
    }
  });
});

describe("field values", () => {
  it("stores, reads back and clears a value", async () => {
    const definition = await db.fieldDefinition.create({
      data: {
        organizationId: orgA.organizationId,
        entityKey: "product",
        key: `${RUN}_material`,
        label: "Material",
        dataType: "TEXT",
      },
    });
    const entityId = `${RUN}-product-1`;

    const fields = await loadFields(orgA.organizationId, "product");
    const validated = validateFieldValues(fields, { [definition.id]: "Cotton" });
    await db.$transaction((tx) => persistFieldValues(tx, entityId, validated.values));

    const stored = await loadFieldValues(orgA.organizationId, "product", entityId);
    expect(stored[definition.id]).toBe("Cotton");

    const cleared = validateFieldValues(fields, { [definition.id]: "" });
    await db.$transaction((tx) => persistFieldValues(tx, entityId, cleared.values));

    const afterClear = await loadFieldValues(orgA.organizationId, "product", entityId);
    expect(afterClear[definition.id]).toBeUndefined();
  });

  it("does not read values across organizations even with the right entity id", async () => {
    const definition = await db.fieldDefinition.create({
      data: {
        organizationId: orgA.organizationId,
        entityKey: "product",
        key: `${RUN}_secret`,
        label: "Secret",
        dataType: "TEXT",
      },
    });
    const entityId = `${RUN}-shared-entity`;
    await db.fieldValue.create({ data: { fieldDefinitionId: definition.id, entityId, value: "alpha only" } });

    const asOwner = await loadFieldValues(orgA.organizationId, "product", entityId);
    const asOther = await loadFieldValues(orgB.organizationId, "product", entityId);

    expect(asOwner[definition.id]).toBe("alpha only");
    expect(asOther).toEqual({});
  });

  it("rejects a value for a field belonging to another organization", async () => {
    const foreign = await db.fieldDefinition.create({
      data: {
        organizationId: orgB.organizationId,
        entityKey: "product",
        key: `${RUN}_foreign`,
        label: "Foreign",
        dataType: "TEXT",
      },
    });

    // orgA submits orgB's field id — it is not in orgA's field list, so it is
    // rejected as unknown rather than written.
    const prepared = await prepareFieldValues(orgA.organizationId, "product", { [foreign.id]: "injected" });

    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.errors[0].message).toContain("does not exist");
    }
  });

  it("blocks a save that omits a required field", async () => {
    const required = await db.fieldDefinition.create({
      data: {
        organizationId: orgB.organizationId,
        entityKey: "supplier",
        key: `${RUN}_account_code`,
        label: "Account code",
        dataType: "TEXT",
        isRequired: true,
      },
    });

    const prepared = await prepareFieldValues(orgB.organizationId, "supplier", {});
    expect(prepared.ok).toBe(false);

    const withValue = await prepareFieldValues(orgB.organizationId, "supplier", { [required.id]: "AC-1" });
    expect(withValue.ok).toBe(true);
  });
});

describe("applying recommendations creates real fields", () => {
  it("turns a template into a field with its options and validation intact", async () => {
    // Mirrors what applyRecommendationsAction does, without the auth layer.
    const template = getTemplate("fuel");
    expect(template).not.toBeNull();

    const created = await db.fieldDefinition.create({
      data: {
        organizationId: orgB.organizationId,
        entityKey: "vehicle",
        key: template!.key,
        label: template!.label,
        dataType: template!.dataType,
        source: "CATEGORY",
        templateKey: template!.key,
        options: {
          create: (template!.options ?? []).map((option, index) => ({
            value: option.value,
            label: option.label,
            displayOrder: index,
          })),
        },
      },
      include: { options: true },
    });

    expect(created.options.map((option) => option.value)).toEqual(
      expect.arrayContaining(["petrol", "diesel", "electric"]),
    );

    // And the created field now validates values the way the template intends.
    const fields = await loadFields(orgB.organizationId, "vehicle");
    const loaded = fields.find((field) => field.id === created.id)!;

    expect(validateFieldValues([loaded], { [created.id]: "diesel" }).ok).toBe(true);
    expect(validateFieldValues([loaded], { [created.id]: "plutonium" }).ok).toBe(false);
  });
});
