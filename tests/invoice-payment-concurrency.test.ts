import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordInvoicePaymentAction,
  refundInvoicePaymentAction,
  voidInvoiceAction,
} from "@/lib/invoicing/invoice-actions";

const mocks = vi.hoisted(() => {
  const tx = {
    invoice: { updateMany: vi.fn() },
    payment: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };

  return {
    tx,
    invoiceFindUnique: vi.fn(),
    transaction: vi.fn(),
    getCurrentUser: vi.fn(),
    loadTenantContext: vi.fn(),
    requirePermission: vi.fn(),
    assertBranchAccess: vi.fn(),
    loadAccessibleCustomerInOrganization: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    invoice: { findUnique: mocks.invoiceFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac/guard", () => ({
  loadTenantContext: mocks.loadTenantContext,
  requirePermission: mocks.requirePermission,
  assertBranchAccess: mocks.assertBranchAccess,
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("@/lib/customer/access", () => ({
  loadAccessibleCustomerInOrganization: mocks.loadAccessibleCustomerInOrganization,
}));

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "invoice-a",
    organizationId: "org-a",
    status: "ISSUED",
    amountPaid: "0",
    total: "100",
    ...overrides,
  };
}

describe("invoice payment concurrency guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
    mocks.loadTenantContext.mockResolvedValue({ organizationId: "org-a" });
    mocks.invoiceFindUnique.mockResolvedValue(invoice());
    mocks.tx.invoice.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.payment.create.mockResolvedValue({});
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      Promise.resolve(callback(mocks.tx)),
    );
  });

  it("atomically updates the cached balance with its payment and audit record", async () => {
    await expect(
      recordInvoicePaymentAction("invoice-a", { amount: 60, method: "CASH" }),
    ).resolves.toEqual({ ok: true, data: undefined });

    expect(mocks.tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "invoice-a", organizationId: "org-a", amountPaid: "0", status: { not: "VOID" } },
      data: expect.objectContaining({ paymentStatus: "PARTIALLY_PAID" }),
    });
    expect(mocks.tx.invoice.updateMany.mock.calls[0]?.[0].data.amountPaid.toString()).toBe("60");
    expect(mocks.tx.payment.create).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rejects a receipt if another request changed the balance first", async () => {
    mocks.tx.invoice.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      recordInvoicePaymentAction("invoice-a", { amount: 60, method: "CASH" }),
    ).resolves.toMatchObject({ ok: false, error: "The invoice balance changed. Refresh and try again." });

    expect(mocks.tx.payment.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("uses the same atomic balance guard for refunds", async () => {
    mocks.invoiceFindUnique.mockResolvedValue(invoice({ amountPaid: "75" }));

    await expect(
      refundInvoicePaymentAction("invoice-a", { amount: 50, method: "BANK_TRANSFER" }),
    ).resolves.toEqual({ ok: true, data: undefined });

    expect(mocks.tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "invoice-a", organizationId: "org-a", amountPaid: "75", status: { not: "VOID" } },
      data: expect.objectContaining({ paymentStatus: "PARTIALLY_PAID" }),
    });
    expect(mocks.tx.invoice.updateMany.mock.calls[0]?.[0].data.amountPaid.toString()).toBe("25");
    expect(mocks.tx.payment.create.mock.calls[0]?.[0].data.amount.toString()).toBe("-50");
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("does not record a refund or audit when its balance snapshot is stale", async () => {
    mocks.invoiceFindUnique.mockResolvedValue(invoice({ amountPaid: "75" }));
    mocks.tx.invoice.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      refundInvoicePaymentAction("invoice-a", { amount: 50, method: "BANK_TRANSFER" }),
    ).resolves.toMatchObject({ ok: false, error: "The invoice balance changed. Refresh and try again." });

    expect(mocks.tx.payment.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not void an invoice if a payment changed its balance after preflight", async () => {
    mocks.tx.invoice.updateMany.mockResolvedValue({ count: 0 });

    await expect(voidInvoiceAction("invoice-a")).resolves.toMatchObject({
      ok: false,
      error: "The invoice changed. Refresh and try again.",
    });

    expect(mocks.tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "invoice-a", organizationId: "org-a", status: "ISSUED", amountPaid: "0" },
      data: expect.objectContaining({ status: "VOID" }),
    });
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
