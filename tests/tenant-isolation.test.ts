import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit/record";
import { getCustomerList, parseCustomerListQuery, buildCustomerWhere } from "@/lib/customer/customer-list";
import { getProductList, parseProductListQuery } from "@/lib/catalog/product-list";
import { getAuditList, parseAuditListQuery } from "@/lib/audit/audit-list";
import { loadTenantContext } from "@/lib/rbac/guard";

/*
 * Integration tests against the real database.
 *
 * Two complete organizations are created with deliberately overlapping data
 * (same customer names, same SKUs) so that a query missing its organizationId
 * scope fails loudly instead of coincidentally passing.
 */

const RUN_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Fixture = {
  organizationId: string;
  userId: string;
  membershipId: string;
  branchId: string;
};

async function createOrganizationFixture(label: string): Promise<Fixture> {
  const user = await db.user.create({
    data: { email: `${RUN_ID}-${label}@example.test`, name: `${label} Owner` },
  });

  const organization = await db.organization.create({
    data: {
      name: `${RUN_ID} ${label}`,
      countryCode: "US",
      currencyCode: "USD",
      timezone: "UTC",
      locale: "en-US",
      industryKey: "generic",
    },
  });

  const branch = await db.branch.create({
    data: { organizationId: organization.id, name: "Main", countryCode: "US", isDefault: true },
  });

  // Mirrors the real owner role: every permission in the catalog.
  const permissions = await db.permission.findMany();
  const role = await db.role.create({
    data: {
      organizationId: organization.id,
      key: "owner",
      name: "Owner",
      isSystem: true,
      permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
    },
  });

  const membership = await db.membership.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      roleId: role.id,
      status: "ACTIVE",
      allBranches: true,
    },
  });

  return { organizationId: organization.id, userId: user.id, membershipId: membership.id, branchId: branch.id };
}

let orgA: Fixture;
let orgB: Fixture;

beforeAll(async () => {
  orgA = await createOrganizationFixture("alpha");
  orgB = await createOrganizationFixture("beta");

  // Identical names and SKUs on both sides — the trap for an unscoped query.
  for (const [fixture, status] of [
    [orgA, "ACTIVE"],
    [orgB, "LEAD"],
  ] as const) {
    await db.customer.create({
      data: {
        organizationId: fixture.organizationId,
        name: "Shared Name Ltd",
        status,
        type: "BUSINESS",
        createdByUserId: fixture.userId,
      },
    });
    await db.product.create({
      data: {
        organizationId: fixture.organizationId,
        name: "Shared Product",
        sku: `${RUN_ID}-SKU`,
        costPrice: "10.00",
        sellingPrice: "20.00",
        createdByUserId: fixture.userId,
      },
    });
    await recordAudit(db, {
      organizationId: fixture.organizationId,
      actorUserId: fixture.userId,
      action: "customer.created",
      targetType: "Customer",
      targetId: "fixture",
    });
  }
}, 60_000);

afterAll(async () => {
  // Children first: several relations are Restrict, not Cascade.
  for (const fixture of [orgA, orgB].filter(Boolean)) {
    await db.auditLog.deleteMany({ where: { organizationId: fixture.organizationId } });
    await db.product.deleteMany({ where: { organizationId: fixture.organizationId } });
    await db.customer.deleteMany({ where: { organizationId: fixture.organizationId } });
    await db.organization.delete({ where: { id: fixture.organizationId } });
    await db.user.delete({ where: { id: fixture.userId } });
  }
  await db.$disconnect();
}, 60_000);

