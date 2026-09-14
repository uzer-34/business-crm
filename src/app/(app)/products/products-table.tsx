"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { FilterBar, type FilterDefinition } from "@/components/data-table/filter-bar";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { DropdownMenuItem } from "@/components/ui/menu";
import { formatMoney } from "@/lib/format";
import type { ListQuery, ListResult } from "@/lib/list-view/query";
import type { ProductListRow } from "@/lib/catalog/product-list";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ProductsTable({
  rows,
  result,
  query,
  summary,
  filters,
  currencyCode,
  locale,
  canEdit,
  createSlot,
}: {
  rows: ProductListRow[];
  result: ListResult<unknown>;
  query: ListQuery;
  summary: string;
  filters: FilterDefinition[];
  currencyCode: string;
  locale: string;
  canEdit: boolean;
  createSlot: React.ReactNode;
}) {
  const columns: DataTableColumn<ProductListRow>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      alwaysVisible: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{row.name}</span>
          {row.brand && <span className="truncate text-[12px] font-normal text-foreground-subtle">{row.brand}</span>}
        </span>
      ),
    },
    { key: "sku", header: "SKU", sortable: true, cell: (row) => <span className="tabular text-foreground-muted">{row.sku}</span> },
    {
      key: "categoryName",
      header: "Category",
      cell: (row) => <span className="truncate text-foreground-muted">{row.categoryName ?? "Uncategorized"}</span>,
    },
    {
      key: "sellingPrice",
      header: "Price",
      sortable: true,
      align: "right",
      cell: (row) => formatMoney(row.sellingPrice, currencyCode, locale),
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      cell: (row) => {
        // A reorder point is optional, so "low" is only ever shown for a
        // product whose owner actually set a threshold.
        const low = row.reorderPoint !== null && row.stockQuantity <= row.reorderPoint;
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="tabular">
              {row.stockQuantity} {row.unit}
            </span>
            {low && <Badge tone="danger">Low</Badge>}
          </span>
        );
      },
    },
    {
      key: "variantCount",
      header: "Variants",
      align: "right",
      cell: (row) => <span className="tabular text-foreground-muted">{row.variantCount || "—"}</span>,
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
      <FilterBar query={query} pathname="/products" filters={filters} searchPlaceholder="Search name, SKU, barcode…" />

      <DataTable
        rows={rows}
        columns={columns}
        result={result}
        query={query}
        pathname="/products"
        summary={summary}
        getRowId={(row) => row.id}
        getRowHref={(row) => `/products/${row.id}`}
        rowActions={(row) => (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/products/${row.id}`}>Open</Link>
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem asChild>
                <Link href={`/products/${row.id}?edit=1`}>Edit</Link>
              </DropdownMenuItem>
            )}
          </>
        )}
        emptyState={
          isFiltered ? (
            <EmptyState
              icon={Package}
              title="No matches"
              description="No products match the current search and filters."
              action={
                <Link href="/products" className="text-[13px] font-medium text-accent hover:underline">
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Package}
              title="No products yet"
              description="Add your first product to start managing your catalog, pricing and stock."
              action={createSlot}
            />
          )
        }
      />
    </div>
  );
}
