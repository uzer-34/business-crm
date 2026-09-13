import Link from "next/link";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { HoverLift } from "@/components/motion/hover-lift";
import { formatMoney } from "@/lib/format";

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

export default async function PurchaseOrdersPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const { organization } = membership;

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { organizationId: organization.id },
    include: { supplier: true, branch: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">{purchaseOrders.length} total</p>
        </div>
        <Link
          href="/purchase-orders/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          New purchase order
        </Link>
      </div>

      {purchaseOrders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No purchase orders yet.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {purchaseOrders.map((po) => (
            <HoverLift key={po.id}>
              <Link href={`/purchase-orders/${po.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">
                        {po.orderNumber} <span className="text-muted-foreground">· {po.supplier.name}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {po.branch.name} · {STATUS_LABEL[po.status]} · {PAYMENT_LABEL[po.paymentStatus]}
                      </p>
                    </div>
                    <p className="font-medium tabular-nums">
                      {formatMoney(po.total.toString(), organization.currencyCode, organization.locale)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </HoverLift>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}
