import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { formatMoney } from "@/lib/format";
import { PrintButton } from "./print-button";

export default async function InvoicePrintPage({ params }: PageProps<"/invoices/[id]/print">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { customer: true, branch: true, organization: true, items: true },
  });
  if (!invoice) notFound();

  const ctx = await loadTenantContext(user.id, invoice.organizationId);
  if (!ctx) notFound();

  const { organization } = invoice;
  const money = (value: string) => formatMoney(value, organization.currencyCode, organization.locale);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <div className="flex items-start justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-xl font-semibold">{organization.name}</h1>
          <p className="text-sm text-muted-foreground">{invoice.branch.name}</p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">Invoice {invoice.invoiceNumber}</h2>
          <p className="text-sm text-muted-foreground">{new Date(invoice.issuedAt).toLocaleDateString()}</p>
          {invoice.status === "VOID" && <p className="text-sm font-semibold text-danger">VOID</p>}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase text-muted-foreground">Billed to</p>
        <p className="text-sm">{invoice.customer ? invoice.customer.name : "Walk-in customer"}</p>
      </div>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => {
            const lineAmount = new Prisma.Decimal(item.unitPrice)
              .times(item.quantity)
              .times(new Prisma.Decimal(100).minus(item.discountPercent).dividedBy(100));
            return (
              <tr key={item.id} className="border-b border-border">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">{money(item.unitPrice.toString())}</td>
                <td className="py-2 text-right">{money(lineAmount.toString())}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="w-56 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{money(invoice.subtotal.toString())}</span>
          </div>
          {invoice.discountTotal.toString() !== "0" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span>-{money(invoice.discountTotal.toString())}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span>{money(invoice.taxTotal.toString())}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold">
            <span>Total</span>
            <span>{money(invoice.total.toString())}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Paid</span>
            <span>{money(invoice.amountPaid.toString())}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
