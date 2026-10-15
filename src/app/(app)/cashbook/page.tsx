import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, BookOpen, ReceiptText } from "lucide-react";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { getAccessibleCustomerNames } from "@/lib/customer/access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";

type CashbookEntry = {
  id: string;
  createdAt: Date;
  label: string;
  detail: string;
  method: string;
  reference: string | null;
  amount: Prisma.Decimal;
  direction: "in" | "out";
  href: string | null;
};

function asInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseInputDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || asInputDate(date) !== value ? null : date;
}

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day };
}

function localMidnightToUtc(date: Date, timeZone: string) {
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const offsetAt = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const localAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    return localAsUtc - instant.getTime();
  };

  let guess = target;
  guess = target - offsetAt(new Date(guess));
  guess = target - offsetAt(new Date(guess));
  return new Date(guess);
}

function addCalendarDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function atSafeHour(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

export default async function CashbookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const query = await searchParams;
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return null;
  const timezone = membership.organization.timezone;

  const canSeePayments = ctx.permissions.has("invoices.view") || ctx.permissions.has("payments.record") || ctx.permissions.has("reports.financial");
  const canSeeOrderPayments = ctx.permissions.has("sales.fulfill") || ctx.permissions.has("reports.financial");
  const canSeeSupplierPayments = ctx.permissions.has("purchases.view") || ctx.permissions.has("reports.financial");
  const canSeeExpenses = ctx.permissions.has("expenses.view") || ctx.permissions.has("reports.financial");
  if (!canSeePayments && !canSeeOrderPayments && !canSeeSupplierPayments && !canSeeExpenses) notFound();

  const today = dateParts(new Date(), timezone);
  const defaultStart = new Date(Date.UTC(today.year, today.month - 1, 1));
  const localToday = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const parsedFrom = parseInputDate(typeof query.from === "string" ? query.from : undefined);
  const parsedTo = parseInputDate(typeof query.to === "string" ? query.to : undefined);
  const fromDate = parsedFrom ?? defaultStart;
  const toDate = parsedTo ?? localToday;
  const rangeIsValid = fromDate <= toDate;
  const rangeStart = rangeIsValid ? fromDate : defaultStart;
  const rangeEndDate = rangeIsValid ? toDate : localToday;
  const rangeStartUtc = localMidnightToUtc(rangeStart, timezone);
  const rangeEndExclusiveUtc = localMidnightToUtc(addCalendarDays(rangeEndDate, 1), timezone);

  const branchIds = ctx.allBranches
    ? (await db.branch.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true } })).map((branch) => branch.id)
    : (await db.membershipBranch.findMany({ where: { membershipId: ctx.membershipId }, select: { branchId: true } })).map((branch) => branch.branchId);
  const createdAt = { gte: rangeStartUtc, lt: rangeEndExclusiveUtc };
  // Expenses are stored as UTC-midnight calendar dates, while payments are
  // true timestamps. Keep their date-only filter aligned to the entered date.
  const expenseDateRange = {
    gte: new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate())),
    lt: new Date(Date.UTC(rangeEndDate.getUTCFullYear(), rangeEndDate.getUTCMonth(), rangeEndDate.getUTCDate() + 1)),
  };

  const paymentWhere = {
    organizationId: ctx.organizationId,
    createdAt,
    invoice: { organizationId: ctx.organizationId, branchId: { in: branchIds } },
  };
  const supplierPaymentWhere = {
    purchaseOrder: { organizationId: ctx.organizationId, branchId: { in: branchIds } },
    createdAt,
  };
  const orderPaymentWhere = {
    organizationId: ctx.organizationId,
    createdAt,
    order: { branchId: { in: branchIds }, invoices: { none: {} } },
  };
  const expenseWhere = {
    organizationId: ctx.organizationId,
    branchId: { in: branchIds },
    status: "RECORDED" as const,
    incurredAt: expenseDateRange,
  };

  const [
    payments,
    receiptsTotal,
    refundsTotal,
    orderPayments,
    orderReceiptsTotal,
    orderRefundsTotal,
    supplierPayments,
    supplierPaymentsTotal,
    expenses,
    expensesTotal,
  ] = await Promise.all([
    canSeePayments
      ? db.payment.findMany({
          where: paymentWhere,
          include: { invoice: { include: { branch: true } } },
          orderBy: { createdAt: "desc" },
          take: 250,
        })
      : Promise.resolve([]),
    canSeePayments
      ? db.payment.aggregate({ where: { ...paymentWhere, amount: { gt: 0 } }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    canSeePayments
      ? db.payment.aggregate({ where: { ...paymentWhere, amount: { lt: 0 } }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    canSeeOrderPayments
      ? db.orderPayment.findMany({
          where: orderPaymentWhere,
          include: { order: { include: { branch: true } } },
          orderBy: { createdAt: "desc" },
          take: 250,
        })
      : Promise.resolve([]),
    canSeeOrderPayments
      ? db.orderPayment.aggregate({ where: { ...orderPaymentWhere, amount: { gt: 0 } }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    canSeeOrderPayments
      ? db.orderPayment.aggregate({ where: { ...orderPaymentWhere, amount: { lt: 0 } }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    canSeeSupplierPayments
      ? db.supplierPayment.findMany({
          where: supplierPaymentWhere,
          include: { purchaseOrder: { include: { supplier: true, branch: true } } },
          orderBy: { createdAt: "desc" },
          take: 250,
        })
      : Promise.resolve([]),
    canSeeSupplierPayments
      ? db.supplierPayment.aggregate({ where: supplierPaymentWhere, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    canSeeExpenses
      ? db.expense.findMany({
          where: expenseWhere,
          include: { branch: true, category: true },
          orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
          take: 250,
        })
      : Promise.resolve([]),
    canSeeExpenses ? db.expense.aggregate({ where: expenseWhere, _sum: { amount: true } }) : Promise.resolve({ _sum: { amount: null } }),
  ]);

  const customerNameById = await getAccessibleCustomerNames(ctx, [
    ...payments.map((payment) => payment.invoice.customerId),
    ...orderPayments.map((payment) => payment.order.customerId),
  ].filter((id): id is string => Boolean(id)));

  const entries: CashbookEntry[] = [
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      createdAt: payment.createdAt,
      label: payment.invoice.customerId
        ? customerNameById.get(payment.invoice.customerId) ?? "Customer unavailable"
        : "Walk-in customer",
      detail: `Invoice ${payment.invoice.invoiceNumber} · ${payment.invoice.branch.name}`,
      method: payment.method,
      reference: payment.reference,
      amount: new Prisma.Decimal(payment.amount).abs(),
      direction: payment.amount.isNegative() ? "out" as const : "in" as const,
      href: `/invoices/${payment.invoiceId}`,
    })),
    ...orderPayments.map((payment) => ({
      id: `order-payment-${payment.id}`,
      createdAt: payment.createdAt,
      label: payment.order.customerId
        ? customerNameById.get(payment.order.customerId) ?? "Customer unavailable"
        : "Walk-in customer",
      detail: `Order ${payment.order.orderNumber} · ${payment.order.branch.name}`,
      method: payment.method,
      reference: payment.reference,
      amount: new Prisma.Decimal(payment.amount).abs(),
      direction: payment.amount.isNegative() ? "out" as const : "in" as const,
      href: `/orders/${payment.orderId}`,
    })),
    ...supplierPayments.map((payment) => ({
      id: `supplier-payment-${payment.id}`,
      createdAt: payment.createdAt,
      label: payment.purchaseOrder.supplier.name,
      detail: `Purchase ${payment.purchaseOrder.orderNumber} · ${payment.purchaseOrder.branch.name}`,
      method: payment.method,
      reference: payment.reference,
      amount: new Prisma.Decimal(payment.amount),
      direction: "out" as const,
      href: `/purchase-orders/${payment.purchaseOrderId}`,
    })),
    ...expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      createdAt: expense.incurredAt,
      label: expense.payee ?? expense.category?.name ?? "Expense",
      detail: expense.branch.name,
      method: expense.method,
      reference: expense.reference,
      amount: new Prisma.Decimal(expense.amount),
      direction: "out" as const,
      href: null,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100);

  const receipts = new Prisma.Decimal(receiptsTotal._sum.amount ?? 0).plus(orderReceiptsTotal._sum.amount ?? 0);
  const refunds = new Prisma.Decimal(refundsTotal._sum.amount ?? 0).abs().plus(new Prisma.Decimal(orderRefundsTotal._sum.amount ?? 0).abs());
  const supplierOutflow = new Prisma.Decimal(supplierPaymentsTotal._sum.amount ?? 0);
  const expensesOutflow = new Prisma.Decimal(expensesTotal._sum.amount ?? 0);
  const totalOutflow = refunds.plus(supplierOutflow).plus(expensesOutflow);
  const netMovement = receipts.minus(totalOutflow);
  const { currencyCode, locale } = membership.organization;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-accent" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight">Cashbook</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Recorded money in and money out across your accessible branches.</p>
        </div>
        <form action="/cashbook" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-foreground-muted">
            From
            <Input type="date" name="from" defaultValue={asInputDate(rangeStart)} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-foreground-muted">
            To
            <Input type="date" name="to" defaultValue={asInputDate(rangeEndDate)} />
          </label>
          <Button type="submit" variant="outline">Apply</Button>
        </form>
      </div>

      <section aria-label="Cashbook totals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Customer receipts" value={receipts} currencyCode={currencyCode} locale={locale} tone="positive" />
        <SummaryCard label="Refunds" value={refunds} currencyCode={currencyCode} locale={locale} tone="negative" />
        <SummaryCard label="Supplier + expense outflow" value={supplierOutflow.plus(expensesOutflow)} currencyCode={currencyCode} locale={locale} tone="negative" />
        <SummaryCard label="Net cash movement" value={netMovement} currencyCode={currencyCode} locale={locale} tone={netMovement.isNegative() ? "negative" : "positive"} />
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              {atSafeHour(rangeStart).toLocaleDateString(locale, { timeZone: timezone })} – {atSafeHour(rangeEndDate).toLocaleDateString(locale, { timeZone: timezone })}. Totals include the full date range.
            </CardDescription>
          </div>
          <span className="text-xs text-muted-foreground">Latest {entries.length} entries</span>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ReceiptText className="size-8 text-foreground-subtle" aria-hidden="true" />
              <p className="font-medium">No cashbook activity in this period</p>
              <p className="max-w-sm text-sm text-muted-foreground">Recorded order and invoice payments, supplier payments, and expenses will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((entry) => {
                const Icon = entry.direction === "in" ? ArrowDownLeft : ArrowUpRight;
                const row = (
                  <div className="flex min-w-0 items-center gap-3 py-3">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${entry.direction === "in" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.detail} · {entry.method.replaceAll("_", " ").toLowerCase()}
                        {entry.reference ? ` · ${entry.reference}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold tabular-nums ${entry.direction === "in" ? "text-success" : "text-danger"}`}>
                        {entry.direction === "in" ? "+" : "−"}{formatMoney(entry.amount.toString(), currencyCode, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.createdAt.toLocaleDateString(locale, { timeZone: entry.id.startsWith("expense-") ? "UTC" : timezone })}
                      </p>
                    </div>
                  </div>
                );
                return entry.href ? (
                  <Link key={entry.id} href={entry.href} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    {row}
                  </Link>
                ) : (
                  <div key={entry.id}>{row}</div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  currencyCode,
  locale,
  tone,
}: {
  label: string;
  value: Prisma.Decimal;
  currencyCode: string;
  locale: string;
  tone: "positive" | "negative";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-2 text-xl font-semibold tabular-nums ${tone === "positive" ? "text-success" : "text-danger"}`}>
          {formatMoney(value.toString(), currencyCode, locale)}
        </p>
      </CardContent>
    </Card>
  );
}
