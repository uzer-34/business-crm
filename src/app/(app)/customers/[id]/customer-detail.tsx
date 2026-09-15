"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Timeline } from "@/components/timeline/timeline";
import type { TimelineEvent } from "@/lib/activity/timeline";
import { tabsFor, toTabSlug, type Tab } from "./tabs";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { assignCustomerAction, editCustomerAction } from "@/lib/customer/actions";
import { addNoteAction } from "@/lib/customer/notes-actions";
import { createTaskAction, completeTaskAction } from "@/lib/customer/tasks-actions";
import { Alert } from "@/components/ui/feedback";
import {
  DynamicForm,
  DynamicFieldSummary,
  type DynamicSection,
  type DynamicValues,
} from "@/components/metadata/dynamic-form";
import { NewVehicleForm } from "@/app/(app)/vehicles/new-vehicle-form";

type Membership = { id: string; label: string };
type Note = { id: string; body: string; createdAt: string; authorName: string };
type Task = {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  dueAt: string | null;
  assignedToLabel: string | null;
};
type OrderSummary = { id: string; orderNumber: string; status: string; total: string };
type InvoiceSummary = { id: string; invoiceNumber: string; status: string; paymentStatus: string; total: string };
type CustomerSummary = {
  type: "INDIVIDUAL" | "BUSINESS";
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
};
type VehicleSummary = { id: string; make: string; model: string; year: number | null; plateNumber: string | null };


