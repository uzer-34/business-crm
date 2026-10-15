import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setPlatformOrganizationDirectoryGrant,
  setPlatformPrincipalStatus,
  PlatformPrincipalConflictError,
} from "@/lib/platform/principal-management";
import { PlatformForbiddenError } from "@/lib/platform/authorization";

const state = vi.hoisted(() => ({
  capabilities: ["platform.security.manage"] as string[],
}));
const mocks = vi.hoisted(() => {
  const tx = {
    platformPrincipal: { findUnique: vi.fn(), updateMany: vi.fn() },
    platformGrant: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    platformAuditLog: { create: vi.fn() },
  };
  return { tx, transaction: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "security-user" }),
}));
vi.mock("@/lib/platform/authorization", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform/authorization")>("@/lib/platform/authorization");
  return {
    ...actual,
    loadPlatformContext: vi.fn().mockImplementation(async () => ({
      principalId: "security-principal",
      userId: "security-user",
      capabilities: new Set(state.capabilities),
    })),
  };
});

describe("platform principal management operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.capabilities = ["platform.security.manage"];
    mocks.tx.platformPrincipal.findUnique.mockResolvedValue({
      id: "target-principal",
      status: "ACTIVE",
      user: { memberships: [] },
    });
    mocks.tx.platformPrincipal.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.platformGrant.findUnique.mockResolvedValue(null);
    mocks.tx.platformGrant.create.mockResolvedValue({ id: "grant-1" });
    mocks.tx.platformGrant.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.platformAuditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    );
  });

  it("requires the separate platform security capability before starting a transaction", async () => {
    state.capabilities = ["platform.organizations.view"];

    await expect(setPlatformPrincipalStatus({
      principalId: "target-principal",
      status: "DISABLED",
      reason: "Access review completed",
    })).rejects.toBeInstanceOf(PlatformForbiddenError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("changes principal status with optimistic concurrency and an atomic audit row", async () => {
    await setPlatformPrincipalStatus({
      principalId: "target-principal",
      status: "DISABLED",
      reason: "Access review completed",
    });

    expect(mocks.tx.platformPrincipal.updateMany).toHaveBeenCalledWith({
      where: { id: "target-principal", status: "ACTIVE" },
      data: { status: "DISABLED" },
    });
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorPrincipalId: "security-principal",
        action: "platform.principals.status_changed",
        targetId: "target-principal",
        metadata: expect.objectContaining({ from: "ACTIVE", to: "DISABLED" }),
      }),
      select: { id: true },
    });
  });

  it("rejects stale principal status and does not write an audit for a failed update", async () => {
    mocks.tx.platformPrincipal.updateMany.mockResolvedValue({ count: 0 });

    await expect(setPlatformPrincipalStatus({
      principalId: "target-principal",
      status: "DISABLED",
      reason: "Access review completed",
    })).rejects.toBeInstanceOf(PlatformPrincipalConflictError);
    expect(mocks.tx.platformAuditLog.create).not.toHaveBeenCalled();
  });

  it("does not permit a tenant Owner to be activated as a platform principal", async () => {
    mocks.tx.platformPrincipal.findUnique.mockResolvedValue({
      id: "target-principal",
      status: "DISABLED",
      user: { memberships: [{ id: "owner-membership" }] },
    });

    await expect(setPlatformPrincipalStatus({
      principalId: "target-principal",
      status: "ACTIVE",
      reason: "Access review completed",
    })).rejects.toBeInstanceOf(PlatformForbiddenError);
    expect(mocks.tx.platformPrincipal.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.platformAuditLog.create).not.toHaveBeenCalled();
  });

  it("can change only directory-view grants and audits the operation", async () => {
    await setPlatformOrganizationDirectoryGrant({
      principalId: "target-principal",
      enabled: true,
      reason: "Approved support access",
    });

    expect(mocks.tx.platformGrant.create).toHaveBeenCalledWith({
      data: {
        principalId: "target-principal",
        capability: "platform.organizations.view",
        grantedByPrincipalId: "security-principal",
      },
      select: { id: true },
    });
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "platform.grants.directory_view_granted",
        targetId: "grant-1",
      }),
      select: { id: true },
    });
  });
});
