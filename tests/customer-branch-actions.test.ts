import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveCustomerAction,
  assignCustomerAction,
  createCustomerAction,
  editCustomerAction,
} from "@/lib/customer/actions";
import { addNoteAction } from "@/lib/customer/notes-actions";
import { completeTaskAction, createTaskAction } from "@/lib/customer/tasks-actions";
import { createOrderAction } from "@/lib/sales/order-actions";
import { createVehicleAction, editVehicleAction, saveVehicleAttributesAction } from "@/lib/vehicles/vehicle-actions";

const mocks = vi.hoisted(() => {
  const tx = {
    customer: { create: vi.fn(), update: vi.fn() },
    note: { create: vi.fn() },
    task: { create: vi.fn(), update: vi.fn() },
    vehicle: { create: vi.fn(), update: vi.fn() },
  };
  return {
    tx,
    getCurrentUser: vi.fn(),
    findMembership: vi.fn(),
    findCustomer: vi.fn(),
    findTask: vi.fn(),
    findBranch: vi.fn(),
    findMembershipBranch: vi.fn(),
    findProducts: vi.fn(),
    findServices: vi.fn(),
    findVehicle: vi.fn(),
    findVehicleById: vi.fn(),
    transaction: vi.fn(),
    loadAccessibleCustomerContext: vi.fn(),
    loadAccessibleCustomerInOrganization: vi.fn(),
    prepareFieldValues: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    membership: { findUnique: mocks.findMembership },
    branch: { findFirst: mocks.findBranch },
    membershipBranch: { findUnique: mocks.findMembershipBranch },
    customer: { findUnique: mocks.findCustomer },
    task: { findUnique: mocks.findTask },
    product: { findMany: mocks.findProducts },
    service: { findMany: mocks.findServices },
    vehicle: { findFirst: mocks.findVehicle, findUnique: mocks.findVehicleById },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/customer/access", () => ({
  loadAccessibleCustomerContext: mocks.loadAccessibleCustomerContext,
  loadAccessibleCustomerInOrganization: mocks.loadAccessibleCustomerInOrganization,
}));
vi.mock("@/lib/customer/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/metadata/save-values", () => ({ prepareFieldValues: mocks.prepareFieldValues }));
vi.mock("@/lib/notifications/notify", () => ({ notifyMembership: vi.fn() }));
vi.mock("@/lib/inventory/stock", () => ({ applyStockMovement: vi.fn(), getStockQuantity: vi.fn() }));

function activeMembership(permission: string) {
  return {
    id: "membership-a",
    organizationId: "org-a",
    roleId: "role-a",
    status: "ACTIVE",
    allBranches: false,
    role: { organizationId: "org-a", key: "employee", permissions: [{ permission: { key: permission } }] },
  };
}

