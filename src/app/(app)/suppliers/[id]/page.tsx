import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { EditSupplierForm } from "./edit-supplier-form";
import { ArchiveSupplierButton } from "./archive-supplier-button";

const STATUS_LABEL: Record<string, string> = {
  ORDERED: "Ordered",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const supplier = await db.supplier.findUnique({ where: { id }, include: { organization: true } });
  if (!supplier) notFound();

  const ctx = await loadTenantContext(user.id, supplier.organizationId);
  if (!ctx || !ctx.permissions.has("suppliers.view")) notFound();

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { supplierId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-semibold">{supplier.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[supplier.contactName, supplier.email, supplier.phone].filter(Boolean).join(" · ") ||
                "No contact info"}
            </p>
          </div>
          <div className="flex gap-2">
            {ctx.permissions.has("suppliers.edit") && (
              <EditSupplierForm
                supplierId={supplier.id}
                initial={{
                  name: supplier.name,
                  contactName: supplier.contactName,
                  email: supplier.email,
                  phone: supplier.phone,
                }}
              />
            )}
            {ctx.permissions.has("suppliers.archive") && <ArchiveSupplierButton supplierId={supplier.id} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase orders</CardTitle>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase orders with this supplier yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {purchaseOrders.map((po) => (
                <Link key={po.id} href={`/purchase-orders/${po.id}`}>
                  <Card>
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium">{po.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {STATUS_LABEL[po.status]} · {new Date(po.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-sm font-medium tabular-nums">
                        {formatMoney(po.total.toString(), supplier.organization.currencyCode, supplier.organization.locale)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
