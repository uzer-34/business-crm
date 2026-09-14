"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, MoreHorizontal } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { buildListHref, nextSortDirection, type ListQuery, type ListResult } from "@/lib/list-view/query";
import { cn } from "@/lib/utils";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  /** Enables the sort control; the key must be in the page's sortableKeys. */
  sortable?: boolean;
  /** Rendered in both the desktop cell and the mobile card. */
  cell: (row: Row) => React.ReactNode;
  /** Shown on the mobile card even when the column is collapsed. */
  primary?: boolean;
  /** Excluded from the column-visibility menu (e.g. the name column). */
  alwaysVisible?: boolean;
  align?: "left" | "right";
  className?: string;
}

export interface DataTableProps<Row> {
  rows: Row[];
  columns: DataTableColumn<Row>[];
  result: ListResult<unknown>;
  query: ListQuery;
  pathname: string;
  getRowId: (row: Row) => string;
  getRowHref?: (row: Row) => string;
  rowActions?: (row: Row) => React.ReactNode;
  /** Rendered above the table when rows exist and something is selected. */
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;
  emptyState: React.ReactNode;
  /** Sentence describing the current view, shown above the table. */
  summary?: string;
}

/**
 * One table implementation for every list screen.
 *
 * Sorting, paging and filtering are links that change the URL — the server
 * re-queries, so the table never holds a second copy of the data or paginates
 * client-side. Only selection and column visibility are local state, since
 * neither needs to survive a reload.
 *
 * Below `md` the same rows render as cards: a 12-column table squeezed into
 * 320px is unusable, so the layout changes rather than the data.
 */
