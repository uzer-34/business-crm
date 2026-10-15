import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlatformLicensingError from "@/app/platform/licensing/error";
import PlatformLicensingLoading from "@/app/platform/licensing/loading";
import PlatformLicensingPage from "@/app/platform/licensing/page";
import PlatformLayout from "@/app/platform/layout";
import { PlatformForbiddenError } from "@/lib/platform/authorization";

const mocks = vi.hoisted(() => ({
  getPlatformPurchaseDirectory: vi.fn(),
  loadPlatformContext: vi.fn(),
}));

vi.mock("@/lib/platform/licensing/data-access", () => ({
  getPlatformPurchaseDirectory: mocks.getPlatformPurchaseDirectory,
}));
vi.mock("@/lib/platform/authorization", () => ({
  PlatformForbiddenError: class PlatformForbiddenError extends Error {
    constructor() {
      super("Platform access is not available");
      this.name = "PlatformForbiddenError";
    }
  },
  loadPlatformContext: mocks.loadPlatformContext,
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "platform-user" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: () => { throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
      ReactModule.createElement("a", { href, ...props }, children),
  };
});

const purchase = {
  id: "purchase-1",
  organizationId: "org-1",
  organization: {
    id: "org-1",
    name: "Acme Works",
    industryKey: "services",
    countryCode: "IN",
  },
  kind: "INSTALLMENT",
  contractAmount: "250.00",
  currencyCode: "INR",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  entitlement: { id: "entitlement-1", state: "PENDING", updatedAt: new Date("2026-10-01T00:00:00.000Z") },
  schedule: [{
    id: "schedule-1",
    kind: "INSTALLMENT",
    sequence: 1,
    dueAt: new Date("2026-11-01T00:00:00.000Z"),
    amount: "125.00",
    currencyCode: "INR",
    status: "OPEN",
  }],
  payments: [{
    id: "payment-1",
    scheduleItemId: "schedule-1",
    direction: "RECEIPT",
    status: "PENDING",
    amount: "125.00",
    currencyCode: "INR",
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
  }],
  billing: {
    currencyCode: "INR",
    totalOutstanding: "125.00",
    amountDueNow: "0.00",
    items: [{
      id: "schedule-1",
      sequence: 1,
      dueAt: "2026-11-01T00:00:00.000Z",
      scheduledAmount: "125.00",
      settledNetAmount: "0.00",
      outstandingAmount: "125.00",
      state: "UPCOMING",
    }],
  },
};

function directoryResult(overrides: Record<string, unknown> = {}) {
  return {
    purchases: [purchase],
    query: "",
    kind: "",
    entitlementState: "",
    page: 1,
    pageSize: 25,
    total: 1,
    pageCount: 1,
    ...overrides,
  };
}

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const element = await PlatformLicensingPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

describe("platform licensing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlatformPurchaseDirectory.mockResolvedValue(directoryResult());
    mocks.loadPlatformContext.mockResolvedValue({
      principalId: "platform-principal",
      userId: "platform-user",
      capabilities: new Set(["platform.licensing.view"]),
    });
  });

  it("passes search, filters, and pagination to the audited server read service", async () => {
    mocks.getPlatformPurchaseDirectory.mockResolvedValue(directoryResult({
      query: "Acme",
      kind: "INSTALLMENT",
      entitlementState: "PENDING",
      page: 2,
      pageCount: 3,
      total: 56,
    }));

    const html = await renderPage({ q: "Acme", kind: "INSTALLMENT", entitlementState: "PENDING", page: "2" });

    expect(mocks.getPlatformPurchaseDirectory).toHaveBeenCalledWith({
      query: "Acme",
      kind: "INSTALLMENT",
      entitlementState: "PENDING",
      page: "2",
    });
    expect(html).toContain("Licensing records");
    expect(html).toContain("Page 2 of 3");
    expect(html).toContain("/platform/licensing?q=Acme&amp;kind=INSTALLMENT&amp;entitlementState=PENDING&amp;page=1");
    expect(html).toContain("/platform/licensing?q=Acme&amp;kind=INSTALLMENT&amp;entitlementState=PENDING&amp;page=3");
  });

  it("shows only approved organization metadata and persisted payment status", async () => {
    const html = await renderPage();

    expect(html).toContain("Acme Works");
    expect(html).toContain("services");
    expect(html).toContain("IN");
    expect(html).toContain("PENDING");
    expect(html).toContain("not independently verified");
    expect(html).not.toContain("/platform/organizations?q=Acme+Works");
    expect(html).not.toContain("customer");
    expect(html).not.toContain("employee");
  });

  it("renders an honest empty state with a filter reset", async () => {
    mocks.getPlatformPurchaseDirectory.mockResolvedValue(directoryResult({
      purchases: [],
      query: "Unknown Org",
      total: 0,
      pageCount: 1,
    }));

    const html = await renderPage({ q: "Unknown Org" });

    expect(html).toContain("No matching licensing records");
    expect(html).toContain("No persisted records match these filters");
    expect(html).toContain("Clear filters");
    expect(html).not.toContain("Acme Works");
  });

  it("distinguishes an empty platform directory from a search with no matches", async () => {
    mocks.getPlatformPurchaseDirectory.mockResolvedValue(directoryResult({ purchases: [], total: 0 }));

    const html = await renderPage();

    expect(html).toContain("No platform purchase records yet");
    expect(html).not.toContain("Clear filters");
  });

  it("renders a clear denial when the licensing capability is unavailable", async () => {
    mocks.getPlatformPurchaseDirectory.mockRejectedValue(new PlatformForbiddenError());

    const html = await renderPage();

    expect(html).toContain("Licensing access is restricted");
    expect(html).toContain("No licensing data was loaded");
    expect(html).not.toContain("Acme Works");
  });

  it("shows only platform navigation links granted to the current principal", async () => {
    const element = await PlatformLayout({ children: React.createElement("p", null, "content") });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/platform/licensing"');
    expect(html).not.toContain('href="/platform/organizations"');
  });

  it("renders a safe error state and retry action without exposing server details", () => {
    const html = renderToStaticMarkup(React.createElement(PlatformLicensingError, { retry: vi.fn() }));

    expect(html).toContain("Licensing records couldn’t be loaded");
    expect(html).toContain("No licensing changes were made");
    expect(html).toContain("Try again");
    expect(html).not.toContain("DATABASE_URL");
  });

  it("renders an accessible loading skeleton while the server read is pending", () => {
    const html = renderToStaticMarkup(React.createElement(PlatformLicensingLoading));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading licensing records"');
  });
});
