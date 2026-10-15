import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareFieldValues } from "@/lib/metadata/save-values";
import type { ResolvedField } from "@/lib/metadata/field-service";

const mocks = vi.hoisted(() => ({
  branchFindMany: vi.fn(),
  membershipFindMany: vi.fn(),
  loadFields: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    branch: { findMany: mocks.branchFindMany },
    membership: { findMany: mocks.membershipFindMany },
  },
}));
vi.mock("@/lib/metadata/field-service", () => ({ loadFields: mocks.loadFields }));

function field(id: string, dataType: "TEXT" | "BRANCH" | "USER"): ResolvedField {
  return {
    id,
    key: id,
    label: id === "branch-field" ? "Service branch" : id === "member-field" ? "Assigned member" : "Note",
    description: null,
    placeholder: null,
    dataType,
    source: "CUSTOM",
    templateKey: null,
    isRequired: false,
    hidden: false,
    displayOrder: 0,
    sectionId: null,
    validation: null,
    roleKeys: [],
    options: [],
    categoryIds: [],
  };
}

describe("custom metadata reference tenant integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadFields.mockResolvedValue([field("branch-field", "BRANCH"), field("member-field", "USER")]);
    mocks.branchFindMany.mockResolvedValue([{ id: "branch-a" }]);
    mocks.membershipFindMany.mockResolvedValue([{ id: "membership-a" }]);
  });

  it("accepts branch and member references owned by the current organization", async () => {
    const prepared = await prepareFieldValues("org-a", "customer", {
      "branch-field": "branch-a",
      "member-field": "membership-a",
    });

    expect(prepared.ok).toBe(true);
    expect(mocks.branchFindMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", id: { in: ["branch-a"] } },
      select: { id: true },
    });
    expect(mocks.membershipFindMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", id: { in: ["membership-a"] }, role: { organizationId: "org-a" } },
      select: { id: true },
    });
  });

  it("rejects a branch ID that is missing from the current organization", async () => {
    mocks.branchFindMany.mockResolvedValue([]);

    await expect(
      prepareFieldValues("org-a", "customer", { "branch-field": "branch-from-org-b" }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Service branch must refer to a branch in this organization.",
    });
  });

  it("rejects a membership ID that is missing or linked to a different-organization role", async () => {
    mocks.membershipFindMany.mockResolvedValue([]);

    await expect(
      prepareFieldValues("org-a", "customer", { "member-field": "membership-from-org-b" }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Assigned member must refer to a team member in this organization.",
    });
  });

  it("does not query or reinterpret ordinary text field values as identifiers", async () => {
    mocks.loadFields.mockResolvedValue([field("note-field", "TEXT")]);

    const prepared = await prepareFieldValues("org-a", "customer", { "note-field": "branch-from-org-b" });

    expect(prepared.ok).toBe(true);
    expect(mocks.branchFindMany).not.toHaveBeenCalled();
    expect(mocks.membershipFindMany).not.toHaveBeenCalled();
  });
});
