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

export default async function ReportsPage() {
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

  const [revenueTrend, topCustomers, topProducts, expenseBreakdown] = await Promise.all([
    canSeeFinancial ? getMonthlyRevenueTrend(organization.id) : Promise.resolve([]),
    canSeeSales ? getTopCustomersByRevenue(organization.id) : Promise.resolve([]),
    canSeeSales ? getTopProductsByQuantityFulfilled(organization.id) : Promise.resolve([]),
    canSeeFinancial ? getExpenseBreakdownByCategory(organization.id) : Promise.resolve([]),
  ]);

  const maxRevenue = Math.max(...revenueTrend.map((p) => Number(p.total)), 0);
  const maxCustomerRevenue = Math.max(...topCustomers.map((c) => Number(c.total)), 0);
  const maxProductQty = Math.max(...topProducts.map((p) => p.quantity), 0);
  const maxExpense = Math.max(...expenseBreakdown.map((e) => Number(e.total)), 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>

      {canSeeFinancial && <AiSummaryCard organizationId={organization.id} />}

      {canSeeFinancial && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <CardDescription>Issued invoice totals, last 6 months.</CardDescription>
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
            <CardDescription>Last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {expenseBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses recorded in the last 30 days.</p>
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
