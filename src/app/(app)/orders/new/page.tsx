import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { tracksVehicles } from "@/lib/industry/registry";
import { getAccessibleBranchIds, loadTenantContext } from "@/lib/rbac/guard";
import { getAccessibleCustomerWhere, listAccessibleCustomerOptions } from "@/lib/customer/access";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return null;

  const params = await searchParams;
  const initialCustomerId = typeof params?.customerId === "string" ? params.customerId : undefined;

  const trackVehicles = tracksVehicles(membership.organization.industryKey);
  const [accessibleBranchIds, customerWhere] = await Promise.all([
    getAccessibleBranchIds(ctx),
    getAccessibleCustomerWhere(ctx, { archivedAt: null }),
  ]);

  const [branches, customers, members, products, services, vehicles] = await Promise.all([
    db.branch.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null, id: { in: accessibleBranchIds } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    listAccessibleCustomerOptions(ctx),
    db.membership.findMany({
      where: { organizationId: membership.organizationId, status: "ACTIVE" },
      include: { user: true },
    }),
    db.product.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      include: { variants: { where: { archivedAt: null } } },
      orderBy: { name: "asc" },
    }),
    db.service.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
    }),
    trackVehicles
      ? db.vehicle.findMany({
          where: {
            organizationId: membership.organizationId,
            archivedAt: null,
            customer: { is: customerWhere },
          },
        })
      : Promise.resolve([]),
  ]);

  const visibleCustomerIds = new Set(customers.map((customer) => customer.id));
  const safeInitialCustomerId = initialCustomerId && visibleCustomerIds.has(initialCustomerId)
    ? initialCustomerId
    : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New order</h1>
        <p className="text-sm text-muted-foreground">Sell products or services to a customer or a walk-in.</p>
      </div>

      <NewOrderForm
        organizationId={membership.organizationId}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        members={members.map((m) => ({ id: m.id, label: m.user.name ?? m.user.email ?? m.user.phone ?? "Member" }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice.toString(),
          taxRatePercent: p.taxRatePercent.toString(),
          variants: p.variants.map((v) => ({ id: v.id, sku: v.sku })),
        }))}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price.toString(),
          taxRatePercent: s.taxRatePercent.toString(),
        }))}
        initialCustomerId={safeInitialCustomerId}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          customerId: v.customerId,
          label: `${v.make} ${v.model}${v.plateNumber ? ` · ${v.plateNumber}` : ""}`,
        }))}
        trackVehicles={trackVehicles}
      />
    </div>
  );
}
