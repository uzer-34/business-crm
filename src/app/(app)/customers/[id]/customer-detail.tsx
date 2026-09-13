"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { assignCustomerAction } from "@/lib/customer/actions";
import { addNoteAction } from "@/lib/customer/notes-actions";
import { createTaskAction, completeTaskAction } from "@/lib/customer/tasks-actions";

type Membership = { id: string; label: string };
type Note = { id: string; body: string; createdAt: string; authorName: string };
type Task = {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  dueAt: string | null;
  assignedToLabel: string | null;
};
type ActivityItem = { id: string; type: string; createdAt: string; actorName: string | null; summary: string };
type OrderSummary = { id: string; orderNumber: string; status: string; total: string };
type InvoiceSummary = { id: string; invoiceNumber: string; status: string; paymentStatus: string; total: string };

const TABS = ["Overview", "Activity", "Notes", "Tasks", "Orders", "Invoices"] as const;
type Tab = (typeof TABS)[number];

export function CustomerDetail({
  customerId,
  assignedToId,
  members,
  notes,
  tasks,
  activities,
  orders,
  invoices,
  currencyCode,
  locale,
  canAssign,
  canEdit,
}: {
  customerId: string;
  assignedToId: string | null;
  members: Membership[];
  notes: Note[];
  tasks: Task[];
  activities: ActivityItem[];
  orders: OrderSummary[];
  invoices: InvoiceSummary[];
  currencyCode: string;
  locale: string;
  canAssign: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            {canAssign && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Assigned to</label>
                <select
                  className="h-10 max-w-xs rounded-md border border-border bg-card px-3 text-sm"
                  defaultValue={assignedToId ?? ""}
                  onChange={(e) => {
                    void assignCustomerAction(customerId, e.target.value || null).then(() => router.refresh());
                  }}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <RecentActivity activities={activities.slice(0, 5)} />
          </CardContent>
        </Card>
      )}

      {tab === "Activity" && (
        <Card>
          <CardContent className="p-4">
            <RecentActivity activities={activities} />
          </CardContent>
        </Card>
      )}

      {tab === "Notes" && <NotesTab customerId={customerId} notes={notes} canEdit={canEdit} />}

      {tab === "Tasks" && <TasksTab customerId={customerId} tasks={tasks} canEdit={canEdit} />}

      {tab === "Orders" && (
        <OrdersTab customerId={customerId} orders={orders} currencyCode={currencyCode} locale={locale} />
      )}

      {tab === "Invoices" && <InvoicesTab invoices={invoices} currencyCode={currencyCode} locale={locale} />}
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

function RecentActivity({ activities }: { activities: ActivityItem[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <RevealOnScroll className="flex flex-col gap-3">
      {activities.map((item) => (
        <div key={item.id} className="flex gap-3 text-sm">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <div>
            <p>{item.summary}</p>
            <p className="text-xs text-muted-foreground">
              {item.actorName ?? "System"} · {new Date(item.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </RevealOnScroll>
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