export function CustomerDetail({
  customerId,
  customer,
  assignedToId,
  members,
  notes,
  tasks,
  timeline,
  activeTab,
  orders,
  invoices,
  fieldSections,
  fieldValues,
  vehicles,
  canAddVehicle,
  currencyCode,
  locale,
  canAssign,
  canEdit,
}: {
  customerId: string;
  customer: CustomerSummary;
  assignedToId: string | null;
  members: Membership[];
  notes: Note[];
  tasks: Task[];
  timeline: TimelineEvent[];
  activeTab: Tab;
  orders: OrderSummary[];
  invoices: InvoiceSummary[];
  fieldSections: DynamicSection[];
  fieldValues: DynamicValues;
  vehicles: VehicleSummary[] | null;
  canAddVehicle: boolean;
  currencyCode: string;
  locale: string;
  canAssign: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const tab = activeTab;
  const TABS = tabsFor(vehicles !== null);

  return (
    <div className="flex flex-col gap-4">
      {/* Scrolls horizontally on narrow screens rather than wrapping into rows. */}
      <div className="-mx-3 overflow-x-auto border-b border-border px-3 sm:mx-0 sm:px-0">
        <div role="tablist" className="flex min-w-max gap-1">
          {TABS.map((candidate) => (
            <Link
              key={candidate}
              href={`/customers/${customerId}?tab=${toTabSlug(candidate)}`}
              role="tab"
              aria-selected={tab === candidate}
              scroll={false}
              className={`border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
                tab === candidate
                  ? "border-accent text-foreground"
                  : "border-transparent text-foreground-muted hover:text-foreground"
              }`}
            >
              {candidate}
            </Link>
          ))}
        </div>
      </div>

      {tab === "Overview" && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            {canAssign && (
              <div className="flex max-w-xs flex-col gap-1.5">
                <Label htmlFor="customer-owner">Assigned to</Label>
                <NativeSelect
                  id="customer-owner"
                  defaultValue={assignedToId ?? ""}
                  onChange={(event) => {
                    void assignCustomerAction(customerId, event.target.value || null).then(() => router.refresh());
                  }}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <CustomFieldsSection
              customerId={customerId}
              sections={fieldSections}
              initialValues={fieldValues}
              customer={customer}
              canEdit={canEdit}
            />
            <div>
              <h3 className="mb-3 text-[13px] font-semibold">Recent activity</h3>
              <Timeline events={timeline.slice(0, 5)} />
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "Activity" && (
        <Card>
          <CardContent>
            <Timeline events={timeline} />
          </CardContent>
        </Card>
      )}

      {tab === "Notes" && <NotesTab customerId={customerId} notes={notes} canEdit={canEdit} />}

      {tab === "Tasks" && <TasksTab customerId={customerId} tasks={tasks} canEdit={canEdit} />}

      {tab === "Orders" && (
        <OrdersTab customerId={customerId} orders={orders} currencyCode={currencyCode} locale={locale} />
      )}

      {tab === "Invoices" && <InvoicesTab invoices={invoices} currencyCode={currencyCode} locale={locale} />}

      {tab === "Vehicles" && vehicles !== null && (
        <VehiclesTab customerId={customerId} vehicles={vehicles} canAddVehicle={canAddVehicle} />
      )}
    </div>
  );
}

function VehiclesTab({
  customerId,
  vehicles,
  canAddVehicle,
}: {
  customerId: string;
  vehicles: VehicleSummary[];
  canAddVehicle: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {canAddVehicle && <NewVehicleForm customers={[]} fixedCustomerId={customerId} />}

      {vehicles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No vehicles on file.</p>
      ) : (
        <RevealOnScroll className="flex flex-col gap-2">
          {vehicles.map((vehicle) => (
            <Link key={vehicle.id} href={`/vehicles/${vehicle.id}`}>
              <Card>
                <CardContent className="flex items-center justify-between p-3">
                  <span className="text-sm font-medium">
                    {vehicle.make} {vehicle.model}
                    {vehicle.year && ` (${vehicle.year})`}
                  </span>
                  {vehicle.plateNumber && <span className="text-sm text-muted-foreground">{vehicle.plateNumber}</span>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}

function InvoicesTab({
  invoices,
  currencyCode,
  locale,
}: {
  invoices: InvoiceSummary[];
  currencyCode: string;
  locale: string;
}) {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode });

  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">No invoices yet — generate one from an order.</p>;
  }

  return (
    <RevealOnScroll className="flex flex-col gap-2">
      {invoices.map((invoice) => (
        <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
          <Card>
            <CardContent className="flex items-center justify-between p-3">
              <span className="text-sm font-medium">{invoice.invoiceNumber}</span>
              <span className="text-sm text-muted-foreground">
                {invoice.status === "VOID" ? "Void" : invoice.paymentStatus.replace("_", " ").toLowerCase()} ·{" "}
                {formatter.format(Number(invoice.total))}
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </RevealOnScroll>
  );
}

function OrdersTab({
  customerId,
  orders,
  currencyCode,
  locale,
}: {
  customerId: string;
  orders: OrderSummary[];
  currencyCode: string;
  locale: string;
}) {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/orders/new?customerId=${customerId}`}
        className="inline-flex h-9 w-fit items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        New order
      </Link>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <RevealOnScroll className="flex flex-col gap-2">
          {orders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <Card>
                <CardContent className="flex items-center justify-between p-3">
                  <span className="text-sm font-medium">{order.orderNumber}</span>
                  <span className="text-sm text-muted-foreground">
                    {order.status.replace("_", " ").toLowerCase()} · {formatter.format(Number(order.total))}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}

/**
 * Configured customer attributes, rendered by the metadata engine and saved
 * through editCustomerAction so the same server-side validation applies here
 * as on the create form.
 */
function CustomFieldsSection({
  customerId,
  sections,
  initialValues,
  customer,
  canEdit,
}: {
  customerId: string;
  sections: DynamicSection[];
  initialValues: DynamicValues;
  customer: { type: "INDIVIDUAL" | "BUSINESS"; name: string; email: string | null; phone: string | null; status: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<DynamicValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (sections.length === 0) return null;

  if (!canEdit) {
    return (
      <div className="border-t border-border pt-4">
        <DynamicFieldSummary sections={sections} values={values} />
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await editCustomerAction(
            customerId,
            {
              type: customer.type,
              name: customer.name,
              email: customer.email ?? "",
              phone: customer.phone ?? "",
              status: customer.status,
              tags: [],
            },
            values,
          );
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <DynamicForm
        sections={sections}
        values={values}
        onChange={(fieldId, value) => {
          setSaved(false);
          setValues((previous) => ({ ...previous, [fieldId]: value }));
        }}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={isPending}>
          {isPending ? "Saving…" : "Save details"}
        </Button>
        {saved && <span className="text-[12px] text-success">Saved</span>}
      </div>
    </form>
  );
}

function NotesTab({ customerId, notes, canEdit }: { customerId: string; notes: Note[]; canEdit: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await addNoteAction(customerId, { body });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setBody("");
              router.refresh();
            });
          }}
        >
          <textarea
            className="min-h-20 rounded-md border border-border bg-card p-3 text-sm"
            placeholder="Add a note…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" size="sm" className="self-end" disabled={isPending || !body.trim()}>
            {isPending ? "Saving…" : "Add note"}
          </Button>
        </form>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="p-3">
                <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {note.authorName} · {new Date(note.createdAt).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}

function TasksTab({ customerId, tasks, canEdit }: { customerId: string; tasks: Task[]; canEdit: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await createTaskAction(customerId, {
                title,
                dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setTitle("");
              setDueAt("");
              router.refresh();
            });
          }}
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium">New task</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up call" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Due</label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <Button type="submit" disabled={isPending || !title.trim()}>
            {isPending ? "Adding…" : "Add task"}
          </Button>
        </form>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <RevealOnScroll className="flex flex-col gap-2">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex items-center justify-between p-3">
                <div>
                  <p className={`text-sm ${task.status === "DONE" ? "text-muted-foreground line-through" : ""}`}>
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {task.assignedToLabel ?? "Unassigned"}
                    {task.dueAt && ` · Due ${new Date(task.dueAt).toLocaleString()}`}
                  </p>
                </div>
                {task.status === "OPEN" && canEdit && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void completeTaskAction(task.id).then(() => router.refresh());
                    }}
                  >
                    Mark done
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}
