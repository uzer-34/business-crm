import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { FulfillItemForm } from "./fulfill-item-form";
import { OrderPaymentForm } from "./order-payment-form";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PARTIALLY_FULFILLED: "Partially fulfilled",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

const PAYMENT_LABEL: Record<string, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
};

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      branch: true,
      organization: true,
      items: { include: { product: true, variant: true, service: true } },
    },
  });
  if (!order) notFound();

  const ctx = await loadTenantContext(user.id, order.organizationId);
  if (!ctx) notFound();

  const { organization } = order;
  const canFulfill = ctx.permissions.has("sales.fulfill") && order.status !== "CANCELLED";
  const outstanding = new Prisma.Decimal(order.total).minus(order.amountPaid);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="text-xl font-semibold">{order.orderNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {order.customer ? order.customer.name : "Walk-in"} · {order.branch.name}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">
              {formatMoney(order.total.toString(), organization.currencyCode, organization.locale)}
            </p>
            <p className="text-xs text-muted-foreground">
              {STATUS_LABEL[order.status]} · {PAYMENT_LABEL[order.paymentStatus]}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {order.items.map((item) => {
            const remaining = item.quantityOrdered - item.quantityFulfilled;
            const name = item.product ? item.product.name : (item.service?.name ?? "");
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {name}
                    {item.variant && ` · ${item.variant.sku}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantityFulfilled} / {item.quantityOrdered} fulfilled ·{" "}
                    {formatMoney(item.unitPrice.toString(), organization.currencyCode, organization.locale)} each
                  </p>
                </div>
                {canFulfill && remaining > 0 && <FulfillItemForm orderItemId={item.id} remaining={remaining} />}
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
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatMoney(order.subtotal.toString(), organization.currencyCode, organization.locale)}</span>
          </div>
          {order.discountTotal.toString() !== "0" && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span>-{formatMoney(order.discountTotal.toString(), organization.currencyCode, organization.locale)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span>{formatMoney(order.taxTotal.toString(), organization.currencyCode, organization.locale)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Paid</span>
            <span>{formatMoney(order.amountPaid.toString(), organization.currencyCode, organization.locale)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium">
            <span>Outstanding</span>
            <span>{formatMoney(outstanding.toString(), organization.currencyCode, organization.locale)}</span>
          </div>
          {canFulfill && outstanding.greaterThan(0) && (
            <OrderPaymentForm orderId={order.id} outstanding={outstanding.toString()} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
