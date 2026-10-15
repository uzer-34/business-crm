import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordMovementAction, transferStockAction } from "@/lib/inventory/actions";

const mocks = vi.hoisted(() => {
  class MockForbiddenError extends Error {}

  const tx = { auditLog: { create: vi.fn() } };
  return {
    MockForbiddenError,
    tx,
    getCurrentUser: vi.fn(),
    loadTenantContext: vi.fn(),
    requirePermission: vi.fn(),
    assertBranchAccess: vi.fn(),
    productFindFirst: vi.fn(),
    variantFindFirst: vi.fn(),
    transaction: vi.fn(),
    applyStockMovement: vi.fn(),
    getStockQuantity: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    product: { findFirst: mocks.productFindFirst },
    productVariant: { findFirst: mocks.variantFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac/guard", () => ({
  loadTenantContext: mocks.loadTenantContext,
  requirePermission: mocks.requirePermission,
  assertBranchAccess: mocks.assertBranchAccess,
  ForbiddenError: mocks.MockForbiddenError,
}));
vi.mock("@/lib/inventory/stock", () => ({
  applyStockMovement: mocks.applyStockMovement,
  getStockQuantity: mocks.getStockQuantity,
}));

const context = { organizationId: "org-a", membershipId: "membership-a" };
const movement = {
  branchId: "branch-a",
  productId: "product-a",
  variantId: "variant-a",
  type: "ADJUSTMENT",
  quantityDelta: 3,
};
const transfer = {
  fromBranchId: "branch-a",
  toBranchId: "branch-b",
  productId: "product-a",
  variantId: "variant-a",
  quantity: 2,
};

describe("inventory tenant and variant integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
    mocks.loadTenantContext.mockResolvedValue(context);
    mocks.assertBranchAccess.mockResolvedValue(undefined);
    mocks.productFindFirst.mockResolvedValue({ id: "product-a" });
    mocks.variantFindFirst.mockResolvedValue({ id: "variant-a" });
    mocks.getStockQuantity.mockResolvedValue(10);
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      Promise.resolve(callback(mocks.tx)),
    );
  });

  it("records a valid variant movement only after resolving the variant under the tenant product", async () => {
    await expect(recordMovementAction("org-a", movement)).resolves.toEqual({ ok: true, data: undefined });

    expect(mocks.productFindFirst).toHaveBeenCalledWith({ where: { id: "product-a", organizationId: "org-a" } });
    expect(mocks.variantFindFirst).toHaveBeenCalledWith({
      where: { id: "variant-a", productId: "product-a" },
      select: { id: true },
    });
    expect(mocks.applyStockMovement).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it.each([
    ["nonexistent", null],
    ["foreign-organization or wrong-product", null],
  ])("rejects a %s variant before movement writes", async (_label, result) => {
    mocks.variantFindFirst.mockResolvedValue(result);

    await expect(recordMovementAction("org-a", movement)).resolves.toMatchObject({
      ok: false,
      error: "Product variant not found",
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.applyStockMovement).not.toHaveBeenCalled();
  });

  it("rejects a Product outside the active organization without looking up a Variant", async () => {
    mocks.productFindFirst.mockResolvedValue(null);

    await expect(recordMovementAction("org-a", movement)).resolves.toMatchObject({
      ok: false,
      error: "Product not found",
    });

    expect(mocks.variantFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("preserves base-product movements when variantId is omitted", async () => {
    const baseMovement = { ...movement, variantId: undefined };

    await expect(recordMovementAction("org-a", baseMovement)).resolves.toEqual({ ok: true, data: undefined });

    expect(mocks.variantFindFirst).not.toHaveBeenCalled();
    expect(mocks.applyStockMovement).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ productId: "product-a", variantId: undefined }),
    );
  });

  it("checks both transfer branches and records both movements for an in-scope variant", async () => {
    await expect(transferStockAction("org-a", transfer)).resolves.toEqual({ ok: true, data: undefined });

    expect(mocks.assertBranchAccess.mock.calls.map(([ctx, branchId]) => [ctx.organizationId, branchId])).toEqual([
      ["org-a", "branch-a"],
      ["org-a", "branch-b"],
    ]);
    expect(mocks.variantFindFirst).toHaveBeenCalledWith({
      where: { id: "variant-a", productId: "product-a" },
      select: { id: true },
    });
    expect(mocks.applyStockMovement).toHaveBeenCalledTimes(2);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rejects an invalid transfer Variant before writing either side", async () => {
    mocks.variantFindFirst.mockResolvedValue(null);

    await expect(transferStockAction("org-a", transfer)).resolves.toMatchObject({
      ok: false,
      error: "Product variant not found",
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.applyStockMovement).not.toHaveBeenCalled();
  });

  it("rejects a transfer when the destination branch is inaccessible", async () => {
    mocks.assertBranchAccess.mockImplementation(async (_ctx: unknown, branchId: string) => {
      if (branchId === "branch-b") throw new mocks.MockForbiddenError("No access to this branch");
    });

    await expect(transferStockAction("org-a", transfer)).resolves.toMatchObject({
      ok: false,
      error: "No access to this branch",
    });

    expect(mocks.assertBranchAccess).toHaveBeenCalledTimes(2);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
