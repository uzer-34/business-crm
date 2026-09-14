import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { getTerminology } from "@/lib/industry/terminology";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { PageHeader, Stat } from "@/components/ui/layout";
import { buildCreateActions } from "@/lib/navigation/create-actions";
import { summarizeActivity } from "@/lib/customer/activity-summary";
import { formatMoney } from "@/lib/format";

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

export default async function DashboardPage() {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const { organization } = membership;
  const ctx = await loadTenantContext(user.id, organization.id);
  const permissions = ctx?.permissions ?? new Set<string>();
  const can = (key: string) => permissions.has(key as never);

  const [branchCount, employeeCount, customerCount, productCount, orderCount, attentionTasks, lowStock, outstandingInvoices, recentActivity] =
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
    ]);

  const term = getTerminology(organization.industryKey);
  const createActions = ctx
    ? buildCreateActions({ permissions, industryKey: organization.industryKey }).slice(0, 5)
    : [];

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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Welcome back${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description={`Here's what's happening at ${organization.name}.`}
      />

      {createActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {createActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button key={action.key} variant="outline" size="sm" asChild>
                <Link href={action.href}>
                  <Icon className="size-4" aria-hidden="true" />
                  New {action.label.toLowerCase()}
                </Link>
              </Button>
            );
          })}
        </div>
      )}

      {!setupComplete && (
        <Card>
          <CardHeader>
            <CardTitle>Finish setting up</CardTitle>
            <CardDescription>
              {setupSteps.filter((step) => step.done).length} of {setupSteps.length} done — these unlock the rest of the
              app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {setupSteps.map((step) =>
              step.done ? (
                <div key={step.label} className="flex items-center gap-2 px-1 py-1.5 text-[13px] text-foreground-muted">
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                  <span className="line-through">{step.label}</span>
                </div>
              ) : (
                <Link
                  key={step.label}
                  href={step.href}
                  className="flex items-center gap-2 rounded-md px-1 py-1.5 text-[13px] hover:bg-hover"
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

      {/* Counts are supporting context, so they sit in one compact row rather than dominating the page. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={term.customers} value={customerCount} href={can("customers.view") ? "/customers" : undefined} />
        <Stat label="Products" value={productCount} href={can("products.view") ? "/products" : undefined} />
        <Stat label="Branches" value={branchCount} href={can("branches.view") ? "/branches" : undefined} />
        <Stat label="Team" value={employeeCount} href={can("employees.view") ? "/employees" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs your attention</CardTitle>
            <CardDescription>Open work that is due, low, or unpaid.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
                            <span className="tabular text-[13px] text-danger">
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
                        trailing={
                          <span className="tabular text-[13px] text-danger">
                            {level.quantity} {level.product.unit}
                          </span>
                        }
                      />
                    ))}
                  </AttentionGroup>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>The latest changes across this business.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No activity yet"
                description="As your team creates records and completes work, it shows up here."
              />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {recentActivity.map((activity) => (
                  <li key={activity.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate">{summarizeActivity(activity)}</span>
                    <span className="shrink-0 text-[12px] text-foreground-subtle">
                      {new Date(activity.createdAt).toLocaleDateString()}
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
      className="flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-1.5 text-[13px] hover:bg-hover"
    >
      <span className="min-w-0 truncate">
        {label}
        {detail && <span className="text-foreground-subtle"> — {detail}</span>}
      </span>
      {trailing}
    </Link>
  );
}
