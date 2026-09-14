"use client";

import { ScrollText } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { FilterBar, type FilterDefinition } from "@/components/data-table/filter-bar";
import { Badge, EmptyState } from "@/components/ui/feedback";
import type { ListQuery, ListResult } from "@/lib/list-view/query";
import type { AuditListRow } from "@/lib/audit/audit-list";

/** "customer.archived" -> "Customer archived" — the log is read by owners, not developers. */
function humanizeAction(action: string): string {
  const [subject, ...rest] = action.split(".");
  const verb = rest.join(" ").replace(/_/g, " ");
  const label = `${subject} ${verb}`.trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function actionTone(action: string): "neutral" | "success" | "warning" | "danger" {
  if (action.includes("archived") || action.includes("deleted") || action.includes("void")) return "danger";
  if (action.includes("created")) return "success";
  if (action.includes("updated") || action.includes("changed") || action.includes("assigned")) return "warning";
  return "neutral";
}

export function AuditTable({
  rows,
  result,
  query,
  summary,
  filters,
}: {
  rows: AuditListRow[];
  result: ListResult<unknown>;
  query: ListQuery;
  summary: string;
  filters: FilterDefinition[];
}) {
  const columns: DataTableColumn<AuditListRow>[] = [
    {
      key: "action",
      header: "Event",
      alwaysVisible: true,
      cell: (row) => <Badge tone={actionTone(row.action)}>{humanizeAction(row.action)}</Badge>,
    },
    { key: "actorName", header: "Who", cell: (row) => <span className="truncate">{row.actorName}</span> },
    {
      key: "targetType",
      header: "Record",
      cell: (row) => <span className="text-foreground-muted">{row.targetType ?? "—"}</span>,
    },
    {
      key: "createdAt",
      header: "When",
      sortable: true,
      cell: (row) => <span className="text-foreground-muted">{new Date(row.createdAt).toLocaleString()}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <FilterBar query={query} pathname="/audit-log" filters={filters} searchPlaceholder="Search events…" />
      <DataTable
        rows={rows}
        columns={columns}
        result={result}
        query={query}
        pathname="/audit-log"
        summary={summary}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState
            icon={ScrollText}
            title="No matching events"
            description="The audit log records sign-ins, permission changes, configuration edits and record changes as they happen."
          />
        }
      />
    </div>
  );
}
