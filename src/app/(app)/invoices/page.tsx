import Link from "next/link";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { getAccessibleCustomerNames } from "@/lib/customer/access";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { HoverLift } from "@/components/motion/hover-lift";
import { formatMoney } from "@/lib/format";

const PAYMENT_LABEL: Record<string, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
};

export default async function InvoicesPage() {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const { organization } = membership;
  const ctx = await loadTenantContext(user.id, organization.id);
  if (!ctx) return null;

  const invoices = await db.invoice.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const customerNameById = await getAccessibleCustomerNames(
    ctx,
    invoices.map((invoice) => invoice.customerId).filter((id): id is string => Boolean(id)),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">{invoices.length} total</p>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No invoices yet. Generate one from a completed order.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {invoices.map((invoice) => (
            <HoverLift key={invoice.id}>
              <Link href={`/invoices/${invoice.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">
                        {invoice.invoiceNumber}
                        {invoice.customerId && customerNameById.has(invoice.customerId) && (
                          <span className="text-muted-foreground"> · {customerNameById.get(invoice.customerId)}</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {invoice.status === "VOID" ? "Void" : PAYMENT_LABEL[invoice.paymentStatus]}
                      </p>
                    </div>
                    <p className="font-medium tabular-nums">
                      {formatMoney(invoice.total.toString(), organization.currencyCode, organization.locale)}
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
