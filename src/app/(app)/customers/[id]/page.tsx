import { notFound } from "next/navigation";
import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
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

type AccountEvent = {
  id: string;
  createdAt: Date;
  kind: "sale" | "payment" | "refund";
  label: string;
  detail: string;
  amount: Prisma.Decimal;
  href: string;
};
type AccountStatement = {
  transactions: Array<Omit<AccountEvent, "createdAt" | "amount"> & { createdAt: string; amount: string; balance: string }>;
  billed: string;
  collected: string;
  refunded: string;
  balance: string;
};

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
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
  const canViewAccount = ctx.permissions.has("invoices.view")
    || ctx.permissions.has("payments.record")
    || ctx.permissions.has("sales.fulfill")
    || ctx.permissions.has("reports.financial");
  const branchIds = ctx.allBranches
    ? (await db.branch.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true } })).map((branch) => branch.id)
    : (await db.membershipBranch.findMany({ where: { membershipId: ctx.membershipId }, select: { branchId: true } })).map((branch) => branch.branchId);
  const activeTab = resolveTab(typeof query.tab === "string" ? query.tab : undefined, showVehicles, canViewAccount);

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
      db.order.findMany({
        where: { customerId: id, branchId: { in: branchIds } },
        include: {
          invoices: { select: { id: true } },
          payments: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.invoice.findMany({
        where: { customerId: id, branchId: { in: branchIds } },
        include: { payments: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
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

  let accountStatement: AccountStatement | null = null;
  if (canViewAccount) {
    const events: AccountEvent[] = [];
    for (const invoice of invoicesRaw) {
      if (invoice.status !== "ISSUED") continue;
      events.push({
        id: `invoice-${invoice.id}`,
        createdAt: invoice.issuedAt,
        kind: "sale",
        label: "Invoice issued",
        detail: invoice.invoiceNumber,
        amount: new Prisma.Decimal(invoice.total),
        href: `/invoices/${invoice.id}`,
      });
      for (const payment of invoice.payments) {
        const isRefund = payment.amount.isNegative();
        events.push({
          id: `invoice-payment-${payment.id}`,
          createdAt: payment.createdAt,
          kind: isRefund ? "refund" : "payment",
          label: isRefund ? "Refund" : "Payment received",
          detail: `${invoice.invoiceNumber} · ${payment.method.replaceAll("_", " ").toLowerCase()}${payment.reference ? ` · ${payment.reference}` : ""}`,
          amount: new Prisma.Decimal(payment.amount).negated(),
          href: `/invoices/${invoice.id}`,
        });
      }
    }
    for (const order of ordersRaw) {
      if (order.status === "CANCELLED" || order.invoices.length > 0) continue;
      events.push({
        id: `order-${order.id}`,
        createdAt: order.createdAt,
        kind: "sale",
        label: "Order placed",
        detail: order.orderNumber,
        amount: new Prisma.Decimal(order.total),
        href: `/orders/${order.id}`,
      });
      for (const payment of order.payments) {
        const isRefund = payment.amount.isNegative();
        events.push({
          id: `order-payment-${payment.id}`,
          createdAt: payment.createdAt,
          kind: isRefund ? "refund" : "payment",
          label: isRefund ? "Refund" : "Payment received",
          detail: `${order.orderNumber} · ${payment.method.replaceAll("_", " ").toLowerCase()}${payment.reference ? ` · ${payment.reference}` : ""}`,
          amount: new Prisma.Decimal(payment.amount).negated(),
          href: `/orders/${order.id}`,
        });
      }
    }

    const chronological = events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let balance = new Prisma.Decimal(0);
    let billed = new Prisma.Decimal(0);
    let collected = new Prisma.Decimal(0);
    let refunded = new Prisma.Decimal(0);
    const rows = chronological.map((event) => {
      balance = balance.plus(event.amount);
      if (event.kind === "sale") billed = billed.plus(event.amount);
      if (event.kind === "payment") collected = collected.plus(event.amount.abs());
      if (event.kind === "refund") refunded = refunded.plus(event.amount);
      return { ...event, balance: balance.toString(), amount: event.amount.toString(), createdAt: event.createdAt.toISOString() };
    }).reverse();
    accountStatement = {
      transactions: rows,
      billed: billed.toString(),
      collected: collected.toString(),
      refunded: refunded.toString(),
      balance: balance.toString(),
    };
  }

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
        accountStatement={accountStatement}
        fieldSections={fieldSections}
        fieldValues={fieldValues}
        vehicles={showVehicles ? vehicles : null}
        canAddVehicle={ctx.permissions.has("vehicles.create")}
        currencyCode={customer.organization.currencyCode}
        locale={customer.organization.locale}
        timezone={customer.organization.timezone}
        canAssign={ctx.permissions.has("customers.assign")}
        canEdit={ctx.permissions.has("customers.edit")}
      />
    </div>
  );
}
