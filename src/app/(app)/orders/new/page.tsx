import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { tracksVehicles } from "@/lib/industry/registry";
import { NewOrderForm } from "./new-order-form";

async function getAccessibleBranches(organizationId: string, membershipId: string, allBranches: boolean) {
  if (allBranches) {
    return db.branch.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }
  const links = await db.membershipBranch.findMany({ where: { membershipId }, include: { branch: true } });
  return links.map((l) => l.branch).filter((b) => !b.archivedAt);
}

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  const { membership } = await getDefaultMembershipOrRedirect();
  const params = await searchParams;
  const initialCustomerId = typeof params?.customerId === "string" ? params.customerId : undefined;

  const trackVehicles = tracksVehicles(membership.organization.industryKey);

  const [branches, customers, members, products, services, vehicles] = await Promise.all([
    getAccessibleBranches(membership.organizationId, membership.id, membership.allBranches),
    db.customer.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
    }),
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
      ? db.vehicle.findMany({ where: { organizationId: membership.organizationId, archivedAt: null } })
      : Promise.resolve([]),
  ]);

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
        initialCustomerId={initialCustomerId}
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
