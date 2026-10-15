import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSuggestions } from "@/lib/metadata/suggestions";

const mocks = vi.hoisted(() => ({
  branchFindMany: vi.fn(),
  membershipFindMany: vi.fn(),
  getCurrentUser: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  loadTenantContext: vi.fn(),
  getAccessibleBranchIds: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    branch: { findMany: mocks.branchFindMany },
    membership: { findMany: mocks.membershipFindMany },
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/organization/active-org", () => ({
  getActiveOrganizationId: mocks.getActiveOrganizationId,
}));
vi.mock("@/lib/rbac/guard", () => ({
  loadTenantContext: mocks.loadTenantContext,
  getAccessibleBranchIds: mocks.getAccessibleBranchIds,
}));

describe("metadata suggestion authorization and scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
    mocks.getActiveOrganizationId.mockResolvedValue("org-a");
    mocks.loadTenantContext.mockResolvedValue({
      organizationId: "org-a",
      permissions: new Set(["branches.view", "employees.view"]),
    });
    mocks.getAccessibleBranchIds.mockResolvedValue(["branch-a"]);
    mocks.branchFindMany.mockResolvedValue([{ id: "branch-a", name: "North", city: "Leeds" }]);
    mocks.membershipFindMany.mockResolvedValue([
      { id: "membership-a", user: { name: "A. User", email: "a@example.com", phone: null } },
    ]);
  });

  it("returns branch options only from the caller's accessible branches", async () => {
    await expect(fetchSuggestions({ providerId: "organization.branch" })).resolves.toEqual([
      { value: "branch-a", label: "North", hint: "Leeds" },
    ]);

    expect(mocks.getAccessibleBranchIds).toHaveBeenCalledOnce();
    expect(mocks.branchFindMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", archivedAt: null, id: { in: ["branch-a"] } },
      select: { id: true, name: true, city: true },
      orderBy: { name: "asc" },
    });
  });

  it("does not expose branch options without branches.view", async () => {
    mocks.loadTenantContext.mockResolvedValue({ organizationId: "org-a", permissions: new Set() });

    await expect(fetchSuggestions({ providerId: "organization.branch" })).resolves.toEqual([]);

    expect(mocks.getAccessibleBranchIds).not.toHaveBeenCalled();
    expect(mocks.branchFindMany).not.toHaveBeenCalled();
  });

  it("does not expose member contact options without employees.view", async () => {
    mocks.loadTenantContext.mockResolvedValue({ organizationId: "org-a", permissions: new Set() });

    await expect(fetchSuggestions({ providerId: "organization.member" })).resolves.toEqual([]);

    expect(mocks.membershipFindMany).not.toHaveBeenCalled();
  });

  it("scopes member options to active memberships with an organization-consistent role", async () => {
    await expect(fetchSuggestions({ providerId: "organization.member" })).resolves.toEqual([
      { value: "membership-a", label: "A. User" },
    ]);

    expect(mocks.membershipFindMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", status: "ACTIVE", role: { organizationId: "org-a" } },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
  });

  it("fails closed when there is no active organization context", async () => {
    mocks.getActiveOrganizationId.mockResolvedValue(null);

    await expect(fetchSuggestions({ providerId: "organization.member" })).resolves.toEqual([]);

    expect(mocks.loadTenantContext).not.toHaveBeenCalled();
    expect(mocks.membershipFindMany).not.toHaveBeenCalled();
  });
});
