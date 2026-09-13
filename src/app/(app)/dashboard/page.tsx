import Link from "next/link";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StaggerIn } from "@/components/motion/stagger-in";
import { HoverLift } from "@/components/motion/hover-lift";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";

// Kept outside the component: the React Compiler's purity rule flags
// impure calls (Date.now/new Date) made directly inside a component body.
async function loadAttentionTasks(organizationId: string) {
  const now = Date.now();
  const tasks = await db.task.findMany({
    where: {
      organizationId,
      status: "OPEN",
      dueAt: { lte: new Date(now + 24 * 60 * 60 * 1000) },
    },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { dueAt: "asc" },
    take: 5,
  });

  return tasks.map((task) => ({
    ...task,
    overdue: task.dueAt ? task.dueAt.getTime() < now : false,
  }));
}

export default async function DashboardPage() {
  const { membership } = await getDefaultMembershipOrRedirect();

  const [branchCount, employeeCount, customerCount, productCount, attentionTasks] = await Promise.all([
    db.branch.count({ where: { organizationId: membership.organizationId, archivedAt: null } }),
    db.membership.count({ where: { organizationId: membership.organizationId, status: "ACTIVE" } }),
    db.customer.count({ where: { organizationId: membership.organizationId, archivedAt: null } }),
    db.product.count({ where: { organizationId: membership.organizationId, archivedAt: null } }),
    loadAttentionTasks(membership.organizationId),
  ]);

  const stats = [
    { label: "Customers", value: customerCount },
    { label: "Products", value: productCount },
    { label: "Branches", value: branchCount },
    { label: "Team members", value: employeeCount },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening at {membership.organization.name}.
        </p>
      </div>

      <StaggerIn className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <HoverLift key={stat.label}>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
              </CardContent>
            </Card>
          </HoverLift>
        ))}
      </StaggerIn>

      <Card>
        <CardHeader>
          <CardTitle>Needs your attention</CardTitle>
          <CardDescription>Tasks due today or overdue, across every customer.</CardDescription>
        </CardHeader>
        <CardContent>
          {attentionTasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Nothing needs attention right now.
            </p>
          ) : (
            <RevealOnScroll className="flex flex-col gap-2">
              {attentionTasks.map((task) => (
                <Link
                  key={task.id}
                  href={task.customer ? `/customers/${task.customer.id}` : "#"}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <span>
                    {task.title}
                    {task.customer && <span className="text-muted-foreground"> — {task.customer.name}</span>}
                  </span>
                  {task.dueAt && (
                    <span className={task.overdue ? "text-danger" : "text-muted-foreground"}>
                      {task.overdue ? "Overdue" : "Due today"}
                    </span>
                  )}
                </Link>
              ))}
            </RevealOnScroll>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
