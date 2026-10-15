import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeEmployeeBranchesAction } from "@/lib/employees/employee-actions";

const mocks = vi.hoisted(() => {
  const tx = {
    membershipBranch: { deleteMany: vi.fn() },
    membership: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  };

  return {
    tx,
    getCurrentUser: vi.fn(),
    loadTenantContext: vi.fn(),
    requirePermission: vi.fn(),
    membershipFindUnique: vi.fn(),
    branchCount: vi.fn(),
    membershipBranchCount: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    membership: { findUnique: mocks.membershipFindUnique },
    branch: { count: mocks.branchCount },
    membershipBranch: { count: mocks.membershipBranchCount },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac/guard", () => ({
  loadTenantContext: mocks.loadTenantContext,
  requirePermission: mocks.requirePermission,
  ForbiddenError: class ForbiddenError extends Error {},
}));

describe("employee branch assignment scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
    mocks.membershipFindUnique.mockResolvedValue({ id: "target-membership", organizationId: "org-a" });
    mocks.loadTenantContext.mockResolvedValue({
      organizationId: "org-a",
      membershipId: "actor-membership",
      allBranches: false,
    });
    mocks.branchCount.mockResolvedValue(1);
    mocks.membershipBranchCount.mockResolvedValue(1);
    mocks.tx.membershipBranch.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.membership.update.mockResolvedValue({});
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      Promise.resolve(callback(mocks.tx)),
    );
  });

  it("allows a scoped manager to grant a branch they can access", async () => {
    await expect(
      changeEmployeeBranchesAction("target-membership", { allBranches: false, branchIds: ["branch-a"] }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.membershipBranchCount).toHaveBeenCalledWith({
      where: { membershipId: "actor-membership", branchId: { in: ["branch-a"] } },
    });
    expect(mocks.tx.membership.update).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rejects all-branches access for a scoped manager before writes", async () => {
    const result = await changeEmployeeBranchesAction("target-membership", { allBranches: true, branchIds: [] });

    expect(result).toMatchObject({ ok: false, error: "You cannot grant access to branches you cannot access" });
    expect(mocks.branchCount).not.toHaveBeenCalled();
    expect(mocks.membershipBranchCount).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a branch the manager cannot access before writes", async () => {
    mocks.membershipBranchCount.mockResolvedValue(0);

    const result = await changeEmployeeBranchesAction("target-membership", { allBranches: false, branchIds: ["branch-a"] });

    expect(result).toMatchObject({ ok: false, error: "You cannot grant access to branches you cannot access" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects foreign or archived branch IDs before writes", async () => {
    mocks.branchCount.mockResolvedValue(0);

    const result = await changeEmployeeBranchesAction("target-membership", { allBranches: false, branchIds: ["foreign-branch"] });

    expect(result).toMatchObject({ ok: false, error: "One or more branches were not found" });
    expect(mocks.membershipBranchCount).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not change a membership in an organization the actor cannot access", async () => {
    mocks.membershipFindUnique.mockResolvedValue({ id: "target-membership", organizationId: "org-b" });
    mocks.loadTenantContext.mockResolvedValue(null);

    const result = await changeEmployeeBranchesAction("target-membership", { allBranches: true, branchIds: [] });

    expect(result).toMatchObject({ ok: false, error: "Membership not found" });
    expect(mocks.branchCount).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows an all-branches manager to grant all-branches access", async () => {
    mocks.loadTenantContext.mockResolvedValue({
      organizationId: "org-a",
      membershipId: "actor-membership",
      allBranches: true,
    });

    await expect(
      changeEmployeeBranchesAction("target-membership", { allBranches: true, branchIds: [] }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.membershipBranchCount).not.toHaveBeenCalled();
    expect(mocks.tx.membership.update).toHaveBeenCalledWith({
      where: { id: "target-membership" },
      data: { allBranches: true, branches: undefined },
    });
  });
});
