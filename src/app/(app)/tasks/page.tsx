import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { NewStandaloneTaskForm } from "./new-task-form";
import { TaskRow } from "./task-row";

export default async function TasksPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const user = await getCurrentUser();
  const ctx = user ? await loadTenantContext(user.id, membership.organizationId) : null;
  if (!ctx) return null;

  const canCreate = ctx.permissions.has("tasks.create");
  const canViewTeam = ctx.permissions.has("tasks.view");

  const [myTasks, teamTasks, members] = await Promise.all([
    db.task.findMany({
      where: { organizationId: ctx.organizationId, assignedToId: ctx.membershipId, status: "OPEN" },
      include: { customer: true },
      orderBy: [{ dueAt: "asc" }],
    }),
    canViewTeam
      ? db.task.findMany({
          where: { organizationId: ctx.organizationId, status: "OPEN" },
          include: { customer: true, assignedTo: { include: { user: true } } },
          orderBy: [{ dueAt: "asc" }],
          take: 100,
        })
      : Promise.resolve([]),
    db.membership.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
      include: { user: true },
    }),
  ]);

  const memberOptions = members.map((m) => ({
    id: m.id,
    label: m.user.name ?? m.user.email ?? m.user.phone ?? "Member",
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">Work not tied to a specific customer.</p>
        </div>
        {canCreate && (
          <NewStandaloneTaskForm organizationId={ctx.organizationId} members={memberOptions} />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {myTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing assigned to you right now.</p>
          ) : (
            <RevealOnScroll className="flex flex-col gap-2">
              {myTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  taskId={task.id}
                  title={task.title}
                  dueAt={task.dueAt?.toISOString() ?? null}
                  customerName={task.customer?.name ?? null}
                  customerId={task.customerId}
                  assignedToLabel={null}
                />
              ))}
            </RevealOnScroll>
          )}
        </CardContent>
      </Card>

      {canViewTeam && (
        <Card>
          <CardHeader>
            <CardTitle>Team tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {teamTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks across the team.</p>
            ) : (
              <RevealOnScroll className="flex flex-col gap-2">
                {teamTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    taskId={task.id}
                    title={task.title}
                    dueAt={task.dueAt?.toISOString() ?? null}
                    customerName={task.customer?.name ?? null}
                    customerId={task.customerId}
                    assignedToLabel={
                      task.assignedTo
                        ? (task.assignedTo.user.name ?? task.assignedTo.user.email ?? task.assignedTo.user.phone)
                        : "Unassigned"
                    }
                  />
                ))}
              </RevealOnScroll>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
