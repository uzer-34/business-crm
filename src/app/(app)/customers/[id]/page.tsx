import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { tracksVehicles } from "@/lib/industry/registry";
import { Card, CardContent } from "@/components/ui/card";
import { summarizeActivity } from "@/lib/customer/activity-summary";
import { CustomerDetail } from "./customer-detail";
import { EditCustomerForm } from "./edit-customer-form";
import { ArchiveCustomerButton } from "./archive-customer-button";

const STATUS_LABEL: Record<string, string> = { LEAD: "Lead", ACTIVE: "Active", INACTIVE: "Inactive" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const customer = await db.customer.findUnique({ where: { id }, include: { organization: true } });
  if (!customer) notFound();

  const ctx = await loadTenantContext(user.id, customer.organizationId);
  if (!ctx) notFound();

  const showVehicles = tracksVehicles(customer.organization.industryKey);

  const [
    notesRaw,
    tasksRaw,
    activitiesRaw,
    membersRaw,
    ordersRaw,
    invoicesRaw,
    customFieldDefs,
    customFieldValues,
    vehiclesRaw,
  ] = await Promise.all([
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
    db.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
    }),
    db.invoice.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
    }),
    db.customFieldDefinition.findMany({
      where: { organizationId: ctx.organizationId, entityType: "CUSTOMER", archivedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    db.customFieldValue.findMany({ where: { entityId: id } }),
    showVehicles
      ? db.vehicle.findMany({ where: { customerId: id, archivedAt: null }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
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

  const orders = ordersRaw.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    total: o.total.toString(),
  }));

  const invoices = invoicesRaw.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    total: inv.total.toString(),
  }));

  const vehicles = vehiclesRaw.map((v) => ({
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    plateNumber: v.plateNumber,
  }));

  const valueByDefinitionId = new Map(customFieldValues.map((v) => [v.definitionId, v.value]));
  const customFields = customFieldDefs.map((f) => ({
    id: f.id,
    label: f.label,
    fieldType: f.fieldType,
    options: (f.options as string[] | null) ?? null,
    required: f.required,
    value: (valueByDefinitionId.get(f.id) ?? null) as string | number | boolean | null,
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
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              {STATUS_LABEL[customer.status]}
            </span>
            {ctx.permissions.has("customers.edit") && (
              <EditCustomerForm
                customerId={customer.id}
                initial={{
                  type: customer.type,
                  name: customer.name,
                  email: customer.email,
                  phone: customer.phone,
                  status: customer.status,
                }}
              />
            )}
            {ctx.permissions.has("customers.delete") && <ArchiveCustomerButton customerId={customer.id} />}
          </div>
        </CardContent>
      </Card>

      <CustomerDetail
        organizationId={customer.organizationId}
        customerId={customer.id}
        assignedToId={customer.assignedToId}
        members={members}
        notes={notes}
        tasks={tasks}
        activities={activities}
        orders={orders}
        invoices={invoices}
        customFields={customFields}
        vehicles={showVehicles ? vehicles : null}
        canAddVehicle={ctx.permissions.has("vehicles.create")}
        currencyCode={customer.organization.currencyCode}
        locale={customer.organization.locale}
        canAssign={ctx.permissions.has("customers.assign")}
        canEdit={ctx.permissions.has("customers.edit")}
      />
    </div>
  );
}
