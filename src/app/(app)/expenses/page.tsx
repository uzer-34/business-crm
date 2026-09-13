import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { formatMoney } from "@/lib/format";
import { NewExpenseForm } from "./new-expense-form";
import { VoidExpenseButton } from "./void-expense-button";

async function getAccessibleBranches(organizationId: string, membershipId: string, allBranches: boolean) {
  if (allBranches) {
    return db.branch.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }
  const links = await db.membershipBranch.findMany({ where: { membershipId }, include: { branch: true } });
  return links.map((l) => l.branch).filter((b) => !b.archivedAt);
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export default async function ExpensesPage() {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return null;

  const monthStart = startOfMonth();

  const [branches, expenses, monthlyExpenses, monthlyRevenue] = await Promise.all([
    getAccessibleBranches(membership.organizationId, membership.id, membership.allBranches),
    db.expense.findMany({
      where: { organizationId: membership.organizationId },
      include: { branch: true, category: true, recordedBy: true },
      // incurredAt is date-only in the UI, so same-day expenses share an
      // identical timestamp — createdAt breaks the tie so the list order
      // stays stable and most-recently-entered-first within a day.
      orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.expense.aggregate({
      where: { organizationId: membership.organizationId, status: "RECORDED", incurredAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    db.invoice.aggregate({
      where: { organizationId: membership.organizationId, status: "ISSUED", issuedAt: { gte: monthStart } },
      _sum: { total: true },
    }),
  ]);

  const canCreate = ctx.permissions.has("expenses.create");
  const canVoid = ctx.permissions.has("expenses.void");
  const canSeeReport = ctx.permissions.has("reports.financial");

  const monthlyExpenseTotal = new Prisma.Decimal(monthlyExpenses._sum.amount ?? 0);
  const monthlyRevenueTotal = new Prisma.Decimal(monthlyRevenue._sum.total ?? 0);
  const netTotal = monthlyRevenueTotal.minus(monthlyExpenseTotal);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">{expenses.length} recorded</p>
        </div>
        {canCreate && (
          <NewExpenseForm
            organizationId={membership.organizationId}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          />
        )}
      </div>

      {canSeeReport && (
        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
            <CardDescription>Revenue from issued invoices minus recorded expenses.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatMoney(monthlyRevenueTotal.toString(), membership.organization.currencyCode, membership.organization.locale)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expenses</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatMoney(monthlyExpenseTotal.toString(), membership.organization.currencyCode, membership.organization.locale)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${netTotal.isNegative() ? "text-danger" : "text-success"}`}>
                {formatMoney(netTotal.toString(), membership.organization.currencyCode, membership.organization.locale)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {expenses.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No expenses recorded yet.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-2">
          {expenses.map((expense) => (
            <Card key={expense.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div>
                  <p className={`text-sm font-medium ${expense.status === "VOID" ? "text-muted-foreground line-through" : ""}`}>
                    {expense.payee || expense.category?.name || "Expense"}
                    {expense.category && expense.payee && (
                      <span className="text-muted-foreground"> · {expense.category.name}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {expense.branch.name} · {new Date(expense.incurredAt).toLocaleDateString()} ·{" "}
                    {expense.method.replace("_", " ").toLowerCase()}
                    {expense.reference && ` · ${expense.reference}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium tabular-nums ${expense.status === "VOID" ? "text-muted-foreground line-through" : ""}`}>
                    {formatMoney(expense.amount.toString(), membership.organization.currencyCode, membership.organization.locale)}
                  </span>
                  {canVoid && expense.status === "RECORDED" && <VoidExpenseButton expenseId={expense.id} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}
