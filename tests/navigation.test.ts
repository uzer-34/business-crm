import { describe, expect, it } from "vitest";
import {
  buildMobilePrimaryNav,
  buildNavigation,
  findActiveModuleKey,
  getVisibleModules,
  type NavigationContext,
} from "@/lib/navigation/build";
import { buildCreateActions } from "@/lib/navigation/create-actions";

function context(permissions: string[], industryKey = "generic"): NavigationContext {
  return { permissions: new Set(permissions), industryKey };
}

describe("permission-aware navigation", () => {
  it("hides modules the member has no permission for", () => {
    const keys = getVisibleModules(context(["customers.view"])).map((module) => module.key);

    expect(keys).toContain("customers");
    expect(keys).not.toContain("invoices");
    expect(keys).not.toContain("employees");
    expect(keys).not.toContain("audit-log");
  });

  it("always shows modules that declare no permissions", () => {
    const keys = getVisibleModules(context([])).map((module) => module.key);

    expect(keys).toEqual(["dashboard", "settings"]);
  });

  it("shows a module when the member holds any one of its permissions", () => {
    const salesOnly = getVisibleModules(context(["reports.sales"])).map((module) => module.key);
    const financialOnly = getVisibleModules(context(["reports.financial"])).map((module) => module.key);

    expect(salesOnly).toContain("reports");
    expect(financialOnly).toContain("reports");
  });

  it("gates vehicles on the industry, not only the permission", () => {
    const generic = getVisibleModules(context(["vehicles.view"], "generic")).map((module) => module.key);
    const workshop = getVisibleModules(context(["vehicles.view"], "automobile_workshop")).map((module) => module.key);

    expect(generic).not.toContain("vehicles");
    expect(workshop).toContain("vehicles");
  });

  it("drops groups that end up empty instead of rendering a bare heading", () => {
    const groups = buildNavigation(context(["customers.view"]));
    const groupKeys = groups.map((group) => group.key);

    expect(groupKeys).toContain("relationships");
    expect(groupKeys).not.toContain("sales");
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
  });

  it("applies industry terminology to module labels", () => {
    const workshop = buildNavigation(context(["sales.view"], "automobile_workshop"));
    const orders = workshop.flatMap((group) => group.items).find((item) => item.key === "orders");

    expect(orders?.label).toBe("Job Cards");
  });
});

describe("mobile primary navigation", () => {
  it("never exceeds four items so the bar plus More fits five slots", () => {
    const all = buildMobilePrimaryNav(
      context(["customers.view", "sales.view", "tasks.view", "invoices.view", "products.view"]),
    );

    expect(all.length).toBeLessThanOrEqual(4);
  });

  it("omits destinations the member cannot reach rather than disabling them", () => {
    const items = buildMobilePrimaryNav(context(["customers.view"])).map((item) => item.key);

    expect(items).toContain("dashboard");
    expect(items).toContain("customers");
    expect(items).not.toContain("orders");
    expect(items).not.toContain("tasks");
  });
});

describe("active module detection", () => {
  const items = buildNavigation(context(["customers.view", "sales.view"])).flatMap((group) => group.items);

  it("matches a detail route to its list module", () => {
    expect(findActiveModuleKey("/customers/abc123", items)).toBe("customers");
  });

  it("matches an exact list route", () => {
    expect(findActiveModuleKey("/customers", items)).toBe("customers");
  });

  it("returns null when nothing matches", () => {
    expect(findActiveModuleKey("/reports", items)).toBeNull();
  });

  it("does not treat a prefix of a different word as a match", () => {
    expect(findActiveModuleKey("/customers-archive", items)).toBeNull();
  });
});

describe("global create actions", () => {
  it("only offers actions the member can perform", () => {
    const keys = buildCreateActions(context(["customers.create"])).map((action) => action.key);

    expect(keys).toEqual(["customer"]);
  });

  it("gates industry-specific actions on the industry", () => {
    const generic = buildCreateActions(context(["vehicles.create"], "generic")).map((action) => action.key);
    const workshop = buildCreateActions(context(["vehicles.create"], "automobile_workshop")).map(
      (action) => action.key,
    );

    expect(generic).toEqual([]);
    expect(workshop).toEqual(["vehicle"]);
  });

  it("uses industry terminology for action labels", () => {
    const [action] = buildCreateActions(context(["sales.create"], "automobile_workshop"));

    expect(action.label).toBe("Job Card");
  });
});
