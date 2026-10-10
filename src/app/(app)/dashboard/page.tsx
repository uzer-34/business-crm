import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Inbox,
  LayoutDashboard,
  Boxes,
  Building2,
  Plus,
  ShoppingBag,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { getTerminology } from "@/lib/industry/terminology";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/layout";
import { buildCreateActions } from "@/lib/navigation/create-actions";
import { summarizeActivity } from "@/lib/customer/activity-summary";
import { formatMoney } from "@/lib/format";

type MonthBucket = { start: Date; end: Date; label: string };
type MonthlySales = {
  label: string;
  total: string;
  collected: string;
  totalValue: number;
  collectedValue: number;
  count: number;
};

// Kept outside the component: the React Compiler's purity rule flags impure
// calls (Date.now/new Date) made directly inside a component body.
async function loadAttentionTasks(organizationId: string) {
  const now = Date.now();
  const tasks = await db.task.findMany({
    where: { organizationId, status: "OPEN", dueAt: { lte: new Date(now + 24 * 60 * 60 * 1000) } },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { dueAt: "asc" },
    take: 5,
  });

  return tasks.map((task) => ({ ...task, overdue: task.dueAt ? task.dueAt.getTime() < now : false }));
}

// Prisma can't compare two columns (quantity vs. reorderPoint) in a where
// clause, so this fetches candidates (products with a threshold set) and
// filters in JS.
async function loadLowStock(organizationId: string) {
  const levels = await db.stockLevel.findMany({
    where: { organizationId, product: { reorderPoint: { not: null } } },
    include: { product: true, branch: true, variant: true },
  });

  return levels
    .filter((level) => level.product.reorderPoint != null && level.quantity <= level.product.reorderPoint)
    .slice(0, 5);
}

function getMonthBuckets(now: Date, locale: string): MonthBucket[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  return Array.from({ length: 6 }, (_, index) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { start, end, label: formatter.format(start) };
  });
}

async function loadMonthlySales(organizationId: string, locale: string): Promise<MonthlySales[]> {
  const months = getMonthBuckets(new Date(), locale);
  return Promise.all(
    months.map(async ({ start, end, label }) => {
      const aggregate = await db.order.aggregate({
        where: {
          organizationId,
          status: { not: "CANCELLED" },
          createdAt: { gte: start, lt: end },
        },
        _sum: { total: true, amountPaid: true },
        _count: { _all: true },
      });
      const total = aggregate._sum.total?.toString() ?? "0";
      const collected = aggregate._sum.amountPaid?.toString() ?? "0";
      return {
        label,
        total,
        collected,
        totalValue: Number(total),
        collectedValue: Number(collected),
        count: aggregate._count._all,
      };
    }),
  );
}