describe("tenant isolation", () => {
  it("returns only the caller's customers even when names collide", async () => {
    const query = parseCustomerListQuery({});
    const [resultA, resultB] = await Promise.all([
      getCustomerList(orgA.organizationId, query),
      getCustomerList(orgB.organizationId, query),
    ]);

    expect(resultA.total).toBe(1);
    expect(resultB.total).toBe(1);
    expect(resultA.rows[0].status).toBe("ACTIVE");
    expect(resultB.rows[0].status).toBe("LEAD");
  });

  it("returns only the caller's products even when SKUs collide", async () => {
    const query = parseProductListQuery({ q: RUN_ID });
    const resultA = await getProductList(orgA.organizationId, query);

    expect(resultA.total).toBe(1);
    expect(resultA.rows.every((row) => row.sku === `${RUN_ID}-SKU`)).toBe(true);
  });

  it("scopes the audit log to one organization", async () => {
    const query = parseAuditListQuery({});
    const [resultA, resultB] = await Promise.all([
      getAuditList(orgA.organizationId, query),
      getAuditList(orgB.organizationId, query),
    ]);

    expect(resultA.total).toBe(1);
    expect(resultB.total).toBe(1);
  });

  it("always pins organizationId into the customer filter", () => {
    const where = buildCustomerWhere(orgA.organizationId, parseCustomerListQuery({ q: "anything" }));

    expect(where.organizationId).toBe(orgA.organizationId);
  });

  it("refuses to load a tenant context for an organization the user does not belong to", async () => {
    const foreign = await loadTenantContext(orgA.userId, orgB.organizationId);

    expect(foreign).toBeNull();
  });

  it("loads a full permission set for the owner of their own organization", async () => {
    const own = await loadTenantContext(orgA.userId, orgA.organizationId);

    expect(own).not.toBeNull();
    expect(own?.organizationId).toBe(orgA.organizationId);
    expect(own?.permissions.has("customers.view")).toBe(true);
  });

  it("refuses a membership that is not ACTIVE", async () => {
    await db.membership.update({ where: { id: orgA.membershipId }, data: { status: "SUSPENDED" } });
    const suspended = await loadTenantContext(orgA.userId, orgA.organizationId);
    await db.membership.update({ where: { id: orgA.membershipId }, data: { status: "ACTIVE" } });

    expect(suspended).toBeNull();
  });
});

describe("audit trail", () => {
  it("records an entry that the viewer can read back", async () => {
    await recordAudit(db, {
      organizationId: orgA.organizationId,
      actorUserId: orgA.userId,
      action: "field.created",
      targetType: "CustomFieldDefinition",
      targetId: "abc",
      metadata: { key: "fabric" },
    });

    const result = await getAuditList(orgA.organizationId, parseAuditListQuery({ action: "field.created" }));

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({ action: "field.created", targetType: "CustomFieldDefinition" });
    expect(result.rows[0].actorName).toBe("alpha Owner");
  });

  it("does not leak another organization's audit entries through a filter", async () => {
    const result = await getAuditList(orgB.organizationId, parseAuditListQuery({ action: "field.created" }));

    expect(result.total).toBe(0);
  });
});

describe("list filtering against real data", () => {
  it("applies a status filter", async () => {
    const matching = await getCustomerList(orgA.organizationId, parseCustomerListQuery({ status: "ACTIVE" }));
    const nonMatching = await getCustomerList(orgA.organizationId, parseCustomerListQuery({ status: "LEAD" }));

    expect(matching.total).toBe(1);
    expect(nonMatching.total).toBe(0);
  });

  it("hides archived records by default and shows them on request", async () => {
    const customer = await db.customer.create({
      data: {
        organizationId: orgA.organizationId,
        name: `${RUN_ID} archived`,
        createdByUserId: orgA.userId,
        archivedAt: new Date(),
      },
    });

    const live = await getCustomerList(orgA.organizationId, parseCustomerListQuery({}));
    const archived = await getCustomerList(orgA.organizationId, parseCustomerListQuery({ archived: "true" }));

    await db.customer.delete({ where: { id: customer.id } });

    expect(live.rows.some((row) => row.id === customer.id)).toBe(false);
    expect(archived.rows.some((row) => row.id === customer.id)).toBe(true);
  });

  it("matches a search against email as well as name", async () => {
    const customer = await db.customer.create({
      data: {
        organizationId: orgA.organizationId,
        name: "Unsearchable",
        email: `${RUN_ID}-findme@example.test`,
        createdByUserId: orgA.userId,
      },
    });

    const result = await getCustomerList(orgA.organizationId, parseCustomerListQuery({ q: `${RUN_ID}-findme` }));

    await db.customer.delete({ where: { id: customer.id } });

    expect(result.total).toBe(1);
    expect(result.rows[0].id).toBe(customer.id);
  });

  it("paginates rather than returning everything", async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        db.customer.create({
          data: {
            organizationId: orgB.organizationId,
            name: `${RUN_ID} page ${index}`,
            createdByUserId: orgB.userId,
          },
        }),
      ),
    );

    const firstPage = await getCustomerList(orgB.organizationId, parseCustomerListQuery({ pageSize: "2" }));
    const secondPage = await getCustomerList(
      orgB.organizationId,
      parseCustomerListQuery({ pageSize: "2", page: "2" }),
    );

    await db.customer.deleteMany({ where: { id: { in: created.map((row) => row.id) } } });

    expect(firstPage.rows).toHaveLength(2);
    expect(firstPage.total).toBe(6);
    expect(firstPage.pageCount).toBe(3);
    expect(secondPage.rows).toHaveLength(2);
    expect(secondPage.rows[0].id).not.toBe(firstPage.rows[0].id);
  });
});