export function DataTable<Row>({
  rows,
  columns,
  result,
  query,
  pathname,
  getRowId,
  getRowHref,
  rowActions,
  bulkActions,
  emptyState,
  summary,
}: DataTableProps<Row>) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  // Paging or filtering swaps the underlying rows, so a stale selection would
  // apply bulk actions to records no longer on screen. Adjusted during render
  // (React's documented pattern for derived state) rather than in an effect,
  // which would render once with the wrong selection before correcting it.
  const rowIdsKey = rows.map(getRowId).join(",");
  const [previousRowIdsKey, setPreviousRowIdsKey] = React.useState(rowIdsKey);
  if (previousRowIdsKey !== rowIdsKey) {
    setPreviousRowIdsKey(rowIdsKey);
    setSelected(new Set());
  }

  const visibleColumns = columns.filter((column) => !hidden.has(column.key));
  const hideableColumns = columns.filter((column) => !column.alwaysVisible);
  const selectable = Boolean(bulkActions);

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(getRowId(row)));
  const someSelected = rows.some((row) => selected.has(getRowId(row)));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map(getRowId)));
  };

  const toggleRow = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {summary && <p className="text-[12px] text-foreground-muted">{summary}</p>}
        {hideableColumns.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto hidden md:inline-flex">
                <Columns3 className="size-4" aria-hidden="true" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {hideableColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={!hidden.has(column.key)}
                  onCheckedChange={(checked) => {
                    setHidden((current) => {
                      const next = new Set(current);
                      if (checked) next.delete(column.key);
                      else next.add(column.key);
                      return next;
                    });
                  }}
                  onSelect={(event) => event.preventDefault()}
                >
                  {column.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {selectable && someSelected && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-accent-subtle px-3 py-2">
          <span className="text-[13px] font-medium text-accent-subtle-foreground">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            {bulkActions?.(Array.from(selected), () => setSelected(new Set()))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">{emptyState}</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-lg border border-border bg-surface md:block">
            <TableWrapper>
              <Table>
                <THead>
                  <tr>
                    {selectable && (
                      <TH className="w-10">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={toggleAll}
                          aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                        />
                      </TH>
                    )}
                    {visibleColumns.map((column) => (
                      <TH key={column.key} className={cn(column.align === "right" && "text-right", column.className)}>
                        {column.sortable ? (
                          <SortLink column={column} query={query} pathname={pathname} />
                        ) : (
                          column.header
                        )}
                      </TH>
                    ))}
                    {rowActions && <TH className="w-12" />}
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => {
                    const id = getRowId(row);
                    const href = getRowHref?.(row);
                    return (
                      <TR key={id} className={cn(selected.has(id) && "bg-selected")}>
                        {selectable && (
                          <TD>
                            <Checkbox
                              checked={selected.has(id)}
                              onCheckedChange={() => toggleRow(id)}
                              aria-label={`Select row ${id}`}
                            />
                          </TD>
                        )}
                        {visibleColumns.map((column, index) => (
                          <TD
                            key={column.key}
                            className={cn(column.align === "right" && "text-right tabular", column.className)}
                          >
                            {/*
                              Only the first cell links, so the row is reachable
                              in one tab stop instead of one per column.
                            */}
                            {index === 0 && href ? (
                              <Link href={href} className="font-medium text-foreground hover:underline">
                                {column.cell(row)}
                              </Link>
                            ) : (
                              column.cell(row)
                            )}
                          </TD>
                        ))}
                        {rowActions && (
                          <TD className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton label="Row actions" size="icon-sm">
                                  <MoreHorizontal className="size-4" aria-hidden="true" />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">{rowActions(row)}</DropdownMenuContent>
                            </DropdownMenu>
                          </TD>
                        )}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrapper>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => {
              const id = getRowId(row);
              const href = getRowHref?.(row);
              const [first, ...rest] = visibleColumns;
              const detailColumns = rest.filter((column) => column.primary !== false);

              return (
                <li key={id} className="rounded-lg border border-border bg-surface">
                  <div className="flex items-start gap-2 p-3">
                    {selectable && (
                      <Checkbox
                        checked={selected.has(id)}
                        onCheckedChange={() => toggleRow(id)}
                        aria-label={`Select row ${id}`}
                        className="mt-0.5"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {href ? (
                          <Link href={href} className="hover:underline">
                            {first?.cell(row)}
                          </Link>
                        ) : (
                          first?.cell(row)
                        )}
                      </div>
                      <dl className="mt-1.5 flex flex-col gap-1">
                        {detailColumns.map((column) => (
                          <div key={column.key} className="flex items-baseline justify-between gap-3 text-[12px]">
                            <dt className="shrink-0 text-foreground-subtle">{column.header}</dt>
                            <dd className="min-w-0 truncate text-right text-foreground">{column.cell(row)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    {rowActions && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton label="Row actions" size="icon-sm">
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">{rowActions(row)}</DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination result={result} query={query} pathname={pathname} />
        </>
      )}
    </div>
  );
}

function SortLink<Row>({
  column,
  query,
  pathname,
}: {
  column: DataTableColumn<Row>;
  query: ListQuery;
  pathname: string;
}) {
  const active = query.sort === column.key;
  const direction = nextSortDirection(query, column.key);
  const Icon = !active ? ChevronsUpDown : query.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <Link
      href={buildListHref(pathname, query, { sort: column.key, dir: direction })}
      aria-label={`Sort by ${column.header}, ${direction}ending`}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
        active && "text-foreground",
      )}
    >
      {column.header}
      <Icon className="size-3" aria-hidden="true" />
    </Link>
  );
}

export function Pagination({
  result,
  query,
  pathname,
}: {
  result: ListResult<unknown>;
  query: ListQuery;
  pathname: string;
}) {
  if (result.total === 0) return null;

  const hasPrevious = result.page > 1;
  const hasNext = result.page < result.pageCount;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
    >
      <p className="text-[12px] text-foreground-muted">
        <span className="tabular">
          {result.from}–{result.to}
        </span>{" "}
        of <span className="tabular">{result.total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" asChild={hasPrevious} disabled={!hasPrevious}>
          {hasPrevious ? (
            <Link href={buildListHref(pathname, query, { page: result.page - 1 })}>Previous</Link>
          ) : (
            <span>Previous</span>
          )}
        </Button>
        <span className="tabular px-1 text-[12px] text-foreground-muted">
          {result.page} / {result.pageCount}
        </span>
        <Button variant="outline" size="sm" asChild={hasNext} disabled={!hasNext}>
          {hasNext ? <Link href={buildListHref(pathname, query, { page: result.page + 1 })}>Next</Link> : <span>Next</span>}
        </Button>
      </div>
    </nav>
  );
}
