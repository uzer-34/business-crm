import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/rbac/guard";
import { getAccessibleCustomerWhere, listAccessibleCustomerOptions } from "@/lib/customer/access";
import { globalSearch } from "@/lib/search/global-search";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  loadTenantContext: vi.fn(),
  getAccessibleBranchIds: vi.fn(),
  customerFindMany: vi.fn(),
  productFindMany: vi.fn(),
  orderFindMany: vi.fn(),
  invoiceFindMany: vi.fn(),
  vehicleFindMany: vi.fn(),
  supplierFindMany: vi.fn(),
  taskFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/organization/active-org", () => ({ getActiveOrganizationId: mocks.getActiveOrganizationId }));
vi.mock("@/lib/rbac/guard", () => ({
  loadTenantContext: mocks.loadTenantContext,
  getAccessibleBranchIds: mocks.getAccessibleBranchIds,
}));
vi.mock("@/lib/db", () => ({
  db: {
    customer: { findMany: mocks.customerFindMany },
    product: { findMany: mocks.productFindMany },
    order: { findMany: mocks.orderFindMany },
    invoice: { findMany: mocks.invoiceFindMany },
    vehicle: { findMany: mocks.vehicleFindMany },
    supplier: { findMany: mocks.supplierFindMany },
    task: { findMany: mocks.taskFindMany },
  },
}));

const context = {
  userId: "user-a",
  membershipId: "membership-a",
  organizationId: "org-a",
  roleId: "role-a",
  roleKey: "employee",
  allBranches: false,
  permissions: new Set([
    "customers.view",
    "sales.view",
    "invoices.view",
    "vehicles.view",
    "tasks.view",
  ]),
} as TenantContext;

describe("Customer visibility in search and selector surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
    mocks.getActiveOrganizationId.mockResolvedValue("org-a");
    mocks.loadTenantContext.mockResolvedValue(context);
    mocks.getAccessibleBranchIds.mockResolvedValue(["branch-a"]);
    mocks.customerFindMany.mockResolvedValue([{ id: "customer-visible", name: "Visible Customer" }]);
    mocks.productFindMany.mockResolvedValue([]);
    mocks.orderFindMany.mockResolvedValue([{ id: "order-a", orderNumber: "SO-ACME", customerId: "customer-hidden" }]);
    mocks.invoiceFindMany.mockResolvedValue([{ id: "invoice-a", invoiceNumber: "INV-ACME", customerId: "customer-hidden" }]);
    mocks.vehicleFindMany.mockResolvedValue([]);
    mocks.supplierFindMany.mockResolvedValue([]);
    mocks.taskFindMany.mockResolvedValue([{ id: "task-a", title: "Follow up", status: "OPEN", customerId: "customer-visible" }]);
  });

  it("keeps branchless Customers and allowed-branch Customers in selector results", async () => {
    const options = await listAccessibleCustomerOptions(context);

    expect(options).toEqual([{ id: "customer-visible", name: "Visible Customer" }]);
    expect(mocks.customerFindMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { organizationId: "org-a" },
          { OR: [{ branchId: null }, { branchId: { in: ["branch-a"] } }] },
          { archivedAt: null },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("does not allow a foreign organization or inaccessible branch into the Customer scope", async () => {
    await expect(getAccessibleCustomerWhere(context)).resolves.toEqual({
      AND: [
        { organizationId: "org-a" },
        { OR: [{ branchId: null }, { branchId: { in: ["branch-a"] } }] },
      ],
    });
  });

  it("scopes Customer, Order, Invoice, Vehicle, and linked Task global-search queries", async () => {
    const results = await globalSearch("acme");

    expect(mocks.customerFindMany.mock.calls[0]?.[0].where).toMatchObject({
      AND: [
        {
          AND: [
            { organizationId: "org-a" },
            { OR: [{ branchId: null }, { branchId: { in: ["branch-a"] } }] },
          ],
        },
        { archivedAt: null },
        {
          OR: [
            { name: { contains: "acme", mode: "insensitive" } },
            { email: { contains: "acme", mode: "insensitive" } },
            { phone: { contains: "acme", mode: "insensitive" } },
            { companyName: { contains: "acme", mode: "insensitive" } },
          ],
        },
      ],
    });
    expect(mocks.orderFindMany.mock.calls[0]?.[0].where.OR[1].customer.is).toMatchObject({
      AND: [
        {
          AND: [
            { organizationId: "org-a" },
            { OR: [{ branchId: null }, { branchId: { in: ["branch-a"] } }] },
          ],
        },
        { name: { contains: "acme", mode: "insensitive" } },
      ],
    });
    expect(mocks.invoiceFindMany.mock.calls[0]?.[0].where.OR[1].customer.is.AND[0])
      .toMatchObject({ AND: [{ organizationId: "org-a" }, { OR: [{ branchId: null }, { branchId: { in: ["branch-a"] } }] }] });
    expect(mocks.vehicleFindMany.mock.calls[0]?.[0].where.AND[2].customer.is)
      .toMatchObject({ AND: [{ organizationId: "org-a" }, { OR: [{ branchId: null }, { branchId: { in: ["branch-a"] } }] }] });
    expect(mocks.taskFindMany.mock.calls[0]?.[0].where.OR[1].customer.is)
      .toMatchObject({ AND: [{ organizationId: "org-a" }, { OR: [{ branchId: null }, { branchId: { in: ["branch-a"] } }] }] });

    expect(results.find((result) => result.type === "customer")?.title).toBe("Visible Customer");
    expect(results.find((result) => result.type === "order")?.subtitle).toBeNull();
    expect(results.find((result) => result.type === "invoice")?.subtitle).toBeNull();
    expect(results.find((result) => result.type === "task")?.href).toBe("/customers/customer-visible?tab=tasks");
  });
});
