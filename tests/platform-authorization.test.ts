import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPlatformContext,
  PlatformForbiddenError,
  requirePlatformCapability,
  type PlatformContext,
} from "@/lib/platform/authorization";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { platformPrincipal: { findUnique: mocks.findUnique } },
}));

describe("platform authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PLATFORM_CONTROL_PLANE_ENABLED", "true");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("stays disabled unless the platform release gate is explicitly enabled", async () => {
    vi.stubEnv("PLATFORM_CONTROL_PLANE_ENABLED", "false");

    await expect(loadPlatformContext("user-1")).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed when the platform release gate is missing", async () => {
    vi.stubEnv("PLATFORM_CONTROL_PLANE_ENABLED", "");

    await expect(loadPlatformContext("user-1")).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("denies a disabled platform principal even when grants remain", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "platform-principal-disabled",
      status: "DISABLED",
      grants: [
        { capability: "platform.organizations.view" },
        { capability: "platform.security.manage" },
      ],
      user: { memberships: [] },
    });

    await expect(loadPlatformContext("user-1")).resolves.toBeNull();
  });

  it("does not authorize a tenant Owner even when a platform grant row exists", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "platform-principal-1",
      status: "ACTIVE",
      grants: [
        { capability: "platform.organizations.view" },
        { capability: "platform.security.manage" },
      ],
      user: { memberships: [{ id: "owner-membership" }] },
    });

    await expect(loadPlatformContext("user-1")).resolves.toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          user: expect.objectContaining({
            select: expect.objectContaining({
              memberships: expect.objectContaining({
                where: { status: "ACTIVE", role: { is: { key: "owner" } } },
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("loads only catalog capabilities from an active non-Owner platform principal", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "platform-principal-2",
      status: "ACTIVE",
      grants: [
        { capability: "platform.organizations.view" },
        { capability: "platform.licenses.manage" },
      ],
      user: { memberships: [] },
    });

    const context = await loadPlatformContext("user-2");

    expect(context?.principalId).toBe("platform-principal-2");
    expect([...context!.capabilities]).toEqual(["platform.organizations.view"]);
  });

  it.each(["manager", "employee"])(
    "does not derive platform permissions from a tenant %s role",
    async () => {
      mocks.findUnique.mockResolvedValue({
        id: "platform-principal-no-grants",
        status: "ACTIVE",
        grants: [],
        user: { memberships: [] },
      });

      const context = await loadPlatformContext("user-tenant-member");

      expect(context?.capabilities.size).toBe(0);
      expect(() => requirePlatformCapability(context, "platform.organizations.view")).toThrow(
        PlatformForbiddenError,
      );
    },
  );

  it("rejects forged capability keys even if a caller supplies one in a context", () => {
    const forgedContext = {
      principalId: "platform-principal-1",
      userId: "user-1",
      capabilities: new Set(["platform.licenses.manage"]),
    } as unknown as PlatformContext;

    expect(() =>
      requirePlatformCapability(
        forgedContext,
        "platform.licenses.manage" as "platform.organizations.view",
      ),
    ).toThrow(PlatformForbiddenError);
  });
});
