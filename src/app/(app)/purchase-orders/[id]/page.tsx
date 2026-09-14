import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { ReceiveItemForm } from "./receive-item-form";
import { PaymentForm } from "./payment-form";
import { CancelPurchaseOrderButton } from "./cancel-po-button";

const STATUS_LABEL: Record<string, string> = {
  ORDERED: "Ordered",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

const PAYMENT_LABEL: Record<string, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
};

export default async function PurchaseOrderPage({ params }: PageProps<"/purchase-orders/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      branch: true,
      organization: true,
      items: { include: { product: true, variant: true } },
    },
  });
  if (!purchaseOrder) notFound();

  const ctx = await loadTenantContext(user.id, purchaseOrder.organizationId);
  if (!ctx) notFound();

  const { organization } = purchaseOrder;
  const canReceive = ctx.permissions.has("purchases.receive") && purchaseOrder.status !== "CANCELLED";
  const outstanding = new Prisma.Decimal(purchaseOrder.total).minus(purchaseOrder.amountPaid);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="text-xl font-semibold">{purchaseOrder.orderNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {purchaseOrder.supplier.name} · {purchaseOrder.branch.name}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">
              {formatMoney(purchaseOrder.total.toString(), organization.currencyCode, organization.locale)}
            </p>
            <p className="text-xs text-muted-foreground">
              {STATUS_LABEL[purchaseOrder.status]} · {PAYMENT_LABEL[purchaseOrder.paymentStatus]}
            </p>
            {purchaseOrder.status === "ORDERED" && ctx.permissions.has("purchases.cancel") && (
              <div className="mt-2">
                <CancelPurchaseOrderButton purchaseOrderId={purchaseOrder.id} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {purchaseOrder.items.map((item) => {
            const remaining = item.quantityOrdered - item.quantityReceived;
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {item.product.name}
                    {item.variant && ` · ${item.variant.sku}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantityReceived} / {item.quantityOrdered} received ·{" "}
                    {formatMoney(item.unitCost.toString(), organization.currencyCode, organization.locale)} each
                  </p>
                </div>
                {canReceive && remaining > 0 && (
                  <ReceiveItemForm purchaseOrderItemId={item.id} remaining={remaining} />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Paid</span>
            <span>{formatMoney(purchaseOrder.amountPaid.toString(), organization.currencyCode, organization.locale)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium">
            <span>Outstanding</span>
            <span>{formatMoney(outstanding.toString(), organization.currencyCode, organization.locale)}</span>
          </div>
          {canReceive && outstanding.greaterThan(0) && (
            <PaymentForm purchaseOrderId={purchaseOrder.id} outstanding={outstanding.toString()} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
