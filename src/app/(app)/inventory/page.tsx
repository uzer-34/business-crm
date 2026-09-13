import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { BranchSwitcher } from "./branch-switcher";
import { RecordMovementForm } from "./record-movement-form";
import { TransferForm } from "./transfer-form";

async function getAccessibleBranches(organizationId: string, membershipId: string, allBranches: boolean) {
  if (allBranches) {
    return db.branch.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  const links = await db.membershipBranch.findMany({
    where: { membershipId },
    include: { branch: true },
  });
  return links.map((l) => l.branch).filter((b) => !b.archivedAt);
}

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return null;

  const params = await searchParams;
  const requestedBranchId = typeof params?.branchId === "string" ? params.branchId : undefined;

  const accessibleBranches = await getAccessibleBranches(
    membership.organizationId,
    membership.id,
    membership.allBranches,
  );

  if (accessibleBranches.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          You don&apos;t have access to any branch yet. Ask an owner or manager to assign you one.
        </CardContent>
      </Card>
    );
  }

  // Never trust a client-supplied branchId beyond checking it's one the
  // caller actually has access to — otherwise this would leak another
  // branch's stock levels to whoever edits the URL.
  const selectedBranch =
    accessibleBranches.find((b) => b.id === requestedBranchId) ?? accessibleBranches[0];

  const [stockLevels, recentMovements, allProducts] = await Promise.all([
    db.stockLevel.findMany({
      where: { branchId: selectedBranch.id, quantity: { not: 0 } },
      include: { product: true, variant: true },
      orderBy: { product: { name: "asc" } },
    }),
    db.inventoryMovement.findMany({
      where: { organizationId: membership.organizationId, branchId: selectedBranch.id },
      include: { product: true, variant: true, actor: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.product.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      include: { variants: { where: { archivedAt: null } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const canAdjust = ctx.permissions.has("inventory.adjust");
  const canTransfer = ctx.permissions.has("inventory.transfer") && accessibleBranches.length > 1;

  // Client components only need id/name/sku/variants — Product/ProductVariant
  // also carry Decimal fields (costPrice, sellingPrice, taxRatePercent),
  // which are Decimal.js instances, not plain objects, and can't cross the
  // server->client boundary. Strip down to a plain-serializable shape.
  const productOptions = allProducts.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku })),
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">Stock at {selectedBranch.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <BranchSwitcher
            branches={accessibleBranches.map((b) => ({ id: b.id, name: b.name }))}
            selectedBranchId={selectedBranch.id}
          />
          {canTransfer && (
            <TransferForm
              organizationId={membership.organizationId}
              fromBranchId={selectedBranch.id}
              branches={accessibleBranches.map((b) => ({ id: b.id, name: b.name }))}
              products={productOptions}
            />
          )}
          {canAdjust && (
            <RecordMovementForm
              organizationId={membership.organizationId}
              branchId={selectedBranch.id}
              products={productOptions}
            />
          )}
        </div>
      </div>

      {allProducts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No products yet — add one from the Products page before tracking stock.
          </CardContent>
        </Card>
      ) : stockLevels.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No stock recorded at this branch yet.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-2">
          {stockLevels.map((level) => {
            const lowStock =
              level.product.reorderPoint != null && level.quantity <= level.product.reorderPoint;
            return (
              <Card key={level.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {level.product.name}
                      {level.variant && <span className="text-muted-foreground"> · {level.variant.sku}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">SKU {level.variant?.sku ?? level.product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium tabular-nums ${lowStock ? "text-danger" : ""}`}>
                      {level.quantity} {level.product.unit}
                    </p>
                    {lowStock && <p className="text-xs text-danger">Low stock</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </RevealOnScroll>
      )}

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Recent movements</h2>
          {recentMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentMovements.map((movement) => (
                <div key={movement.id} className="flex items-center justify-between text-sm">
                  <span>
                    {movement.product.name}
                    {movement.variant && ` · ${movement.variant.sku}`}
                    <span className="text-muted-foreground"> — {movement.type.replace("_", " ").toLowerCase()}</span>
                  </span>
                  <span className={movement.quantityDelta < 0 ? "text-danger" : "text-success"}>
                    {movement.quantityDelta > 0 ? "+" : ""}
                    {movement.quantityDelta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
