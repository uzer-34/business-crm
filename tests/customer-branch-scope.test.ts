import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { assertBranchAccess, ForbiddenError, getAccessibleBranchIds, loadTenantContext } from "@/lib/rbac/guard";
import { buildCustomerWhere, parseCustomerListQuery } from "@/lib/customer/customer-list";
import { loadAccessibleCustomerContext, loadAccessibleCustomerInOrganization } from "@/lib/customer/access";

const mocks = vi.hoisted(() => ({
  findMembership: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  findBranch: vi.fn(),
  findBranches: vi.fn(),
  findMembershipBranch: vi.fn(),
  findCustomer: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    membership: { findUnique: mocks.findMembership },
    branch: { findFirst: mocks.findBranch, findMany: mocks.findBranches },
    membershipBranch: { findUnique: mocks.findMembershipBranch },
    customer: { findFirst: mocks.findCustomer },
  },
}));
vi.mock("@/lib/organization/active-org", () => ({
  getActiveOrganizationId: mocks.getActiveOrganizationId,
}));

function membership(allBranches: boolean) {
  return {
    id: "membership-a",
    organizationId: "org-a",
    roleId: "role-a",
    status: "ACTIVE",
    allBranches,
    role: { organizationId: "org-a", key: "owner", permissions: [{ permission: { key: "customers.view" } }] },
  };
}

function customer(branchId: string | null) {
  return {
    id: "customer-a",
    organizationId: "org-a",
    branchId,
    organization: { industryKey: "generic", currencyCode: "USD", locale: "en-US", timezone: "UTC" },
    branch: branchId ? { name: "Branch" } : null,
  };
}

