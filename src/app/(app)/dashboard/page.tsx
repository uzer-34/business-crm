import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function DashboardPage() {
  const { membership } = await getDefaultMembershipOrRedirect();

  const [branchCount, employeeCount] = await Promise.all([
    db.branch.count({ where: { organizationId: membership.organizationId, archivedAt: null } }),
    db.membership.count({ where: { organizationId: membership.organizationId, status: "ACTIVE" } }),
  ]);

  const stats = [
    { label: "Branches", value: branchCount },
    { label: "Team members", value: employeeCount },
    { label: "Open invoices", value: 0 },
    { label: "This month's sales", value: "—" },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening at {membership.organization.name}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Needs your attention</CardTitle>
          <CardDescription>Overdue invoices, low stock, and pending approvals will show up here.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nothing needs attention yet — this fills in as customers, sales, and inventory data come in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
