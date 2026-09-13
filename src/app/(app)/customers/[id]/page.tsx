import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent } from "@/components/ui/card";
import { summarizeActivity } from "@/lib/customer/activity-summary";
import { CustomerDetail } from "./customer-detail";

const STATUS_LABEL: Record<string, string> = { LEAD: "Lead", ACTIVE: "Active", INACTIVE: "Inactive" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  const ctx = await loadTenantContext(user.id, customer.organizationId);
  if (!ctx) notFound();

  const [notesRaw, tasksRaw, activitiesRaw, membersRaw] = await Promise.all([
    db.note.findMany({
      where: { customerId: id },
      include: { author: true },
      orderBy: { createdAt: "desc" },
    }),
    db.task.findMany({
      where: { customerId: id },
      include: { assignedTo: { include: { user: true } } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    }),
    db.activity.findMany({
      where: { organizationId: ctx.organizationId, subjectType: "Customer", subjectId: id },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.membership.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE" },
      include: { user: true },
    }),
  ]);

  const notes = notesRaw.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
    authorName: n.author.name ?? n.author.email ?? n.author.phone ?? "Someone",
  }));

  const tasks = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    assignedToLabel: t.assignedTo ? (t.assignedTo.user.name ?? t.assignedTo.user.email ?? "Assigned") : null,
  }));

  const activities = activitiesRaw.map((a) => ({
    id: a.id,
    type: a.type,
    createdAt: a.createdAt.toISOString(),
    actorName: a.actor ? (a.actor.name ?? a.actor.email ?? a.actor.phone) : null,
    summary: summarizeActivity(a),
  }));

  const members = membersRaw.map((m) => ({
    id: m.id,
    label: m.user.name ?? m.user.email ?? m.user.phone ?? "Member",
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-semibold">{customer.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact info"}
            </p>
          </div>
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
            {STATUS_LABEL[customer.status]}
          </span>
        </CardContent>
      </Card>

      <CustomerDetail
        customerId={customer.id}
        assignedToId={customer.assignedToId}
        members={members}
        notes={notes}
        tasks={tasks}
        activities={activities}
        canAssign={ctx.permissions.has("customers.assign")}
        canEdit={ctx.permissions.has("customers.edit")}
      />
    </div>
  );
}
