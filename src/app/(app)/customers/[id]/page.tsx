import { notFound } from "next/navigation";
import Link from "next/link";
import { Mail, Phone, Plus, StickyNote } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { tracksVehicles } from "@/lib/industry/registry";
import { getTerminology } from "@/lib/industry/terminology";
import { getTimeline } from "@/lib/activity/timeline";
import { loadFieldLayout, loadFieldValues } from "@/lib/metadata/field-service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/layout";
import { CustomerDetail } from "./customer-detail";
import { resolveTab } from "./tabs";
import { EditCustomerForm } from "./edit-customer-form";
import { ArchiveCustomerButton } from "./archive-customer-button";

const STATUS_LABEL: Record<string, string> = { LEAD: "Lead", ACTIVE: "Active", INACTIVE: "Inactive" };
const STATUS_TONE: Record<string, "warning" | "success" | "neutral"> = {
  LEAD: "warning",
  ACTIVE: "success",
  INACTIVE: "neutral",
};
const TYPE_LABEL: Record<string, string> = { INDIVIDUAL: "Individual", BUSINESS: "Business" };

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const query = await searchParams;

  const user = await getCurrentUser();
  if (!user) notFound();

  const customer = await db.customer.findUnique({
    where: { id },
    include: { organization: true, branch: { select: { name: true } } },
  });
  if (!customer) notFound();

  const ctx = await loadTenantContext(user.id, customer.organizationId);
  if (!ctx || !ctx.permissions.has("customers.view")) notFound();

  const term = getTerminology(customer.organization.industryKey);
  const showVehicles = tracksVehicles(customer.organization.industryKey);
  const activeTab = resolveTab(typeof query.tab === "string" ? query.tab : undefined, showVehicles);

  const [notesRaw, tasksRaw, timeline, membersRaw, ordersRaw, invoicesRaw, fieldSections, fieldValues, vehiclesRaw] =
    await Promise.all([
      db.note.findMany({ where: { customerId: id }, include: { author: true }, orderBy: { createdAt: "desc" } }),
      db.task.findMany({
        where: { customerId: id },
        include: { assignedTo: { include: { user: true } } },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      }),
      getTimeline(ctx.organizationId, "Customer", id),
      db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, include: { user: true } }),
      db.order.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }),
      db.invoice.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }),
      loadFieldLayout(ctx.organizationId, "customer", { roleKey: ctx.roleKey }),
      loadFieldValues(ctx.organizationId, "customer", id),
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

  const owner = membersRaw.find((m) => m.id === customer.assignedToId);
  const ownerLabel = owner ? (owner.user.name ?? owner.user.email ?? owner.user.phone ?? "Member") : "Unassigned";
  const lastActivity = timeline[0];

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ label: term.customers, href: "/customers" }, { label: customer.name }]} />

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">{customer.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone={STATUS_TONE[customer.status] ?? "neutral"}>
                  {STATUS_LABEL[customer.status] ?? customer.status}
                </Badge>
                <Badge>{TYPE_LABEL[customer.type] ?? customer.type}</Badge>
                {customer.branch && <Badge>{customer.branch.name}</Badge>}
                {customer.tags.map((tag) => (
                  <Badge key={tag} tone="accent">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/*
                Quick actions are only rendered when they can actually run:
                a mail link needs an address, and each create action needs its
                permission. Nothing here is a placeholder.
              */}
              {customer.email && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${customer.email}`}>
                    <Mail className="size-4" aria-hidden="true" />
                    Email
                  </a>
                </Button>
              )}
              {customer.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${customer.phone}`}>
                    <Phone className="size-4" aria-hidden="true" />
                    Call
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/customers/${customer.id}?tab=notes`}>
                  <StickyNote className="size-4" aria-hidden="true" />
                  Add note
                </Link>
              </Button>
              {ctx.permissions.has("sales.create") && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/orders/new?customerId=${customer.id}`}>
                    <Plus className="size-4" aria-hidden="true" />
                    {term.order}
                  </Link>
                </Button>
              )}
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
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-[12px]">
            <div className="flex gap-1.5">
              <dt className="text-foreground-subtle">Owner</dt>
              <dd className="text-foreground">{ownerLabel}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-foreground-subtle">Contact</dt>
              <dd className="text-foreground">
                {[customer.email, customer.phone].filter(Boolean).join(" · ") || "None on file"}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-foreground-subtle">Last activity</dt>
              <dd className="text-foreground">
                {lastActivity ? new Date(lastActivity.createdAt).toLocaleDateString() : "None yet"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <CustomerDetail
        customerId={customer.id}
        customer={{
          type: customer.type,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          status: customer.status,
        }}
        assignedToId={customer.assignedToId}
        members={members}
        notes={notes}
        tasks={tasks}
        timeline={timeline}
        activeTab={activeTab}
        orders={orders}
        invoices={invoices}
        fieldSections={fieldSections}
        fieldValues={fieldValues}
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