export default async function DashboardPage() {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const { organization } = membership;
  const ctx = await loadTenantContext(user.id, organization.id);
  const permissions = ctx?.permissions ?? new Set<string>();
  const can = (key: string) => permissions.has(key as never);
  const canViewSales = can("sales.view") || can("reports.sales");

  const [branchCount, employeeCount, customerCount, productCount, orderCount, attentionTasks, lowStock, outstandingInvoices, recentActivity, monthlySales, recentOrders] =
    await Promise.all([
      db.branch.count({ where: { organizationId: organization.id, archivedAt: null } }),
      db.membership.count({ where: { organizationId: organization.id, status: "ACTIVE" } }),
      db.customer.count({ where: { organizationId: organization.id, archivedAt: null } }),
      db.product.count({ where: { organizationId: organization.id, archivedAt: null } }),
      db.order.count({ where: { organizationId: organization.id } }),
      can("tasks.view") ? loadAttentionTasks(organization.id) : Promise.resolve([]),
      can("inventory.view") ? loadLowStock(organization.id) : Promise.resolve([]),
      can("invoices.view")
        ? db.invoice.findMany({
            where: { organizationId: organization.id, status: "ISSUED", paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
            include: { customer: true },
            orderBy: { issuedAt: "asc" },
            take: 5,
          })
        : Promise.resolve([]),
      db.activity.findMany({
        where: { organizationId: organization.id },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      canViewSales ? loadMonthlySales(organization.id, organization.locale) : Promise.resolve([] as MonthlySales[]),
      can("sales.view")
        ? db.order.findMany({
            where: { organizationId: organization.id, status: { not: "CANCELLED" } },
            include: { customer: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
    ]);

  const term = getTerminology(organization.industryKey);
  const createActions = ctx ? buildCreateActions({ permissions, industryKey: organization.industryKey }) : [];
  const orderAction = createActions.find((action) => action.key === "order") ?? createActions[0];

  /*
   * Setup checklist, derived from real counts. It disappears for good once
   * every step is done, so an established business never sees onboarding
   * chrome — and no step is ever shown as complete when it isn't.
   */
  const setupSteps = [
    { label: `Add your first ${term.customer.toLowerCase()}`, done: customerCount > 0, href: "/customers?new=1" },
    { label: "Add a product or service", done: productCount > 0, href: "/products?new=1" },
    { label: `Record your first ${term.order.toLowerCase()}`, done: orderCount > 0, href: "/orders/new" },
    { label: "Invite a team member", done: employeeCount > 1, href: "/employees" },
  ];
  const setupComplete = setupSteps.every((step) => step.done);
  const hasAttention = attentionTasks.length > 0 || lowStock.length > 0 || outstandingInvoices.length > 0;
  const currentMonth = monthlySales.at(-1);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title={`Welcome back${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description={`Here's what's happening at ${organization.name}.`}
        actions={
          orderAction ? (
            <Button asChild className="rounded-full px-4">
              <Link href={orderAction.href}>
                <Plus className="size-4" aria-hidden="true" />
                New {orderAction.label.toLowerCase()}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <section className="relative isolate overflow-hidden rounded-2xl bg-primary px-5 py-5 text-primary-foreground shadow-raised sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-16 -top-24 -z-10 size-64 rounded-full border-[42px] border-white/5" />
        <div className="pointer-events-none absolute -right-5 -bottom-36 -z-10 size-64 rounded-full border-[34px] border-white/5" />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <div className="mb-4 flex items-center gap-2 text-[12px] font-medium text-white/65">
              <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-white">
                <LayoutDashboard className="size-4" aria-hidden="true" />
              </span>
              <span>MY BUSINESS</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{organization.name}</h2>
            <p className="mt-1 text-[13px] text-white/65">
              {canViewSales
                ? `${currentMonth?.count ?? 0} ${term.order.toLowerCase()}${currentMonth?.count === 1 ? "" : "s"} this month`
                : `${customerCount} ${term.customer.toLowerCase()} records across your business`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:min-w-64">
            <div>
              <p className="text-[11px] text-white/55">{canViewSales ? "Sales this month" : term.customers}</p>
              <p className="tabular mt-1 text-xl font-semibold">
                {canViewSales && currentMonth
                  ? formatMoney(currentMonth.total, organization.currencyCode, organization.locale)
                  : customerCount.toLocaleString(organization.locale)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-white/55">{canViewSales ? "Collected" : "Active team"}</p>
              <p className="tabular mt-1 text-xl font-semibold">
                {canViewSales && currentMonth
                  ? formatMoney(currentMonth.collected, organization.currencyCode, organization.locale)
                  : employeeCount.toLocaleString(organization.locale)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          icon={UsersRound}
          tone="accent"
          label={term.customers}
          value={customerCount.toLocaleString(organization.locale)}
          hint="In your workspace"
          href={can("customers.view") ? "/customers" : undefined}
        />
        <MetricCard
          icon={ShoppingBag}
          tone="success"
          label={term.orders}
          value={orderCount.toLocaleString(organization.locale)}
          hint={currentMonth ? `${currentMonth.count} this month` : "All time"}
          href={can("sales.view") ? "/orders" : undefined}
        />
        <MetricCard
          icon={Boxes}
          tone="warning"
          label="Products & services"
          value={productCount.toLocaleString(organization.locale)}
          hint="In your catalog"
          href={can("products.view") ? "/products" : undefined}
        />
        <MetricCard
          icon={Building2}
          tone="neutral"
          label="Team members"
          value={employeeCount.toLocaleString(organization.locale)}
          hint={`${branchCount.toLocaleString(organization.locale)} ${branchCount === 1 ? "branch" : "branches"}`}
          href={can("employees.view") ? "/employees" : undefined}
        />
      </div>

      {!setupComplete && (
        <Card>
          <CardHeader className="border-0 pb-0">
            <CardTitle>Get your business ready</CardTitle>
            <CardDescription>
              {setupSteps.filter((step) => step.done).length} of {setupSteps.length} steps complete.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 sm:grid-cols-2">
            {setupSteps.map((step) =>
              step.done ? (
                <div key={step.label} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] text-foreground-muted">
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                  <span className="line-through">{step.label}</span>
                </div>
              ) : (
                <Link
                  key={step.label}
                  href={step.href}
                  className="flex min-h-10 items-center gap-2 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-hover"
                >
                  <Circle className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
                  <span>{step.label}</span>
                  <ArrowRight className="ml-auto size-3.5 text-foreground-subtle" aria-hidden="true" />
                </Link>
              ),
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {canViewSales && (
          <Card>
            <CardHeader className="border-0 pb-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Business analytics</CardTitle>
                  <CardDescription>Order value and collected payments over the last six months.</CardDescription>
                </div>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-subtle-foreground">
                  <TrendingUp className="size-4" aria-hidden="true" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {monthlySales.some((month) => month.totalValue > 0) ? (
                <MonthlySalesChart months={monthlySales} currencyCode={organization.currencyCode} locale={organization.locale} />
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="Your sales chart is ready"
                  description="Order values and collected payments will appear here as you record sales."
                  className="py-10"
                />
              )}
            </CardContent>
          </Card>
        )}

        {can("sales.view") && (
          <Card>
            <CardHeader className="border-0 pb-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Recent orders</CardTitle>
                  <CardDescription>Your latest sales activity.</CardDescription>
                </div>
                <Link href="/orders" className="text-[12px] font-medium text-accent hover:underline">
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {recentOrders.length === 0 ? (
                <EmptyState icon={ShoppingBag} title="No orders yet" description="New orders will show up here." className="py-10" />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {recentOrders.map((order) => (
                    <li key={order.id}>
                      <Link href={`/orders/${order.id}`} className="flex min-h-[62px] items-center gap-3 py-2.5 hover:text-accent">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent">
                          <ShoppingBag className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{order.customer?.name ?? "Walk-in customer"}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-foreground-muted">
                            {order.orderNumber} · {order.createdAt.toLocaleDateString(organization.locale)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tabular block text-[13px] font-semibold text-foreground">
                            {formatMoney(order.total.toString(), organization.currencyCode, organization.locale)}
                          </span>
                          <Badge tone={order.status === "FULFILLED" ? "success" : order.status === "CANCELLED" ? "danger" : "warning"} className="mt-1">
                            {order.status === "PARTIALLY_FULFILLED" ? "In progress" : order.status.toLowerCase()}
                          </Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-0 pb-0">
            <CardTitle>Needs your attention</CardTitle>
            <CardDescription>Work that is due, running low, or awaiting payment.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-3">
            {!hasAttention ? (
              <EmptyState
                icon={Inbox}
                title="Nothing needs attention"
                description="Overdue tasks, low stock and unpaid invoices will surface here as they happen."
              />
            ) : (
              <>
                {attentionTasks.length > 0 && (
                  <AttentionGroup title="Tasks due">
                    {attentionTasks.map((task) => (
                      <AttentionRow
                        key={task.id}
                        href={task.customer ? `/customers/${task.customer.id}?tab=tasks` : "/tasks"}
                        label={task.title}
                        detail={task.customer?.name}
                        trailing={
                          task.dueAt ? (
                            <Badge tone={task.overdue ? "danger" : "warning"}>{task.overdue ? "Overdue" : "Today"}</Badge>
                          ) : null
                        }
                      />
                    ))}
                  </AttentionGroup>
                )}

                {outstandingInvoices.length > 0 && (
                  <AttentionGroup title="Unpaid invoices">
                    {outstandingInvoices.map((invoice) => {
                      const outstanding = new Prisma.Decimal(invoice.total).minus(invoice.amountPaid);
                      return (
                        <AttentionRow
                          key={invoice.id}
                          href={`/invoices/${invoice.id}`}
                          label={invoice.invoiceNumber}
                          detail={invoice.customer?.name}
                          trailing={
                            <span className="tabular text-[13px] font-medium text-danger">
                              {formatMoney(outstanding.toString(), organization.currencyCode, organization.locale)}
                            </span>
                          }
                        />
                      );
                    })}
                  </AttentionGroup>
                )}

                {lowStock.length > 0 && (
                  <AttentionGroup title="Low stock">
                    {lowStock.map((level) => (
                      <AttentionRow
                        key={level.id}
                        href="/inventory"
                        label={`${level.product.name}${level.variant ? ` · ${level.variant.sku}` : ""}`}
                        detail={level.branch.name}
                        trailing={<span className="tabular text-[13px] font-medium text-danger">{level.quantity} {level.product.unit}</span>}
                      />
                    ))}
                  </AttentionGroup>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-0 pb-0">
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>The latest changes across this business.</CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No activity yet"
                description="As your team creates records and completes work, it shows up here."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recentActivity.map((activity) => (
                  <li key={activity.id} className="flex min-h-[54px] items-center justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate">{summarizeActivity(activity)}</span>
                    <span className="shrink-0 text-[11px] text-foreground-subtle">
                      {activity.createdAt.toLocaleDateString(organization.locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  href,
}: {
  icon: LucideIcon;
  tone: "accent" | "success" | "warning" | "neutral";
  label: string;
  value: string;
  hint: string;
  href?: string;
}) {
  const toneClasses = {
    accent: "bg-accent-subtle text-accent-subtle-foreground",
    success: "bg-success-subtle text-success",
    warning: "bg-warning-subtle text-warning",
    neutral: "bg-surface-sunken text-foreground-muted",
  }[tone];
  const className = "flex min-h-28 items-start justify-between gap-3 rounded-xl bg-surface p-4 shadow-raised transition-colors";
  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate text-[12px] text-foreground-muted">{label}</p>
        <p className="tabular mt-1 text-xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 truncate text-[11px] text-foreground-subtle">{hint}</p>
      </div>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${toneClasses}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
    </>
  );

  return href ? (
    <Link href={href} className={`${className} hover:-translate-y-0.5 hover:shadow-overlay`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function MonthlySalesChart({
  months,
  currencyCode,
  locale,
}: {
  months: MonthlySales[];
  currencyCode: string;
  locale: string;
}) {
  const maxValue = Math.max(1, ...months.map((month) => month.totalValue));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-foreground-muted">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-full bg-accent" />Order value</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-full bg-success" />Collected</span>
      </div>
      <div
        role="img"
        aria-label={`Order value and collected payments by month for the last six months, shown in ${currencyCode}.`}
        className="grid h-40 grid-cols-6 items-end gap-2 border-b border-border px-1 sm:h-48 sm:gap-4"
      >
        {months.map((month) => {
          const totalHeight = Math.max(3, (month.totalValue / maxValue) * 100);
          const collectedHeight = Math.max(2, (month.collectedValue / maxValue) * 100);
          return (
            <div key={month.label} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
              <div className="flex h-[calc(100%-24px)] w-full items-end justify-center gap-1" title={`${month.label}: ${formatMoney(month.total, currencyCode, locale)} order value, ${formatMoney(month.collected, currencyCode, locale)} collected`}>
                <span className="w-2.5 max-w-[42%] rounded-t-full bg-accent transition-[height] sm:w-4" style={{ height: `${totalHeight}%` }} />
                <span className="w-2.5 max-w-[42%] rounded-t-full bg-success transition-[height] sm:w-4" style={{ height: `${collectedHeight}%` }} />
              </div>
              <span className="pb-2 text-[10px] text-foreground-muted sm:text-[11px]">{month.label}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-right text-[11px] text-foreground-subtle">Values reflect orders recorded in each month.</p>
    </div>
  );
}

function AttentionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-foreground-subtle uppercase">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function AttentionRow({
  href,
  label,
  detail,
  trailing,
}: {
  href: string;
  label: string;
  detail?: string | null;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-[13px] transition-colors hover:border-border-strong hover:bg-hover"
    >
      <span className="min-w-0 truncate">
        {label}
        {detail && <span className="text-foreground-subtle"> — {detail}</span>}
      </span>
      {trailing}
    </Link>
  );
}
