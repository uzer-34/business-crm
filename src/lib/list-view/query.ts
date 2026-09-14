/*
 * List view engine — URL <-> query translation.
 *
 * List state (search, filters, sort, page) lives entirely in the URL so every
 * view is shareable, refreshable and back-button correct, and so the page can
 * stay a Server Component that reads searchParams and queries once. These are
 * pure functions with no Prisma or React dependency; each list screen supplies
 * a config naming what is sortable and filterable, and anything outside that
 * allowlist is ignored rather than trusted.
 */

export type SortDirection = "asc" | "desc";

export interface ListQuery {
  page: number;
  pageSize: number;
  sort: string | null;
  dir: SortDirection;
  search: string;
  filters: Record<string, string>;
}

export interface ListQueryConfig {
  sortableKeys: readonly string[];
  filterKeys: readonly string[];
  defaultSort: string;
  defaultDirection?: SortDirection;
  defaultPageSize?: number;
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Next's searchParams values; a repeated key arrives as an array. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function toPositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseListQuery(params: RawSearchParams, config: ListQueryConfig): ListQuery {
  const requestedSort = single(params.sort);
  const sort = config.sortableKeys.includes(requestedSort) ? requestedSort : config.defaultSort;

  const requestedDir = single(params.dir);
  const dir: SortDirection =
    requestedDir === "asc" || requestedDir === "desc" ? requestedDir : (config.defaultDirection ?? "desc");

  const filters: Record<string, string> = {};
  for (const key of config.filterKeys) {
    const value = single(params[key]).trim();
    if (value) filters[key] = value;
  }

  const pageSize = Math.min(toPositiveInt(single(params.pageSize), config.defaultPageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  return {
    page: toPositiveInt(single(params.page), 1),
    pageSize,
    sort,
    dir,
    search: single(params.q).trim(),
    filters,
  };
}

/** Prisma `skip`/`take` for the requested page. */
export function toPrismaPagination(query: ListQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export interface ListResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** 1-based index of the first row shown; 0 when the result is empty. */
  from: number;
  to: number;
}

export function buildListResult<T>(rows: T[], total: number, query: ListQuery): ListResult<T> {
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const from = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;

  return {
    rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount,
    from,
    to: Math.min(query.page * query.pageSize, total),
  };
}

/**
 * Produces the querystring for a modified view. Any change other than paging
 * resets to page 1, since staying on page 7 of a result set that just shrank
 * strands the user on an empty page.
 */
export function buildListHref(
  pathname: string,
  query: ListQuery,
  changes: Partial<Pick<ListQuery, "page" | "pageSize" | "sort" | "dir" | "search">> & {
    filters?: Record<string, string | null>;
  },
): string {
  const next = { ...query, filters: { ...query.filters } };

  if (changes.filters) {
    for (const [key, value] of Object.entries(changes.filters)) {
      if (value === null || value === "") delete next.filters[key];
      else next.filters[key] = value;
    }
  }

  if (changes.search !== undefined) next.search = changes.search;
  if (changes.sort !== undefined) next.sort = changes.sort;
  if (changes.dir !== undefined) next.dir = changes.dir;
  if (changes.pageSize !== undefined) next.pageSize = changes.pageSize;

  const onlyPaging = changes.page !== undefined && Object.keys(changes).length === 1;
  next.page = onlyPaging ? (changes.page ?? 1) : 1;

  const params = new URLSearchParams();
  if (next.search) params.set("q", next.search);
  for (const [key, value] of Object.entries(next.filters)) {
    if (value) params.set(key, value);
  }
  if (next.sort) params.set("sort", next.sort);
  if (next.dir) params.set("dir", next.dir);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(next.pageSize));

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** Clicking the active sort column flips direction; a new column starts ascending. */
export function nextSortDirection(query: ListQuery, columnKey: string): SortDirection {
  if (query.sort !== columnKey) return "asc";
  return query.dir === "asc" ? "desc" : "asc";
}

/**
 * Human summary of the current view, e.g.
 * "12 customers · filtered by Status · sorted by Name". Mirrors what mature
 * CRMs put above the table so the user can always tell what they are looking at.
 */
export function describeListView({
  total,
  noun,
  pluralNoun,
  sortLabel,
  filterLabels,
  search,
}: {
  total: number;
  noun: string;
  pluralNoun: string;
  sortLabel?: string | null;
  filterLabels?: string[];
  search?: string;
}): string {
  const parts = [`${total} ${total === 1 ? noun : pluralNoun}`];
  if (search) parts.push(`matching “${search}”`);
  if (filterLabels && filterLabels.length > 0) parts.push(`filtered by ${filterLabels.join(", ")}`);
  if (sortLabel) parts.push(`sorted by ${sortLabel}`);
  return parts.join(" · ");
}