describe("Customer branch-gated actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
    mocks.loadAccessibleCustomerContext.mockResolvedValue(null);
    mocks.findMembership.mockResolvedValue(null);
    mocks.findCustomer.mockResolvedValue(null);
    mocks.findTask.mockResolvedValue(null);
    mocks.findVehicle.mockResolvedValue(null);
    mocks.findVehicleById.mockResolvedValue(null);
    mocks.findBranch.mockResolvedValue({ id: "branch-a" });
    mocks.findMembershipBranch.mockResolvedValue(null);
    mocks.loadAccessibleCustomerInOrganization.mockResolvedValue(null);
    mocks.prepareFieldValues.mockResolvedValue({ ok: true, apply: vi.fn().mockResolvedValue(undefined) });
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      Promise.resolve(callback(mocks.tx)),
    );
  });

  it("blocks edit, assignment, archive, note, and task writes for an inaccessible Customer", async () => {
    const outcomes = await Promise.all([
      editCustomerAction("customer-foreign", { name: "Changed", type: "INDIVIDUAL" }),
      assignCustomerAction("customer-foreign", "membership-a"),
      archiveCustomerAction("customer-foreign"),
      addNoteAction("customer-foreign", { body: "Private" }),
      createTaskAction("customer-foreign", { title: "Follow up" }),
    ]);

    expect(outcomes.map((outcome) => ("error" in outcome ? outcome.error : null))).toEqual(
      Array(5).fill("Customer not found"),
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.loadAccessibleCustomerContext).toHaveBeenCalledTimes(5);
  });

  it("blocks completion of a task when its linked Customer is outside branch access", async () => {
    mocks.findTask.mockResolvedValue({
      id: "task-a",
      organizationId: "org-a",
      customerId: "customer-foreign",
      assignedToId: "membership-a",
      title: "Follow up",
    });
    mocks.findMembership.mockResolvedValue(activeMembership("customers.edit"));

    await expect(completeTaskAction("task-a")).resolves.toMatchObject({ ok: false, error: "Task not found" });
    expect(mocks.loadAccessibleCustomerContext).toHaveBeenCalledWith("user-a", "customer-foreign");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blocks vehicle creation from a Customer outside branch access", async () => {
    await expect(
      createVehicleAction("customer-foreign", { make: "Honda", model: "City" }),
    ).resolves.toMatchObject({ ok: false, error: "Customer not found" });
    expect(mocks.loadAccessibleCustomerContext).toHaveBeenCalledWith("user-a", "customer-foreign");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blocks order creation from a Customer outside branch access", async () => {
    mocks.findMembership.mockResolvedValue({ ...activeMembership("sales.create"), allBranches: true });

    await expect(
      createOrderAction("org-a", {
        branchId: "branch-a",
        customerId: "customer-foreign",
        items: [{ serviceId: "service-a", quantityOrdered: 1, unitPrice: 10 }],
      }),
    ).resolves.toMatchObject({ ok: false, error: "Customer not found" });
    expect(mocks.loadAccessibleCustomerContext).toHaveBeenCalledWith("user-a", "customer-foreign");
    expect(mocks.findProducts).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blocks an order that submits a Vehicle linked to an inaccessible Customer", async () => {
    mocks.findMembership.mockResolvedValue({ ...activeMembership("sales.create"), allBranches: true });
    mocks.findVehicle.mockResolvedValue({ id: "vehicle-a", customerId: "customer-foreign" });

    await expect(
      createOrderAction("org-a", {
        branchId: "branch-a",
        vehicleId: "vehicle-a",
        items: [{ serviceId: "service-a", quantityOrdered: 1, unitPrice: 10 }],
      }),
    ).resolves.toMatchObject({ ok: false, error: "Vehicle not found" });
    expect(mocks.loadAccessibleCustomerContext).toHaveBeenCalledWith("user-a", "customer-foreign");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blocks Vehicle edits and attribute writes when the linked Customer is inaccessible", async () => {
    mocks.findMembership.mockResolvedValue(activeMembership("vehicles.edit"));
    mocks.findVehicleById.mockResolvedValue({
      id: "vehicle-a",
      organizationId: "org-a",
      customerId: "customer-foreign",
    });

    const outcomes = await Promise.all([
      editVehicleAction("vehicle-a", { make: "Honda", model: "City" }),
      saveVehicleAttributesAction("vehicle-a", { registration_number: "AB123" }),
    ]);

    expect(outcomes).toEqual([
      { ok: false, error: "Vehicle not found" },
      { ok: false, error: "Vehicle not found" },
    ]);
    expect(mocks.loadAccessibleCustomerInOrganization).toHaveBeenCalledTimes(2);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not authorize a Customer create for a foreign organization", async () => {
    const result = await createCustomerAction("org-b", {
      name: "Foreign write",
      type: "INDIVIDUAL",
    });

    expect(result).toMatchObject({ ok: false, error: "Not a member of this organization" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("keeps Customer creation branchless and never persists an unvalidated Branch ID", async () => {
    mocks.findMembership.mockResolvedValue(activeMembership("customers.create"));
    mocks.tx.customer.create.mockResolvedValue({ id: "customer-new" });

    const result = await createCustomerAction("org-a", {
      name: "New customer",
      type: "INDIVIDUAL",
      branchId: "branch-from-another-organization",
    });

    expect(result).toMatchObject({ ok: true, data: { customerId: "customer-new" } });
    const writtenCustomer = mocks.tx.customer.create.mock.calls[0][0].data;
    expect(writtenCustomer).toMatchObject({ organizationId: "org-a" });
    expect(writtenCustomer).not.toHaveProperty("branchId");
  });
});
