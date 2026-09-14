"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { FilterBar, type FilterDefinition } from "@/components/data-table/filter-bar";
import { Badge } from "@/components/ui/feedback";
import { EmptyState } from "@/components/ui/feedback";
import { DropdownMenuItem } from "@/components/ui/menu";
import type { ListQuery, ListResult } from "@/lib/list-view/query";
import type { CustomerListRow } from "@/lib/customer/customer-list";

const STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "warning"> = {
  LEAD: "warning",
  ACTIVE: "success",
  INACTIVE: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  LEAD: "Lead",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: "Individual",
  BUSINESS: "Business",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function CustomersTable({
  rows,
  result,
  query,
  summary,
  filters,
  canEdit,
  customerNoun,
  createSlot,
}: {
  rows: CustomerListRow[];
  result: ListResult<unknown>;
  query: ListQuery;
  summary: string;
  filters: FilterDefinition[];
  canEdit: boolean;
  customerNoun: string;
  createSlot: React.ReactNode;
}) {
  const columns: DataTableColumn<CustomerListRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{row.name}</span>
          {row.companyName && row.companyName !== row.name && (
            <span className="truncate text-[12px] font-normal text-foreground-subtle">{row.companyName}</span>
          )}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (row) => <span className="text-foreground-muted">{TYPE_LABEL[row.type] ?? row.type}</span>,
    },
    {
      key: "contact",
      header: "Contact",
      cell: (row) => {
        const contact = [row.email, row.phone].filter(Boolean).join(" · ");
        return <span className="truncate text-foreground-muted">{contact || "—"}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (row) => <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{STATUS_LABEL[row.status] ?? row.status}</Badge>,
    },
    {
      key: "owner",
      header: "Owner",
      cell: (row) => <span className="truncate text-foreground-muted">{row.ownerName ?? "Unassigned"}</span>,
    },
    {
      key: "branch",
      header: "Branch",
      cell: (row) => <span className="truncate text-foreground-muted">{row.branchName ?? "—"}</span>,
    },
    {
      key: "lastActivityAt",
      header: "Last activity",
      cell: (row) => <span className="text-foreground-muted">{formatDate(row.lastActivityAt)}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      cell: (row) => <span className="text-foreground-muted">{formatDate(row.createdAt)}</span>,
    },
  ];

  const isFiltered = query.search !== "" || Object.keys(query.filters).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        query={query}
        pathname="/customers"
        filters={filters}
        searchPlaceholder={`Search ${customerNoun.toLowerCase()}…`}
      />

      <DataTable
        rows={rows}
        columns={columns}
        result={result}
        query={query}
        pathname="/customers"
        summary={summary}
        getRowId={(row) => row.id}
        getRowHref={(row) => `/customers/${row.id}`}
        rowActions={(row) => (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/customers/${row.id}`}>Open</Link>
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem asChild>
                <Link href={`/customers/${row.id}?edit=1`}>Edit</Link>
              </DropdownMenuItem>
            )}
          </>
        )}
        emptyState={
          isFiltered ? (
            <EmptyState
              icon={Users}
              title="No matches"
              description="No records match the current search and filters. Try clearing them to see everything."
              action={
                <Link href="/customers" className="text-[13px] font-medium text-accent hover:underline">
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title={`Your ${customerNoun.toLowerCase()} workspace is ready`}
              description={`Every order, invoice, note and task is tied back to a ${customerNoun.toLowerCase().replace(/s$/, "")}, so this is the best place to start.`}
              action={createSlot}
            />
          )
        }
      />
    </div>
  );
}
