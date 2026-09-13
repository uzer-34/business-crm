import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { NewPurchaseOrderForm } from "./new-purchase-order-form";

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

export default async function NewPurchaseOrderPage() {
  const { membership } = await getDefaultMembershipOrRedirect();

  const [branches, suppliers, products] = await Promise.all([
    getAccessibleBranches(membership.organizationId, membership.id, membership.allBranches),
    db.supplier.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      include: { variants: { where: { archivedAt: null } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New purchase order</h1>
        <p className="text-sm text-muted-foreground">Order stock from a supplier.</p>
      </div>

      <NewPurchaseOrderForm
        organizationId={membership.organizationId}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          variants: p.variants.map((v) => ({ id: v.id, sku: v.sku })),
        }))}
      />
    </div>
  );
}
