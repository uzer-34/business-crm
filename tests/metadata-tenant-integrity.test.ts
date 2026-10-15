import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFieldAction, updateFieldAction, applyRecommendationsAction } from "@/lib/metadata/field-actions";

const mocks = vi.hoisted(() => {
  class MockForbiddenError extends Error {}

  const tx = {
    category: { count: vi.fn() },
    fieldSection: { findFirst: vi.fn() },
    fieldDefinition: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    fieldOption: { upsert: vi.fn(), updateMany: vi.fn() },
    fieldDefinitionCategory: { deleteMany: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
  };

  return {
    MockForbiddenError,
    tx,
    getCurrentUser: vi.fn(),
    loadTenantContext: vi.fn(),
    requirePermission: vi.fn(),
    recordAudit: vi.fn(),
    ensureDefaultSections: vi.fn(),
    getTemplate: vi.fn(),
    fieldDefinitionFindUnique: vi.fn(),
    categoryFindFirst: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    fieldDefinition: { findUnique: mocks.fieldDefinitionFindUnique },
    category: { findFirst: mocks.categoryFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac/guard", () => ({
  loadTenantContext: mocks.loadTenantContext,
  requirePermission: mocks.requirePermission,
  ForbiddenError: mocks.MockForbiddenError,
}));
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/metadata/field-service", () => ({ ensureDefaultSections: mocks.ensureDefaultSections }));
vi.mock("@/lib/metadata/attribute-library", () => ({
  getTemplate: mocks.getTemplate,
  isTemplateKey: (key: string) => key === "fabric",
}));

const createInput = {
  entityKey: "product",
  key: "fabric",
  label: "Fabric",
  dataType: "TEXT",
  sectionId: "section-a",
  categoryIds: ["category-a"],
};
const updateInput = {
  label: "Fabric",
  sectionId: "section-a",
  categoryIds: ["category-a"],
};

describe("custom-field tenant integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
    mocks.loadTenantContext.mockResolvedValue({ organizationId: "org-a", permissions: new Set() });
    mocks.fieldDefinitionFindUnique.mockResolvedValue(null);
    mocks.tx.fieldSection.findFirst.mockResolvedValue({ id: "section-a" });
    mocks.tx.category.count.mockResolvedValue(1);
    mocks.tx.fieldDefinition.findFirst.mockResolvedValue(null);
    mocks.tx.fieldDefinition.create.mockResolvedValue({ id: "field-a" });
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      Promise.resolve(callback(mocks.tx)),
    );
  });

  it("accepts a same-organization section and matching Product category", async () => {
    await expect(createFieldAction("org-a", createInput)).resolves.toMatchObject({ ok: true });

    expect(mocks.tx.fieldSection.findFirst).toHaveBeenCalledWith({
      where: { id: "section-a", organizationId: "org-a", entityKey: "product" },
      select: { id: true },
    });
    expect(mocks.tx.category.count).toHaveBeenCalledWith({
      where: { id: { in: ["category-a"] }, organizationId: "org-a", kind: "PRODUCT" },
    });
    expect(mocks.ensureDefaultSections).toHaveBeenCalledOnce();
    expect(mocks.ensureDefaultSections.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.tx.fieldSection.findFirst.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.fieldDefinition.create).toHaveBeenCalledOnce();
  });

  it.each(["foreign-organization", "mismatched entity type", "missing"])(
    "rejects a %s section before creating a field",
    async () => {
      mocks.tx.fieldSection.findFirst.mockResolvedValue(null);

      await expect(createFieldAction("org-a", createInput)).resolves.toMatchObject({ ok: false });

      expect(mocks.ensureDefaultSections).not.toHaveBeenCalled();
      expect(mocks.tx.fieldDefinition.create).not.toHaveBeenCalled();
    },
  );

  it("rejects an incompatible Category-to-FieldDefinition link", async () => {
    mocks.tx.category.count.mockResolvedValue(0);

    await expect(createFieldAction("org-a", createInput)).resolves.toMatchObject({ ok: false });

    expect(mocks.tx.category.count).toHaveBeenCalledWith({
      where: { id: { in: ["category-a"] }, organizationId: "org-a", kind: "PRODUCT" },
    });
    expect(mocks.ensureDefaultSections).not.toHaveBeenCalled();
    expect(mocks.tx.fieldDefinition.create).not.toHaveBeenCalled();
  });

  it("validates update section and category links using the existing field entity type", async () => {
    mocks.fieldDefinitionFindUnique.mockResolvedValue({
      id: "field-a",
      organizationId: "org-a",
      entityKey: "product",
      options: [],
    });
    mocks.tx.fieldSection.findFirst.mockResolvedValue(null);

    await expect(updateFieldAction("field-a", updateInput)).resolves.toMatchObject({ ok: false });

    expect(mocks.tx.fieldSection.findFirst).toHaveBeenCalledWith({
      where: { id: "section-a", organizationId: "org-a", entityKey: "product" },
      select: { id: true },
    });
    expect(mocks.tx.fieldDefinition.update).not.toHaveBeenCalled();
  });

  it("requires a recommendation Category to match the requested entity type", async () => {
    mocks.categoryFindFirst.mockResolvedValue(null);

    await expect(
      applyRecommendationsAction("org-a", {
        categoryId: "category-a",
        entityKey: "product",
        templateKeys: ["fabric"],
        scopeToCategory: true,
      }),
    ).resolves.toMatchObject({ ok: false });

    expect(mocks.categoryFindFirst).toHaveBeenCalledWith({
      where: { id: "category-a", organizationId: "org-a", kind: "PRODUCT" },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
