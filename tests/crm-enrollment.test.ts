import { describe, expect, it } from "vitest";
import {
  validateInitialOpportunityEnrollment,
  type InitialOpportunityEnrollmentInput,
} from "@/lib/crm/enrollment";

function candidate(overrides: Partial<InitialOpportunityEnrollmentInput> = {}): InitialOpportunityEnrollmentInput {
  return {
    organizationId: "org-a",
    customer: { id: "customer-a", organizationId: "org-a" },
    owner: { membershipId: "membership-a", organizationId: "org-a", status: "ACTIVE" },
    pipelineVersion: {
      id: "pipeline-version-a",
      organizationId: "org-a",
      published: true,
      entryStage: {
        id: "stage-new",
        pipelineVersionId: "pipeline-version-a",
        status: "OPEN",
      },
    },
    ...overrides,
  };
}

describe("validateInitialOpportunityEnrollment", () => {
  it("accepts a same-organization Customer and active owner in a published version's open entry stage", () => {
    expect(validateInitialOpportunityEnrollment(candidate())).toEqual({
      ok: true,
      enrollment: { pipelineVersionId: "pipeline-version-a", stageId: "stage-new" },
    });
  });

  it("rejects a Customer from another organization", () => {
    expect(
      validateInitialOpportunityEnrollment(candidate({ customer: { id: "customer-b", organizationId: "org-b" } })),
    ).toMatchObject({ ok: false, error: { code: "CUSTOMER_ORGANIZATION_MISMATCH" } });
  });

  it("rejects a cross-organization or inactive owner", () => {
    expect(
      validateInitialOpportunityEnrollment(
        candidate({ owner: { membershipId: "membership-b", organizationId: "org-b", status: "ACTIVE" } }),
      ),
    ).toMatchObject({ ok: false, error: { code: "OWNER_ORGANIZATION_MISMATCH" } });
    expect(
      validateInitialOpportunityEnrollment(
        candidate({ owner: { membershipId: "membership-a", organizationId: "org-a", status: "SUSPENDED" } }),
      ),
    ).toMatchObject({ ok: false, error: { code: "OWNER_NOT_ACTIVE" } });
  });

  it("rejects a pipeline version from another organization or an unpublished version", () => {
    expect(
      validateInitialOpportunityEnrollment(
        candidate({
          pipelineVersion: {
            ...candidate().pipelineVersion,
            organizationId: "org-b",
          },
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "PIPELINE_ORGANIZATION_MISMATCH" } });
    expect(
      validateInitialOpportunityEnrollment(
        candidate({ pipelineVersion: { ...candidate().pipelineVersion, published: false } }),
      ),
    ).toMatchObject({ ok: false, error: { code: "PIPELINE_NOT_PUBLISHED" } });
  });

  it("rejects an entry stage from another version or a terminal stage", () => {
    expect(
      validateInitialOpportunityEnrollment(
        candidate({
          pipelineVersion: {
            ...candidate().pipelineVersion,
            entryStage: { id: "stage-other", pipelineVersionId: "pipeline-version-b", status: "OPEN" },
          },
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "ENTRY_STAGE_VERSION_MISMATCH" } });
    expect(
      validateInitialOpportunityEnrollment(
        candidate({
          pipelineVersion: {
            ...candidate().pipelineVersion,
            entryStage: { id: "stage-won", pipelineVersionId: "pipeline-version-a", status: "WON" },
          },
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "ENTRY_STAGE_NOT_OPEN" } });
  });

  it("fails closed on incomplete or malformed enrollment input", () => {
    expect(validateInitialOpportunityEnrollment(null as unknown as InitialOpportunityEnrollmentInput)).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect(
      validateInitialOpportunityEnrollment(
        candidate({ customer: { id: "", organizationId: "org-a" } }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });
});
