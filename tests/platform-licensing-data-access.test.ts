import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPlatformPurchaseDirectory } from "@/lib/platform/licensing/data-access";
import { PlatformForbiddenError } from "@/lib/platform/authorization";

const state = vi.hoisted(() => ({
  capabilities: ["platform.licensing.view"] as string[],
  hasActivePlatformContext: true,
}));
const mocks = vi.hoisted(() => {
  const tx = {
    platformPurchase: { count: vi.fn(), findMany: vi.fn() },
    platformEntitlement: { update: vi.fn(), updateMany: vi.fn() },
    platformPayment: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    platformAuditLog: { create: vi.fn() },
  };
  return { tx, transaction: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "platform-user" }),
}));
vi.mock("@/lib/platform/authorization", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform/authorization")>("@/lib/platform/authorization");
  return {
    ...actual,
    loadPlatformContext: vi.fn().mockImplementation(async () => state.hasActivePlatformContext ? ({
      principalId: "platform-principal",
      userId: "platform-user",
      capabilities: new Set(state.capabilities),
    }) : null),
  };
});

describe("platform licensing data access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.capabilities = ["platform.licensing.view"];
    state.hasActivePlatformContext = true;
    mocks.tx.platformPurchase.count.mockResolvedValue(1);
    mocks.tx.platformPurchase.findMany.mockResolvedValue([{
      id: "purchase-1",
      organizationId: "org-1",
      organization: {
        id: "org-1",
        name: "Acme Works",
        industryKey: "services",
        countryCode: "IN",
      },
      kind: "LIFETIME",
      contractAmount: new Prisma.Decimal("100.00"),
      currencyCode: "INR",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      entitlement: {
        id: "entitlement-1",
        state: "PENDING",
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
      schedule: [{
        id: "schedule-1",
        kind: "LIFETIME_PAYMENT",
        sequence: 1,
        dueAt: new Date("2026-10-02T00:00:00.000Z"),
        amount: new Prisma.Decimal("100.00"),
        currencyCode: "INR",
        status: "OPEN",
        payments: [{
          id: "payment-1",
          direction: "RECEIPT",
          status: "PENDING",
          amount: new Prisma.Decimal("100.00"),
          currencyCode: "INR",
          createdAt: new Date("2026-10-01T12:00:00.000Z"),
        }],
      }],
    }]);
    mocks.tx.platformAuditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    );
  });

  it("returns only platform licensing records and audits the cross-tenant metadata read", async () => {
    const result = await getPlatformPurchaseDirectory({ organizationId: "org-1", page: 1 });

    expect(result.purchases[0]).toMatchObject({
      organizationId: "org-1",
      organization: { name: "Acme Works", countryCode: "IN" },
      contractAmount: "100.00",
      entitlement: { state: "PENDING" },
      billing: { totalOutstanding: "100.00", amountDueNow: "100.00" },
      payments: [{ status: "PENDING", amount: "100.00" }],
    });
    const findManyArgs = mocks.tx.platformPurchase.findMany.mock.calls[0][0];
    expect(findManyArgs.select).toHaveProperty("entitlement");
    expect(findManyArgs.select).toHaveProperty("schedule");
    expect(findManyArgs.select.organization.select).toEqual({
      id: true,
      name: true,
      industryKey: true,
      countryCode: true,
    });
    expect(Object.keys(findManyArgs.select)).toEqual([
      "id", "organizationId", "organization", "kind", "contractAmount", "currencyCode", "createdAt", "entitlement", "schedule",
    ]);
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorPrincipalId: "platform-principal",
        action: "platform.licensing.purchase_directory_viewed",
        targetId: "org-1",
      }),
      select: { id: true },
    });
  });

  it("denies unauthorized licensing metadata reads before querying purchase tables", async () => {
    state.capabilities = ["platform.organizations.view"];

    await expect(getPlatformPurchaseDirectory({ organizationId: "org-1" })).rejects.toBeInstanceOf(
      PlatformForbiddenError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies reads for a disabled platform principal or a closed feature gate before database access", async () => {
    state.hasActivePlatformContext = false;

    await expect(getPlatformPurchaseDirectory({ query: "Acme" })).rejects.toBeInstanceOf(
      PlatformForbiddenError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("applies validated organization-name, type, entitlement-state, and pagination filters", async () => {
    mocks.tx.platformPurchase.count.mockResolvedValue(31);

    const result = await getPlatformPurchaseDirectory({
      query: " Acme Works ",
      kind: "INSTALLMENT",
      entitlementState: "PENDING",
      page: "2",
    });

    const expectedWhere = {
      kind: "INSTALLMENT",
      entitlement: { is: { state: "PENDING" } },
      organization: { is: { name: { contains: "Acme Works", mode: "insensitive" } } },
    };
    expect(mocks.tx.platformPurchase.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(mocks.tx.platformPurchase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedWhere,
      skip: 25,
      take: 25,
    }));
    expect(result).toMatchObject({
      query: "Acme Works",
      kind: "INSTALLMENT",
      entitlementState: "PENDING",
      page: 2,
      pageCount: 2,
    });
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          page: 2,
          searchApplied: true,
          kind: "INSTALLMENT",
          entitlementState: "PENDING",
        }),
      }),
    }));
  });

  it("supports a global purchase directory without reading tenant business records", async () => {
    const result = await getPlatformPurchaseDirectory({});

    expect(result.purchases[0].organization).toMatchObject({ name: "Acme Works", countryCode: "IN" });
    expect(mocks.tx.platformPurchase.findMany.mock.calls[0][0].where).toEqual({});
    expect(mocks.tx.platformPurchase.findMany.mock.calls[0][0].select).not.toHaveProperty("organization.memberships");
    expect(mocks.tx.platformPurchase.findMany.mock.calls[0][0].select).not.toHaveProperty("organization.customers");
    expect(mocks.tx.platformPayment.create).not.toHaveBeenCalled();
    expect(mocks.tx.platformPayment.update).not.toHaveBeenCalled();
    expect(mocks.tx.platformPayment.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.platformEntitlement.update).not.toHaveBeenCalled();
    expect(mocks.tx.platformEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it("treats empty native-form filters as all purchase types and entitlement states", async () => {
    const result = await getPlatformPurchaseDirectory({ query: "Acme", kind: "", entitlementState: "" });

    expect(mocks.tx.platformPurchase.findMany.mock.calls[0][0].where).toEqual({
      organization: { is: { name: { contains: "Acme", mode: "insensitive" } } },
    });
    expect(result).toMatchObject({ kind: "", entitlementState: "", query: "Acme" });
  });

  it.each([
    [{ page: "0" }],
    [{ page: "1.5" }],
    [{ page: ["2"] }],
    [{ query: "x".repeat(81) }],
    [{ kind: "UNKNOWN" }],
    [{ entitlementState: "EXPIRED" }],
  ])("rejects invalid directory filters before querying the database", async (input) => {
    await expect(getPlatformPurchaseDirectory(input)).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not return records when the matching audit insert fails", async () => {
    mocks.tx.platformAuditLog.create.mockRejectedValue(new Error("audit unavailable"));

    await expect(getPlatformPurchaseDirectory({ organizationId: "org-1" })).rejects.toThrow(
      "audit unavailable",
    );
  });
});
