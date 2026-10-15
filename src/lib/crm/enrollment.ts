import type { MembershipStatus } from "@/generated/prisma/enums";
import type { PipelineStageStatus } from "./pipeline-transition";

/**
 * Resolved references used to validate initial Opportunity enrollment before
 * persistence. The database query layer must still load every reference from
 * the authenticated organization and enforce the same tenant constraints.
 */
export interface InitialOpportunityEnrollmentInput {
  organizationId: string;
  customer: { id: string; organizationId: string };
  owner: { membershipId: string; organizationId: string; status: MembershipStatus };
  pipelineVersion: {
    id: string;
    organizationId: string;
    published: boolean;
    entryStage: {
      id: string;
      pipelineVersionId: string;
      status: PipelineStageStatus;
    };
  };
}

export type InitialOpportunityEnrollmentErrorCode =
  | "INVALID_INPUT"
  | "CUSTOMER_ORGANIZATION_MISMATCH"
  | "OWNER_ORGANIZATION_MISMATCH"
  | "OWNER_NOT_ACTIVE"
  | "PIPELINE_ORGANIZATION_MISMATCH"
  | "PIPELINE_NOT_PUBLISHED"
  | "ENTRY_STAGE_VERSION_MISMATCH"
  | "ENTRY_STAGE_NOT_OPEN";

export type InitialOpportunityEnrollmentResult =
  | { ok: true; enrollment: { pipelineVersionId: string; stageId: string } }
  | { ok: false; error: { code: InitialOpportunityEnrollmentErrorCode; message: string } };

const ERROR_MESSAGES: Record<InitialOpportunityEnrollmentErrorCode, string> = {
  INVALID_INPUT: "Organization, Customer, owner, pipeline version, and entry stage must be complete.",
  CUSTOMER_ORGANIZATION_MISMATCH: "The Customer must belong to the Opportunity organization.",
  OWNER_ORGANIZATION_MISMATCH: "The Opportunity owner must belong to the same organization.",
  OWNER_NOT_ACTIVE: "The Opportunity owner must have an active membership.",
  PIPELINE_ORGANIZATION_MISMATCH: "The pipeline version must belong to the Opportunity organization.",
  PIPELINE_NOT_PUBLISHED: "An Opportunity can only be enrolled in a published pipeline version.",
  ENTRY_STAGE_VERSION_MISMATCH: "The entry stage must belong to the selected pipeline version.",
  ENTRY_STAGE_NOT_OPEN: "An Opportunity must start in an open pipeline stage.",
};

function failure(code: InitialOpportunityEnrollmentErrorCode): InitialOpportunityEnrollmentResult {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

/** Validates only accepted creation/enrollment invariants, not authorization. */
export function validateInitialOpportunityEnrollment(
  input: InitialOpportunityEnrollmentInput,
): InitialOpportunityEnrollmentResult {
  const raw: unknown = input;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return failure("INVALID_INPUT");

  const candidate = raw as Record<string, unknown>;
  const customer = candidate.customer as Record<string, unknown> | null;
  const owner = candidate.owner as Record<string, unknown> | null;
  const pipelineVersion = candidate.pipelineVersion as Record<string, unknown> | null;
  const entryStage = pipelineVersion?.entryStage as Record<string, unknown> | null;

  if (
    !isIdentifier(candidate.organizationId) ||
    !customer ||
    !isIdentifier(customer.id) ||
    !isIdentifier(customer.organizationId) ||
    !owner ||
    !isIdentifier(owner.membershipId) ||
    !isIdentifier(owner.organizationId) ||
    typeof owner.status !== "string" ||
    !pipelineVersion ||
    !isIdentifier(pipelineVersion.id) ||
    !isIdentifier(pipelineVersion.organizationId) ||
    typeof pipelineVersion.published !== "boolean" ||
    !entryStage ||
    !isIdentifier(entryStage.id) ||
    !isIdentifier(entryStage.pipelineVersionId) ||
    typeof entryStage.status !== "string"
  ) {
    return failure("INVALID_INPUT");
  }

  const organizationId = candidate.organizationId;
  if (customer.organizationId !== organizationId) return failure("CUSTOMER_ORGANIZATION_MISMATCH");
  if (owner.organizationId !== organizationId) return failure("OWNER_ORGANIZATION_MISMATCH");
  if (owner.status !== "ACTIVE") return failure("OWNER_NOT_ACTIVE");
  if (pipelineVersion.organizationId !== organizationId) return failure("PIPELINE_ORGANIZATION_MISMATCH");
  if (!pipelineVersion.published) return failure("PIPELINE_NOT_PUBLISHED");
  if (entryStage.pipelineVersionId !== pipelineVersion.id) return failure("ENTRY_STAGE_VERSION_MISMATCH");
  if (entryStage.status !== "OPEN") return failure("ENTRY_STAGE_NOT_OPEN");

  return {
    ok: true,
    enrollment: { pipelineVersionId: pipelineVersion.id, stageId: entryStage.id },
  };
}
