import { describe, expect, it } from "vitest";
import {
  buildListHref,
  buildListResult,
  describeListView,
  nextSortDirection,
  parseListQuery,
  toPrismaPagination,
  type ListQueryConfig,
} from "@/lib/list-view/query";

const config: ListQueryConfig = {
  sortableKeys: ["name", "createdAt"],
  filterKeys: ["status", "type"],
  defaultSort: "createdAt",
  defaultDirection: "desc",
};

describe("parseListQuery", () => {
  it("falls back to defaults when nothing is supplied", () => {
    const query = parseListQuery({}, config);

    expect(query).toEqual({ page: 1, pageSize: 25, sort: "createdAt", dir: "desc", search: "", filters: {} });
  });

  it("ignores a sort key that is not in the allowlist", () => {
    expect(parseListQuery({ sort: "password" }, config).sort).toBe("createdAt");
  });

  it("ignores a filter key that is not in the allowlist", () => {
    const query = parseListQuery({ status: "LEAD", organizationId: "other-org" }, config);

    expect(query.filters).toEqual({ status: "LEAD" });
  });

  it("ignores a direction that is not asc or desc", () => {
    expect(parseListQuery({ dir: "; DROP TABLE" }, config).dir).toBe("desc");
  });

  it("rejects non-positive or non-numeric pages", () => {
    expect(parseListQuery({ page: "0" }, config).page).toBe(1);
    expect(parseListQuery({ page: "-3" }, config).page).toBe(1);
    expect(parseListQuery({ page: "abc" }, config).page).toBe(1);
  });

  it("caps page size so a caller cannot request the whole table", () => {
    expect(parseListQuery({ pageSize: "5000" }, config).pageSize).toBe(100);
  });

  it("takes the first value when a key is repeated", () => {
    expect(parseListQuery({ status: ["LEAD", "ACTIVE"] }, config).filters.status).toBe("LEAD");
  });

  it("trims the search term and drops blank filters", () => {
    const query = parseListQuery({ q: "  acme  ", status: "   " }, config);

    expect(query.search).toBe("acme");
    expect(query.filters).toEqual({});
  });
});

describe("pagination", () => {
  it("translates a page into skip/take", () => {
    expect(toPrismaPagination(parseListQuery({ page: "3", pageSize: "25" }, config))).toEqual({ skip: 50, take: 25 });
  });

  it("reports an accurate range for a middle page", () => {
    const result = buildListResult([1, 2, 3], 57, parseListQuery({ page: "2", pageSize: "25" }, config));

    expect(result).toMatchObject({ page: 2, pageCount: 3, from: 26, to: 50, total: 57 });
  });

  it("clamps the end of the range on the final page", () => {
    const result = buildListResult([1, 2], 27, parseListQuery({ page: "2", pageSize: "25" }, config));

    expect(result.to).toBe(27);
  });

  it("reports a zero range and a single page when empty", () => {
    const result = buildListResult([], 0, parseListQuery({}, config));

    expect(result).toMatchObject({ from: 0, to: 0, pageCount: 1 });
  });
});

describe("buildListHref", () => {
  const query = parseListQuery({ q: "acme", status: "LEAD", page: "4" }, config);

  it("keeps the page when only paging", () => {
    expect(buildListHref("/customers", query, { page: 2 })).toBe("/customers?q=acme&status=LEAD&sort=createdAt&dir=desc&page=2");
  });

  it("resets to page 1 when the result set changes", () => {
    expect(buildListHref("/customers", query, { search: "beta" })).not.toContain("page=");
  });

  it("removes a filter when set to null", () => {
    expect(buildListHref("/customers", query, { filters: { status: null } })).not.toContain("status=");
  });

  it("returns a bare path when nothing is active", () => {
    const empty = parseListQuery({}, config);
    expect(buildListHref("/customers", empty, { filters: {} })).toBe("/customers?sort=createdAt&dir=desc");
  });
});

describe("nextSortDirection", () => {
  it("starts a new column ascending", () => {
    expect(nextSortDirection(parseListQuery({}, config), "name")).toBe("asc");
  });

  it("flips the active column", () => {
    const ascending = parseListQuery({ sort: "name", dir: "asc" }, config);
    expect(nextSortDirection(ascending, "name")).toBe("desc");
  });
});

describe("describeListView", () => {
  it("uses the singular noun for exactly one result", () => {
    expect(describeListView({ total: 1, noun: "customer", pluralNoun: "customers" })).toBe("1 customer");
  });

  it("states the search, filters and sort applied", () => {
    const summary = describeListView({
      total: 12,
      noun: "customer",
      pluralNoun: "customers",
      search: "acme",
      filterLabels: ["Status"],
      sortLabel: "Name",
    });

    expect(summary).toBe("12 customers · matching “acme” · filtered by Status · sorted by Name");
  });
});
