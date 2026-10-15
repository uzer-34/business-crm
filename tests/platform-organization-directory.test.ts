import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformForbiddenError } from "@/lib/platform/authorization";
import { getPlatformOrganizationDirectory } from "@/lib/platform/organization-directory";

const mocks = vi.hoisted(() => {
  const tx = {
    organization: { count: vi.fn(), findMany: vi.fn() },
    platformAuditLog: { create: vi.fn() },
  };
  return {
    tx,
    findPrincipal: vi.fn(),
    getCurrentUser: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    platformPrincipal: { findUnique: mocks.findPrincipal },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("platform organization directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PLATFORM_CONTROL_PLANE_ENABLED", "true");
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.findPrincipal.mockResolvedValue({
      id: "platform-principal-1",
      status: "ACTIVE",
      grants: [{ capability: "platform.organizations.view" }],
      user: { memberships: [] },
    });
    mocks.tx.organization.count.mockResolvedValue(1);
    mocks.tx.organization.findMany.mockResolvedValue([
      {
        id: "org-1",
        name: "Northwind",
        industryKey: "retail",
        countryCode: "IN",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);
    mocks.tx.platformAuditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns a small organization DTO and records the read in the same transaction", async () => {
    const result = await getPlatformOrganizationDirectory({
      query: "  North  ",
      page: 1,
    });

    expect(result.organizations).toEqual([
      {
        id: "org-1",
        name: "Northwind",
        industryKey: "retail",
        countryCode: "IN",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    expect(mocks.tx.organization.count).toHaveBeenCalledWith({
      where: { name: { contains: "North", mode: "insensitive" } },
    });
    expect(mocks.tx.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          industryKey: true,
          countryCode: true,
          createdAt: true,
        },
        take: 25,
      }),
    );
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: {
        actorPrincipalId: "platform-principal-1",
        action: "platform.organizations.directory_viewed",
        targetType: "OrganizationDirectory",
        metadata: {
          page: 1,
          resultCount: 1,
          organizationIds: ["org-1"],
          searchApplied: true,
        },
      },
    });
    expect(mocks.tx.platformAuditLog.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.tx.organization.findMany.mock.invocationCallOrder[0],
    );
  });

  it("does not query organizations if the platform grant is missing", async () => {
    mocks.findPrincipal.mockResolvedValue(null);

    await expect(getPlatformOrganizationDirectory({})).rejects.toBeInstanceOf(
      PlatformForbiddenError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("resolves the actor from the authenticated session instead of caller input", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(getPlatformOrganizationDirectory({})).rejects.toBeInstanceOf(
      PlatformForbiddenError,
    );
    expect(mocks.findPrincipal).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not return directory data when its audit write fails", async () => {
    mocks.tx.platformAuditLog.create.mockRejectedValue(new Error("audit unavailable"));

    await expect(getPlatformOrganizationDirectory({})).rejects.toThrow(
      "audit unavailable",
    );
  });
});
