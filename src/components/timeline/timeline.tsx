import {
  Archive,
  CircleDot,
  FileText,
  Pencil,
  ShoppingCart,
  StickyNote,
  UserPlus,
  CheckSquare,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import type { TimelineEvent } from "@/lib/activity/timeline";

/**
 * Maps an event type to an icon. Anything unrecognized falls back to a neutral
 * dot rather than being hidden — an event the UI doesn't know about is still a
 * real thing that happened.
 */
const EVENT_ICONS: Record<string, LucideIcon> = {
  "customer.created": UserPlus,
  "customer.updated": Pencil,
  "customer.assigned": UserPlus,
  "customer.archived": Archive,
  "note.added": StickyNote,
  "task.created": CheckSquare,
  "task.completed": CheckSquare,
  "order.created": ShoppingCart,
  "order.cancelled": ShoppingCart,
  "invoice.issued": FileText,
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Timeline({ events, emptyDescription }: { events: TimelineEvent[]; emptyDescription?: string }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={CircleDot}
        title="Nothing has happened yet"
        description={emptyDescription ?? "Activity will appear here as work happens on this record."}
      />
    );
  }

  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const Icon = EVENT_ICONS[event.type] ?? CircleDot;
        const isLast = index === events.length - 1;

        return (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
                <Icon className="size-3.5 text-foreground-subtle" aria-hidden="true" />
              </span>
              {/* Connector is omitted on the last item so the line doesn't dangle. */}
              {!isLast && <span className="w-px flex-1 bg-border" aria-hidden="true" />}
            </div>
            <div className={isLast ? "pb-0" : "pb-4"}>
              <p className="text-[13px] text-foreground">{event.summary}</p>
              <p className="mt-0.5 text-[12px] text-foreground-subtle">
                {formatWhen(event.createdAt)}
                {event.actorName && ` · ${event.actorName}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
