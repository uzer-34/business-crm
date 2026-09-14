import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { FulfillItemForm } from "./fulfill-item-form";
import { ReturnItemForm } from "./return-item-form";
import { OrderPaymentForm } from "./order-payment-form";
import { GenerateInvoiceButton } from "./generate-invoice-button";

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
      vehicle: true,
      items: { include: { product: true, variant: true, service: true } },
      invoices: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) notFound();

  const ctx = await loadTenantContext(user.id, order.organizationId);
  if (!ctx) notFound();

  const { organization } = order;
  const canFulfill = ctx.permissions.has("sales.fulfill") && order.status !== "CANCELLED";
  const canReturn = ctx.permissions.has("sales.return");
  const outstanding = new Prisma.Decimal(order.total).minus(order.amountPaid);
  const existingInvoice = order.invoices[0];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="text-xl font-semibold">{order.orderNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {order.customer ? order.customer.name : "Walk-in"} · {order.branch.name}
            </p>
            {order.vehicle && (
              <p className="text-sm text-muted-foreground">
                <Link href={`/vehicles/${order.vehicle.id}`} className="hover:underline">
                  {order.vehicle.make} {order.vehicle.model}
                  {order.vehicle.plateNumber && ` · ${order.vehicle.plateNumber}`}
                </Link>
                {order.odometerReading != null && ` · ${order.odometerReading} mi/km`}
              </p>
            )}
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
            const returnable = item.quantityFulfilled - item.quantityReturned;
            const name = item.product ? item.product.name : (item.service?.name ?? "");
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {name}
                    {item.variant && ` · ${item.variant.sku}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantityFulfilled} / {item.quantityOrdered} fulfilled
                    {item.quantityReturned > 0 && ` · ${item.quantityReturned} returned`} ·{" "}
                    {formatMoney(item.unitPrice.toString(), organization.currencyCode, organization.locale)} each
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canFulfill && remaining > 0 && <FulfillItemForm orderItemId={item.id} remaining={remaining} />}
                  {canReturn && returnable > 0 && <ReturnItemForm orderItemId={item.id} returnable={returnable} />}
                </div>
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

      {order.status !== "CANCELLED" && (
        <div className="flex justify-end">
          {existingInvoice ? (
            <Link
              href={`/invoices/${existingInvoice.id}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium hover:bg-accent"
            >
              View invoice {existingInvoice.invoiceNumber}
            </Link>
          ) : (
            ctx.permissions.has("invoices.create") && <GenerateInvoiceButton orderId={order.id} />
          )}
        </div>
      )}
    </div>
  );
}
