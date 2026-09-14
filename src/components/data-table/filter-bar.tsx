"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { buildListHref, type ListQuery } from "@/lib/list-view/query";
import { cn } from "@/lib/utils";

export interface FilterDefinition {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Search + filter controls for a list view.
 *
 * Every control writes to the URL, which is the single source of list state —
 * the server re-queries on navigation, so there is no client-side copy of the
 * data to keep in sync. Search is submitted rather than debounced-on-keystroke
 * so a slow connection can't fire a request per character.
 */
export function FilterBar({
  query,
  pathname,
  filters,
  searchPlaceholder = "Search…",
  children,
}: {
  query: ListQuery;
  pathname: string;
  filters: FilterDefinition[];
  searchPlaceholder?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [searchValue, setSearchValue] = React.useState(query.search);

  // Keep the field in step when the URL changes from elsewhere (clearing a
  // filter, following a link, browser back), adjusted during render rather
  // than in an effect so the input never shows a stale value for a frame.
  const [previousSearch, setPreviousSearch] = React.useState(query.search);
  if (previousSearch !== query.search) {
    setPreviousSearch(query.search);
    setSearchValue(query.search);
  }

  const activeFilters = filters.filter((filter) => query.filters[filter.key]);
  const hasActiveView = activeFilters.length > 0 || query.search !== "";

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(buildListHref(pathname, query, { search: searchValue.trim() }));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Full width on its own row below sm; a filter row that also holds the
            search box squeezes it to a couple of characters at 320px. */}
        <form onSubmit={submitSearch} className="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </form>

        {filters.map((filter) => (
          <NativeSelect
            key={filter.key}
            aria-label={filter.label}
            value={query.filters[filter.key] ?? ""}
            onChange={(event) => {
              router.push(buildListHref(pathname, query, { filters: { [filter.key]: event.target.value || null } }));
            }}
            className={cn("w-auto min-w-0 max-w-[10rem]", query.filters[filter.key] && "border-accent text-accent")}
          >
            <option value="">{filter.label}: All</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        ))}

        {children}
      </div>

      {hasActiveView && (
        <div className="flex flex-wrap items-center gap-1.5">
          {query.search && (
            <FilterChip
              label={`“${query.search}”`}
              href={buildListHref(pathname, query, { search: "" })}
              removeLabel="Clear search"
            />
          )}
          {activeFilters.map((filter) => {
            const value = query.filters[filter.key];
            const option = filter.options.find((candidate) => candidate.value === value);
            return (
              <FilterChip
                key={filter.key}
                label={`${filter.label}: ${option?.label ?? value}`}
                href={buildListHref(pathname, query, { filters: { [filter.key]: null } })}
                removeLabel={`Clear ${filter.label} filter`}
              />
            );
          })}
          <Button variant="ghost" size="sm" asChild>
            <Link href={pathname}>Clear all</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, href, removeLabel }: { label: string; href: string; removeLabel: string }) {
  return (
    <Link
      href={href}
      aria-label={removeLabel}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[12px] text-foreground-muted hover:text-foreground"
    >
      {label}
      <X className="size-3" aria-hidden="true" />
    </Link>
  );
}