describe("Customer branch scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveOrganizationId.mockResolvedValue("org-a");
  });

  it("allows an all-branches member to access a branch in the same organization", async () => {
    mocks.findBranch.mockResolvedValue({ id: "branch-a" });
    const ctx = { userId: "user-a", membershipId: "membership-a", organizationId: "org-a", roleId: "role-a", roleKey: "owner", allBranches: true, permissions: new Set<PermissionKey>() };

    await expect(assertBranchAccess(ctx, "branch-a")).resolves.toBeUndefined();
    expect(mocks.findBranch).toHaveBeenCalledWith({
      where: { id: "branch-a", organizationId: "org-a" },
      select: { id: true },
    });
    expect(mocks.findMembershipBranch).not.toHaveBeenCalled();
  });

  it("denies a foreign-organization branch even when allBranches is true", async () => {
    mocks.findBranch.mockResolvedValue(null);
    const ctx = { userId: "user-a", membershipId: "membership-a", organizationId: "org-a", roleId: "role-a", roleKey: "owner", allBranches: true, permissions: new Set<PermissionKey>() };

    await expect(assertBranchAccess(ctx, "branch-b")).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.findMembershipBranch).not.toHaveBeenCalled();
  });

  it("allows only a branch with a membership link for scoped members", async () => {
    mocks.findBranch.mockResolvedValue({ id: "branch-a" });
    mocks.findMembershipBranch.mockResolvedValue({ membershipId: "membership-a", branchId: "branch-a" });
    const ctx = { userId: "user-a", membershipId: "membership-a", organizationId: "org-a", roleId: "role-a", roleKey: "employee", allBranches: false, permissions: new Set<PermissionKey>() };

    await expect(assertBranchAccess(ctx, "branch-a")).resolves.toBeUndefined();
    mocks.findMembershipBranch.mockResolvedValue(null);
    await expect(assertBranchAccess(ctx, "branch-unassigned")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("resolves accessible IDs within the organization and membership scope", async () => {
    mocks.findBranches.mockResolvedValue([{ id: "branch-a" }]);
    const ctx = { userId: "user-a", membershipId: "membership-a", organizationId: "org-a", roleId: "role-a", roleKey: "employee", allBranches: false, permissions: new Set<PermissionKey>() };

    await expect(getAccessibleBranchIds(ctx)).resolves.toEqual(["branch-a"]);
    expect(mocks.findBranches).toHaveBeenCalledWith({
      where: { organizationId: "org-a", membershipBranches: { some: { membershipId: "membership-a" } } },
      select: { id: true },
    });
  });

  it("keeps list visibility aligned with allowed branches and organization-wide null-branch rows", async () => {
    const query = parseCustomerListQuery({ q: "acme" });
    const where = buildCustomerWhere("org-a", query, ["branch-a"]);

    expect(where.organizationId).toBe("org-a");
    expect(where.AND).toEqual([
      { OR: [{ branchId: null }, { branchId: { in: ["branch-a"] } }] },
      { OR: [
        { name: { contains: "acme", mode: "insensitive" } },
        { companyName: { contains: "acme", mode: "insensitive" } },
        { email: { contains: "acme", mode: "insensitive" } },
        { phone: { contains: "acme", mode: "insensitive" } },
      ] },
    ]);
  });

  it("fails closed for a branch filter that is outside the allowed ID set", () => {
    const where = buildCustomerWhere("org-a", parseCustomerListQuery({ branchId: "branch-b" }), ["branch-a"]);

    expect(where.AND).toEqual([{ branchId: { in: [] } }]);
  });

  it("allows detail access for null-branch Customers without changing organization-wide semantics", async () => {
    mocks.findCustomer.mockResolvedValue(customer(null));
    mocks.findMembership.mockResolvedValue(membership(false));
    const loaded = await loadAccessibleCustomerContext("user-a", "customer-a");

    expect(loaded?.customer.branchId).toBeNull();
    expect(loaded?.ctx.organizationId).toBe("org-a");
    expect(mocks.findBranch).not.toHaveBeenCalled();
  });

  it("allows detail access for a Customer in a linked branch", async () => {
    mocks.findCustomer.mockResolvedValue(customer("branch-a"));
    mocks.findMembership.mockResolvedValue(membership(false));
    mocks.findBranch.mockResolvedValue({ id: "branch-a" });
    mocks.findMembershipBranch.mockResolvedValue({ membershipId: "membership-a", branchId: "branch-a" });

    const loaded = await loadAccessibleCustomerContext("user-a", "customer-a");

    expect(loaded?.customer.id).toBe("customer-a");
    expect(mocks.findBranch).toHaveBeenCalledWith({
      where: { id: "branch-a", organizationId: "org-a" },
      select: { id: true },
    });
  });

  it("does not return detail for an unlinked branch in the same organization", async () => {
    mocks.findCustomer.mockResolvedValue(customer("branch-unassigned"));
    mocks.findMembership.mockResolvedValue(membership(false));
    mocks.findBranch.mockResolvedValue({ id: "branch-unassigned" });
    mocks.findMembershipBranch.mockResolvedValue(null);

    await expect(loadAccessibleCustomerContext("user-a", "customer-a")).resolves.toBeNull();
  });

  it("does not return a Customer whose branch belongs to another organization", async () => {
    mocks.findCustomer.mockResolvedValue(customer("branch-b"));
    mocks.findMembership.mockResolvedValue(membership(true));
    mocks.findBranch.mockResolvedValue(null);

    await expect(loadAccessibleCustomerContext("user-a", "customer-a")).resolves.toBeNull();
  });

  it("does not return a Customer when the caller has no membership in its organization", async () => {
    mocks.findCustomer.mockResolvedValue(customer(null));
    mocks.findMembership.mockResolvedValue(null);

    await expect(loadAccessibleCustomerContext("user-a", "customer-a")).resolves.toBeNull();
  });

  it("does not resolve a foreign-tenant Customer ID outside the active organization", async () => {
    mocks.findCustomer.mockResolvedValue(null);

    await expect(loadAccessibleCustomerContext("user-a", "customer-foreign")).resolves.toBeNull();
    expect(mocks.findCustomer).toHaveBeenCalledWith({
      where: { id: "customer-foreign", organizationId: "org-a" },
      include: {
        organization: { select: { industryKey: true, currencyCode: true, locale: true, timezone: true } },
        branch: { select: { name: true } },
      },
    });
    expect(mocks.findMembership).not.toHaveBeenCalled();
  });

  it("does not resolve a Customer for an organization other than the active workspace", async () => {
    await expect(
      loadAccessibleCustomerInOrganization("user-a", "customer-a", "org-b"),
    ).resolves.toBeNull();
    expect(mocks.findCustomer).not.toHaveBeenCalled();
  });

  it("keeps the common tenant context resolver membership-gated", async () => {
    mocks.findMembership.mockResolvedValue(null);
    await expect(loadTenantContext("user-a", "org-b")).resolves.toBeNull();
  });
});
