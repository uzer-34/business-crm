import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyOtpAction } from "@/lib/auth/actions";
import { acceptEmployeeInvitationAction, inviteEmployeeAction } from "@/lib/employees/employee-actions";
import { createInvitationToken, getInvitationExpiry, hashInvitationToken } from "@/lib/employees/invitation-token";

const mocks = vi.hoisted(() => {
  const txMembership = { findUnique: vi.fn(), updateMany: vi.fn() };
  const txAuditLog = { create: vi.fn() };
  return {
    currentUser: { id: "invited-user", email: "invitee@example.test", phone: null },
    getCurrentUser: vi.fn(),
    verifyOtp: vi.fn(),
    createSession: vi.fn(),
    cookieSet: vi.fn(),
    db: {
      user: { upsert: vi.fn() },
      membership: { findUnique: vi.fn(), updateMany: vi.fn() },
      role: { findFirst: vi.fn() },
      session: { create: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    tx: { membership: txMembership, auditLog: txAuditLog },
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/otp", () => ({
  verifyOtp: mocks.verifyOtp,
  createSession: mocks.createSession,
  requestOtp: vi.fn(),
  revokeSession: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: (key: string) => (key === "user-agent" ? "test-agent" : null) })),
  cookies: vi.fn(async () => ({ set: mocks.cookieSet, get: vi.fn(), delete: vi.fn() })),
}));

function permission(key: string) {
  return { permission: { key } };
}

function invitationMembership() {
  return {
    id: "pending-membership",
    organizationId: "org-1",
    userId: mocks.currentUser.id,
    status: "INVITED",
    invitationTokenHash: null,
    invitationExpiresAt: new Date(Date.now() + 60_000),
    invitedByMembershipId: "inviter-membership",
    allBranches: false,
    branches: [],
    role: { organizationId: "org-1", permissions: [permission("customers.view")] },
    invitedByMembership: {
      id: "inviter-membership",
      organizationId: "org-1",
      status: "ACTIVE",
      allBranches: true,
      branches: [],
      role: { permissions: [permission("employees.manage"), permission("customers.view")] },
    },
  };
}

describe("employee invitation security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(mocks.currentUser);
    mocks.verifyOtp.mockResolvedValue({ ok: true });
    mocks.createSession.mockResolvedValue({ token: "session-token", expiresAt: new Date(Date.now() + 60_000) });
    mocks.db.user.upsert.mockResolvedValue(mocks.currentUser);
    mocks.db.membership.findUnique.mockResolvedValue({
      id: "owner-membership",
      organizationId: "org-1",
      roleId: "owner-role",
      role: { key: "owner", permissions: [permission("employees.manage")] },
      status: "ACTIVE",
      allBranches: true,
    });
    mocks.db.auditLog.create.mockResolvedValue({});
    mocks.tx.membership.findUnique.mockResolvedValue(invitationMembership());
    mocks.tx.membership.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("creates random, hash-only invitation credentials", () => {
    const first = createInvitationToken();
    const second = createInvitationToken();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toBe(hashInvitationToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
    expect(second.token).not.toBe(first.token);
  });

  it("fails closed when invitation expiry is missing or invalid", () => {
    vi.stubEnv("EMPLOYEE_INVITATION_TTL_HOURS", "");
    expect(getInvitationExpiry()).toBeNull();
    vi.stubEnv("EMPLOYEE_INVITATION_TTL_HOURS", "721");
    expect(getInvitationExpiry()).toBeNull();
    vi.stubEnv("EMPLOYEE_INVITATION_TTL_HOURS", "24.5");
    expect(getInvitationExpiry()).toBeNull();
  });

  it("computes expiry from an explicit deployment setting", () => {
    vi.stubEnv("EMPLOYEE_INVITATION_TTL_HOURS", "24");
    const start = new Date("2026-01-01T00:00:00.000Z");

    expect(getInvitationExpiry(start)?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("does not create an invitation without a configured expiry", async () => {
    vi.stubEnv("EMPLOYEE_INVITATION_TTL_HOURS", "");

    const result = await inviteEmployeeAction("org-1", {
      identifier: { channel: "EMAIL", target: "invitee@example.test" },
      roleKey: "employee",
      allBranches: false,
      branchIds: [],
    });

    expect(result.ok).toBe(false);
    expect(mocks.db.user.upsert).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("does not activate pending memberships during OTP login", async () => {
    const result = await verifyOtpAction({ channel: "EMAIL", target: "invitee@example.test", code: "123456" });

    expect(result.ok).toBe(true);
    expect(mocks.db.membership.updateMany).not.toHaveBeenCalled();
  });

  it("accepts an invite for its authenticated account with one atomic consumption", async () => {
    const token = "a".repeat(43);

    const result = await acceptEmployeeInvitationAction(token);

    expect(result.ok).toBe(true);
    expect(mocks.tx.membership.findUnique).toHaveBeenCalledWith({
      where: { invitationTokenHash: hashInvitationToken(token) },
      include: expect.any(Object),
    });
    expect(mocks.tx.membership.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "pending-membership",
        userId: mocks.currentUser.id,
        status: "INVITED",
        invitationTokenHash: hashInvitationToken(token),
      }),
      data: expect.objectContaining({
        status: "ACTIVE",
        invitationTokenHash: null,
        invitationExpiresAt: null,
        invitedByMembershipId: null,
      }),
    });
    expect(mocks.db.$transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: "Serializable" });
  });

  it("rejects acceptance if the inviter no longer has employees.manage", async () => {
    const membership = invitationMembership();
    membership.invitedByMembership.role.permissions = [];
    mocks.tx.membership.findUnique.mockResolvedValue(membership);

    const result = await acceptEmployeeInvitationAction("a".repeat(43));

    expect(result.ok).toBe(false);
    expect(mocks.tx.membership.updateMany).not.toHaveBeenCalled();
  });

  it("rejects acceptance when the invited role belongs to another organization", async () => {
    const membership = invitationMembership();
    membership.role.organizationId = "org-2";
    mocks.tx.membership.findUnique.mockResolvedValue(membership);

    const result = await acceptEmployeeInvitationAction("a".repeat(43));

    expect(result.ok).toBe(false);
    expect(mocks.tx.membership.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a concurrent second use when the compare-and-set loses", async () => {
    mocks.tx.membership.updateMany.mockResolvedValue({ count: 0 });

    const result = await acceptEmployeeInvitationAction("a".repeat(43));

    expect(result.ok).toBe(false);
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
