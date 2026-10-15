import Link from "next/link";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { getAccessibleCustomerNames } from "@/lib/customer/access";
import { getTerminology } from "@/lib/industry/terminology";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { HoverLift } from "@/components/motion/hover-lift";
import { formatMoney } from "@/lib/format";

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

export default async function OrdersPage() {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const { organization } = membership;
  const ctx = await loadTenantContext(user.id, organization.id);
  if (!ctx) return null;
  const term = getTerminology(organization.industryKey);

  const orders = await db.order.findMany({
    where: { organizationId: organization.id },
    include: { branch: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const customerNameById = await getAccessibleCustomerNames(
    ctx,
    orders.map((order) => order.customerId).filter((id): id is string => Boolean(id)),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{term.orders}</h1>
          <p className="text-sm text-muted-foreground">{orders.length} total</p>
        </div>
        <Link
          href="/orders/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          New {term.order.toLowerCase()}
        </Link>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No {term.orders.toLowerCase()} yet.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {orders.map((order) => (
            <HoverLift key={order.id}>
              <Link href={`/orders/${order.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">
                        {order.orderNumber}
                        {order.customerId && customerNameById.has(order.customerId) && (
                          <span className="text-muted-foreground"> · {customerNameById.get(order.customerId)}</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {order.branch.name} · {STATUS_LABEL[order.status]} · {PAYMENT_LABEL[order.paymentStatus]}
                      </p>
                    </div>
                    <p className="font-medium tabular-nums">
                      {formatMoney(order.total.toString(), organization.currencyCode, organization.locale)}
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
