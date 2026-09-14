import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import {
  getMonthlyRevenueTrend,
  getTopCustomersByRevenue,
  getTopProductsByQuantityFulfilled,
  getExpenseBreakdownByCategory,
} from "@/lib/analytics/reports";
import { AiSummaryCard } from "./ai-summary-card";

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 3 : 0) : 0;
  return (
    <div className="h-2 flex-1 rounded-full bg-muted">
      <div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

const RANGE_OPTIONS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 3 months" },
  { days: 180, label: "Last 6 months" },
  { days: 365, label: "Last 12 months" },
] as const;
const DEFAULT_DAYS = 180;

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { membership } = await getDefaultMembershipOrRedirect();
  const user = await getCurrentUser();
  const ctx = user ? await loadTenantContext(user.id, membership.organizationId) : null;
  if (!ctx) return null;

  if (!ctx.permissions.has("reports.sales") && !ctx.permissions.has("reports.financial")) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          You don&apos;t have permission to view reports.
        </CardContent>
      </Card>
    );
  }

  const { organization } = membership;
  const canSeeFinancial = ctx.permissions.has("reports.financial");
  const canSeeSales = ctx.permissions.has("reports.sales");

  const params = await searchParams;
  const requestedDays = Number(Array.isArray(params.days) ? params.days[0] : params.days);
  const days = RANGE_OPTIONS.some((o) => o.days === requestedDays) ? requestedDays : DEFAULT_DAYS;
  const months = Math.max(1, Math.round(days / 30));
  const rangeLabel = RANGE_OPTIONS.find((o) => o.days === days)?.label ?? `Last ${days} days`;

  const [revenueTrend, topCustomers, topProducts, expenseBreakdown] = await Promise.all([
    canSeeFinancial ? getMonthlyRevenueTrend(organization.id, months) : Promise.resolve([]),
    canSeeSales ? getTopCustomersByRevenue(organization.id, 5, days) : Promise.resolve([]),
    canSeeSales ? getTopProductsByQuantityFulfilled(organization.id, 5, days) : Promise.resolve([]),
    canSeeFinancial ? getExpenseBreakdownByCategory(organization.id, days) : Promise.resolve([]),
  ]);

  const maxRevenue = Math.max(...revenueTrend.map((p) => Number(p.total)), 0);
  const maxCustomerRevenue = Math.max(...topCustomers.map((c) => Number(c.total)), 0);
  const maxProductQty = Math.max(...topProducts.map((p) => p.quantity), 0);
  const maxExpense = Math.max(...expenseBreakdown.map((e) => Number(e.total)), 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">{organization.name}</p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {RANGE_OPTIONS.map((option) => (
            <Link
              key={option.days}
              href={`/reports?days=${option.days}`}
              className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                option.days === days ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {canSeeFinancial && <AiSummaryCard organizationId={organization.id} />}

      {canSeeFinancial && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <CardDescription>Issued invoice totals, {rangeLabel.toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {revenueTrend.map((point) => (
              <div key={point.monthLabel} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-muted-foreground">{point.monthLabel}</span>
                <Bar value={Number(point.total)} max={maxRevenue} />
                <span className="w-24 shrink-0 text-right tabular-nums">
                  {formatMoney(point.total, organization.currencyCode, organization.locale)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canSeeSales && (
        <Card>
          <CardHeader>
            <CardTitle>Top customers</CardTitle>
            <CardDescription>By total invoiced revenue.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoiced revenue yet.</p>
            ) : (
              topCustomers.map((c) => (
                <div key={c.customerId} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate">{c.name}</span>
                  <Bar value={Number(c.total)} max={maxCustomerRevenue} />
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {formatMoney(c.total, organization.currencyCode, organization.locale)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {canSeeSales && (
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By units fulfilled.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing fulfilled yet.</p>
            ) : (
              topProducts.map((p) => (
                <div key={p.productId} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate">{p.name}</span>
                  <Bar value={p.quantity} max={maxProductQty} />
                  <span className="w-24 shrink-0 text-right tabular-nums">{p.quantity} units</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {canSeeFinancial && (
        <Card>
          <CardHeader>
            <CardTitle>Expenses by category</CardTitle>
            <CardDescription>{rangeLabel}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {expenseBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses recorded in this period.</p>
            ) : (
              expenseBreakdown.map((e) => (
                <div key={e.categoryId ?? "uncategorized"} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate">{e.categoryName}</span>
                  <Bar value={Number(e.total)} max={maxExpense} />
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {formatMoney(e.total, organization.currencyCode, organization.locale)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
