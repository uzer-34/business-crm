import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalPlatformProvisioningTarget } from "@/lib/platform/provisioning-target";
import { provisionPlatformPrincipalFromBootstrap } from "@/lib/platform/provisioning";

const token = "A".repeat(43);
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

const mocks = vi.hoisted(() => {
  const tx = {
    platformBootstrapAuthorization: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    platformPrincipal: { create: vi.fn() },
    platformGrant: { create: vi.fn() },
    platformAuditLog: { create: vi.fn() },
  };
  return { tx, transaction: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

describe("local platform principal bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PLATFORM_PROVISIONING_TARGET", "local");
    vi.stubEnv("PLATFORM_CONTROL_PLANE_ENABLED", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://local:local@localhost:5432/business_crm");

    mocks.tx.platformBootstrapAuthorization.findUnique.mockResolvedValue({
      id: "bootstrap-1",
      userId: "user-1",
      tokenHash,
      capability: "platform.organizations.view",
      operatorReference: "SEC-123",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      consumedAt: null,
      revokedAt: null,
    });
    mocks.tx.platformBootstrapAuthorization.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.user.findUnique.mockResolvedValue({ id: "user-1", memberships: [] });
    mocks.tx.platformPrincipal.create.mockResolvedValue({ id: "platform-principal-1" });
    mocks.tx.platformGrant.create.mockResolvedValue({ id: "grant-1" });
    mocks.tx.platformAuditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects remote hosts, production, and enabled feature gates before DB access", () => {
    expect(() => assertLocalPlatformProvisioningTarget({
      NODE_ENV: "development",
      PLATFORM_PROVISIONING_TARGET: "local",
      PLATFORM_CONTROL_PLANE_ENABLED: "false",
      DATABASE_URL: "postgresql://u:p@ep-example.neon.tech/db",
    })).toThrow(/loopback/);
    expect(() => assertLocalPlatformProvisioningTarget({
      NODE_ENV: "production",
      PLATFORM_PROVISIONING_TARGET: "local",
      DATABASE_URL: "postgresql://u:p@localhost/db",
    })).toThrow(/production/);
    expect(() => assertLocalPlatformProvisioningTarget({
      NODE_ENV: "development",
      PLATFORM_PROVISIONING_TARGET: "local",
      PLATFORM_CONTROL_PLANE_ENABLED: "true",
      DATABASE_URL: "postgresql://u:p@localhost/db",
    })).toThrow(/feature gate/);
  });

  it("consumes a bound one-time authorization and audits the narrow grant atomically", async () => {
    const result = await provisionPlatformPrincipalFromBootstrap({
      userId: "user-1",
      token,
      now: new Date("2026-10-11T00:00:00.000Z"),
    });

    expect(result).toEqual({
      principalId: "platform-principal-1",
      capability: "platform.organizations.view",
    });
    expect(mocks.tx.platformBootstrapAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "bootstrap-1", consumedAt: null, revokedAt: null }),
      }),
    );
    expect(mocks.tx.platformPrincipal.create).toHaveBeenCalledWith({
      data: { userId: "user-1", status: "ACTIVE" },
      select: { id: true },
    });
    expect(mocks.tx.platformGrant.create).toHaveBeenCalledWith({
      data: { principalId: "platform-principal-1", capability: "platform.organizations.view" },
      select: { id: true },
    });
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorExternalReference: "SEC-123",
        action: "platform.bootstrap.principal_provisioned",
        targetId: "platform-principal-1",
      }),
      select: { id: true },
    });
  });

  it("refuses an active tenant Owner and does not create principal, grant, or audit", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({
      id: "user-1",
      memberships: [{ id: "owner-membership" }],
    });

    await expect(provisionPlatformPrincipalFromBootstrap({ userId: "user-1", token })).rejects.toThrow(
      /tenant Owner/,
    );
    expect(mocks.tx.platformPrincipal.create).not.toHaveBeenCalled();
    expect(mocks.tx.platformGrant.create).not.toHaveBeenCalled();
    expect(mocks.tx.platformAuditLog.create).not.toHaveBeenCalled();
  });

  it("can create a security administrator only when the operator-bound authorization names that grant", async () => {
    mocks.tx.platformBootstrapAuthorization.findUnique.mockResolvedValue({
      id: "bootstrap-1",
      userId: "user-1",
      tokenHash,
      capability: "platform.security.manage",
      operatorReference: "SEC-124",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      consumedAt: null,
      revokedAt: null,
    });

    await expect(provisionPlatformPrincipalFromBootstrap({ userId: "user-1", token })).resolves.toEqual({
      principalId: "platform-principal-1",
      capability: "platform.security.manage",
    });
    expect(mocks.tx.platformGrant.create).toHaveBeenCalledWith({
      data: { principalId: "platform-principal-1", capability: "platform.security.manage" },
      select: { id: true },
    });
  });

  it.each([
    { name: "expired", change: { expiresAt: new Date("2020-01-01T00:00:00.000Z") } },
    { name: "revoked", change: { revokedAt: new Date("2026-10-10T00:00:00.000Z") } },
    { name: "consumed", change: { consumedAt: new Date("2026-10-10T00:00:00.000Z") } },
    { name: "wrong user", change: { userId: "user-2" } },
    { name: "wrong capability", change: { capability: "platform.licensing.manage" } },
  ])("rejects $name bootstrap authorizations", async ({ change }) => {
    mocks.tx.platformBootstrapAuthorization.findUnique.mockResolvedValue({
      id: "bootstrap-1",
      userId: "user-1",
      tokenHash,
      capability: "platform.organizations.view",
      operatorReference: "SEC-123",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      consumedAt: null,
      revokedAt: null,
      ...change,
    });

    await expect(provisionPlatformPrincipalFromBootstrap({ userId: "user-1", token })).rejects.toThrow(
      /invalid|no longer available/,
    );
    expect(mocks.tx.platformPrincipal.create).not.toHaveBeenCalled();
  });

  it("does not return success when the audit insert fails", async () => {
    mocks.tx.platformAuditLog.create.mockRejectedValue(new Error("audit unavailable"));

    await expect(provisionPlatformPrincipalFromBootstrap({ userId: "user-1", token })).rejects.toThrow(
      "audit unavailable",
    );
  });
});
