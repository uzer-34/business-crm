import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { InvoicePaymentForm } from "./invoice-payment-form";
import { VoidInvoiceButton } from "./void-invoice-button";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  ONLINE: "Online",
  OTHER: "Other",
};

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      branch: true,
      organization: true,
      items: true,
      payments: { include: { recordedBy: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!invoice) notFound();

  const ctx = await loadTenantContext(user.id, invoice.organizationId);
  if (!ctx) notFound();

  const { organization } = invoice;
  const canRecordPayment = ctx.permissions.has("payments.record") && invoice.status !== "VOID";
  const canVoid = ctx.permissions.has("invoices.void") && invoice.status !== "VOID";
  const outstanding = new Prisma.Decimal(invoice.total).minus(invoice.amountPaid);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="text-xl font-semibold">{invoice.invoiceNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {invoice.customer ? invoice.customer.name : "Walk-in"} · {invoice.branch.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-semibold tabular-nums">
                {formatMoney(invoice.total.toString(), organization.currencyCode, organization.locale)}
              </p>
              <p className="text-xs text-muted-foreground">
                {invoice.status === "VOID" ? "Void" : "Issued"} ·{" "}
                {invoice.paymentStatus.replace("_", " ").toLowerCase()}
              </p>
            </div>
            <Link
              href={`/invoices/${invoice.id}/print`}
              target="_blank"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium hover:bg-accent"
            >
              Print
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {invoice.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <span>
                {item.description} × {item.quantity}
              </span>
              <span>{formatMoney(item.unitPrice.toString(), organization.currencyCode, organization.locale)} each</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatMoney(invoice.subtotal.toString(), organization.currencyCode, organization.locale)}</span>
            </div>
            {invoice.discountTotal.toString() !== "0" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatMoney(invoice.discountTotal.toString(), organization.currencyCode, organization.locale)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatMoney(invoice.taxTotal.toString(), organization.currencyCode, organization.locale)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paid</span>
              <span>{formatMoney(invoice.amountPaid.toString(), organization.currencyCode, organization.locale)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span>Outstanding</span>
              <span>{formatMoney(outstanding.toString(), organization.currencyCode, organization.locale)}</span>
            </div>
          </div>

          {invoice.payments.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Payment history</p>
              {invoice.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between text-sm">
                  <span>
                    {METHOD_LABEL[payment.method]}
                    {payment.reference && ` · ${payment.reference}`}
                  </span>
                  <span className="text-muted-foreground">
                    {formatMoney(payment.amount.toString(), organization.currencyCode, organization.locale)} ·{" "}
                    {new Date(payment.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {canRecordPayment && outstanding.greaterThan(0) && (
            <InvoicePaymentForm invoiceId={invoice.id} outstanding={outstanding.toString()} />
          )}
        </CardContent>
      </Card>

      {canVoid && (
        <div className="flex justify-end">
          <VoidInvoiceButton invoiceId={invoice.id} />
        </div>
      )}
    </div>
  );
}
