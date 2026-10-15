/** The only stage status that can participate in the approved first slice. */
export type PipelineStageStatus = "OPEN" | "WON" | "LOST";

export interface PipelineTransitionStage {
  id: string;
  pipelineVersionId: string;
  status: PipelineStageStatus;
}

/** A directed edge in one immutable published pipeline version. */
export interface AllowedPipelineTransition {
  pipelineVersionId: string;
  fromStageId: string;
  toStageId: string;
}

export interface OpenStageTransitionInput {
  /** The immutable version pinned by the Opportunity's active enrollment. */
  pinnedPipelineVersionId: string;
  /** Publication state read for the pinned version; draft versions cannot transition. */
  pipelineVersionPublished: boolean;
  currentStage: PipelineTransitionStage;
  targetStage: PipelineTransitionStage;
  /** Complete transition definitions loaded for the pinned version. */
  allowedTransitions: readonly AllowedPipelineTransition[];
}

export type OpenStageTransitionErrorCode =
  | "INVALID_INPUT"
  | "PIPELINE_VERSION_MISMATCH"
  | "PIPELINE_NOT_PUBLISHED"
  | "INVALID_STAGE"
  | "SAME_STAGE"
  | "INVALID_TRANSITION_DEFINITION"
  | "TRANSITION_NOT_ALLOWED";

export type OpenStageTransitionResult =
  | { ok: true }
  | { ok: false; error: { code: OpenStageTransitionErrorCode; message: string } };

const ERROR_MESSAGES: Record<OpenStageTransitionErrorCode, string> = {
  INVALID_INPUT: "Stage, version, and transition data must be complete and well-formed.",
  PIPELINE_VERSION_MISMATCH: "Both stages and every transition definition must use the pinned pipeline version.",
  PIPELINE_NOT_PUBLISHED: "Only a published pipeline version can be used for stage transitions.",
  INVALID_STAGE: "Only valid OPEN stages can be transitioned in this slice.",
  SAME_STAGE: "A transition must target a different stage.",
  INVALID_TRANSITION_DEFINITION: "Transition definitions must be unique and cannot contain same-stage edges.",
  TRANSITION_NOT_ALLOWED: "This open-stage transition is not configured.",
};

function failure(code: OpenStageTransitionErrorCode): OpenStageTransitionResult {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isKnownStageStatus(value: unknown): value is PipelineStageStatus {
  return value === "OPEN" || value === "WON" || value === "LOST";
}

/**
 * Validates only the pure graph rule for the approved CRM first slice.
 * Authorization, record scope, persistence, and concurrency are separate concerns.
 *
 * Error precedence is stable: malformed top-level/stage input, stage-version
 * mismatch, unpublished version, invalid stage, malformed graph/edge version,
 * same stage, then an unconfigured edge.
 */
export function validateOpenStageTransition(input: OpenStageTransitionInput): OpenStageTransitionResult {
  const rawInput: unknown = input;
  if (!isRecord(rawInput)) return failure("INVALID_INPUT");

  const pinnedVersionId = rawInput.pinnedPipelineVersionId;
  const pipelineVersionPublished = rawInput.pipelineVersionPublished;
  const currentStage = rawInput.currentStage;
  const targetStage = rawInput.targetStage;
  const allowedTransitions = rawInput.allowedTransitions;

  if (
    !isIdentifier(pinnedVersionId) ||
    typeof pipelineVersionPublished !== "boolean" ||
    !isRecord(currentStage) ||
    !isRecord(targetStage) ||
    !Array.isArray(allowedTransitions)
  ) {
    return failure("INVALID_INPUT");
  }

  const currentStageId = currentStage.id;
  const currentVersionId = currentStage.pipelineVersionId;
  const currentStatus = currentStage.status;
  const targetStageId = targetStage.id;
  const targetVersionId = targetStage.pipelineVersionId;
  const targetStatus = targetStage.status;

  if (
    !isIdentifier(currentStageId) ||
    !isIdentifier(currentVersionId) ||
    typeof currentStatus !== "string" ||
    !isIdentifier(targetStageId) ||
    !isIdentifier(targetVersionId) ||
    typeof targetStatus !== "string"
  ) {
    return failure("INVALID_INPUT");
  }

  if (currentVersionId !== pinnedVersionId || targetVersionId !== pinnedVersionId) {
    return failure("PIPELINE_VERSION_MISMATCH");
  }
  if (!pipelineVersionPublished) return failure("PIPELINE_NOT_PUBLISHED");

  if (!isKnownStageStatus(currentStatus) || !isKnownStageStatus(targetStatus)) {
    return failure("INVALID_STAGE");
  }
  if (currentStatus !== "OPEN" || targetStatus !== "OPEN") {
    return failure("INVALID_STAGE");
  }

  const seenEdges = new Set<string>();
  let explicitlyAllowed = false;
  for (const definition of allowedTransitions as unknown[]) {
    if (
      !isRecord(definition) ||
      !isIdentifier(definition.pipelineVersionId) ||
      !isIdentifier(definition.fromStageId) ||
      !isIdentifier(definition.toStageId)
    ) {
      return failure("INVALID_TRANSITION_DEFINITION");
    }

    if (definition.pipelineVersionId !== pinnedVersionId) {
      return failure("PIPELINE_VERSION_MISMATCH");
    }
    if (definition.fromStageId === definition.toStageId) {
      return failure("INVALID_TRANSITION_DEFINITION");
    }

    // JSON tuple encoding avoids ambiguous string concatenation for opaque IDs.
    const edgeKey = JSON.stringify([definition.fromStageId, definition.toStageId]);
    if (seenEdges.has(edgeKey)) return failure("INVALID_TRANSITION_DEFINITION");
    seenEdges.add(edgeKey);

    if (definition.fromStageId === currentStageId && definition.toStageId === targetStageId) {
      explicitlyAllowed = true;
    }
  }

  if (currentStageId === targetStageId) return failure("SAME_STAGE");

  return explicitlyAllowed ? { ok: true } : failure("TRANSITION_NOT_ALLOWED");
}
