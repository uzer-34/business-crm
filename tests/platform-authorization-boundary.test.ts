import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { ForbiddenError, loadTenantContext, requirePermission } from "@/lib/rbac/guard";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { membership: { findUnique: mocks.findUnique } } }));

describe("platform authorization boundary", () => {
  beforeEach(() => mocks.findUnique.mockReset());

  it("does not load non-catalog platform keys from a tenant Owner role", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "owner-membership",
      userId: "user-1",
      organizationId: "org-1",
      roleId: "owner-role",
      role: {
        organizationId: "org-1",
        key: "owner",
        permissions: [
          { permission: { key: "customers.view" } },
          { permission: { key: "platform.licenses.manage" } },
        ],
      },
      status: "ACTIVE",
      allBranches: true,
    });

    const context = await loadTenantContext("user-1", "org-1");

    expect([...context!.permissions]).toEqual(["customers.view"]);
  });

  it("denies a membership whose role belongs to another organization", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "member-a",
      organizationId: "org-1",
      status: "ACTIVE",
      allBranches: true,
      roleId: "role-b",
      role: {
        organizationId: "org-2",
        key: "owner",
        permissions: [{ permission: { key: "customers.view" } }],
      },
    });

    await expect(loadTenantContext("user-1", "org-1")).resolves.toBeNull();
  });

  it("rejects a forged platform capability at the tenant permission guard", () => {
    const context = {
      userId: "user-1",
      membershipId: "owner-membership",
      organizationId: "org-1",
      roleId: "owner-role",
      roleKey: "owner",
      allBranches: true,
      permissions: new Set(["platform.licenses.manage"] as unknown as PermissionKey[]),
    };

    expect(() =>
      requirePermission(context, "platform.licenses.manage" as PermissionKey),
    ).toThrow(ForbiddenError);
  });
});
