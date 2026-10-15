import { describe, expect, it } from "vitest";
import {
  validateOpenStageTransition,
  type AllowedPipelineTransition,
  type OpenStageTransitionInput,
  type PipelineStageStatus,
} from "@/lib/crm/pipeline-transition";

const versionA = "pipeline-version-a";
const versionB = "pipeline-version-b";

function stage(id: string, overrides: Partial<{ pipelineVersionId: string; status: PipelineStageStatus }> = {}) {
  return {
    id,
    pipelineVersionId: overrides.pipelineVersionId ?? versionA,
    status: overrides.status ?? "OPEN",
  } as const;
}

function edge(
  fromStageId: string,
  toStageId: string,
  pipelineVersionId = versionA,
): AllowedPipelineTransition {
  return { pipelineVersionId, fromStageId, toStageId };
}

function input(overrides: Partial<OpenStageTransitionInput> = {}): OpenStageTransitionInput {
  return {
    pinnedPipelineVersionId: versionA,
    pipelineVersionPublished: true,
    currentStage: stage("stage-discovery"),
    targetStage: stage("stage-qualified"),
    allowedTransitions: [edge("stage-discovery", "stage-qualified")],
    ...overrides,
  };
}

describe("validateOpenStageTransition", () => {
  it("allows an explicitly configured open-to-open transition", () => {
    expect(validateOpenStageTransition(input())).toEqual({ ok: true });
  });

  it("rejects transitions against an unpublished pinned pipeline version", () => {
    expect(validateOpenStageTransition(input({ pipelineVersionPublished: false }))).toMatchObject({
      ok: false,
      error: { code: "PIPELINE_NOT_PUBLISHED" },
    });
  });

  it("allows a reverse transition only when that directed edge is explicit", () => {
    const reverse = input({
      currentStage: stage("stage-qualified"),
      targetStage: stage("stage-discovery"),
      allowedTransitions: [edge("stage-qualified", "stage-discovery")],
    });

    expect(validateOpenStageTransition(reverse)).toEqual({ ok: true });
    expect(
      validateOpenStageTransition({
        ...reverse,
        allowedTransitions: [edge("stage-discovery", "stage-qualified")],
      }),
    ).toMatchObject({ ok: false, error: { code: "TRANSITION_NOT_ALLOWED" } });
  });

  it("rejects an unconfigured transition, including an empty graph", () => {
    expect(validateOpenStageTransition(input({ allowedTransitions: [] }))).toMatchObject({
      ok: false,
      error: { code: "TRANSITION_NOT_ALLOWED" },
    });
    expect(
      validateOpenStageTransition(input({ allowedTransitions: [edge("stage-discovery", "stage-other")] })),
    ).toMatchObject({ ok: false, error: { code: "TRANSITION_NOT_ALLOWED" } });
  });

  it("rejects a transition to the current stage", () => {
    const sameStage = stage("stage-discovery");
    expect(
      validateOpenStageTransition(
        input({ currentStage: sameStage, targetStage: sameStage, allowedTransitions: [] }),
      ),
    ).toMatchObject({ ok: false, error: { code: "SAME_STAGE" } });
  });

  it("rejects a current stage outside the enrollment's pinned version", () => {
    expect(
      validateOpenStageTransition(input({ currentStage: stage("stage-discovery", { pipelineVersionId: versionB }) })),
    ).toMatchObject({ ok: false, error: { code: "PIPELINE_VERSION_MISMATCH" } });
  });

  it("rejects a target stage outside the enrollment's pinned version", () => {
    expect(
      validateOpenStageTransition(input({ targetStage: stage("stage-qualified", { pipelineVersionId: versionB }) })),
    ).toMatchObject({ ok: false, error: { code: "PIPELINE_VERSION_MISMATCH" } });
  });

  it.each([
    ["current", { currentStage: stage("stage-discovery", { status: "WON" }) }],
    ["target", { targetStage: stage("stage-qualified", { status: "LOST" }) }],
    ["unknown status", { targetStage: { ...stage("stage-qualified"), status: "ARCHIVED" } }],
  ])("rejects a non-open %s stage", (_label, overrides) => {
    expect(validateOpenStageTransition(input(overrides as Partial<OpenStageTransitionInput>))).toMatchObject({
      ok: false,
      error: { code: "INVALID_STAGE" },
    });
  });

  it("rejects missing and malformed stage or version data as invalid input", () => {
    expect(validateOpenStageTransition(null as unknown as OpenStageTransitionInput)).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect(validateOpenStageTransition(input({ pinnedPipelineVersionId: " " }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect(
      validateOpenStageTransition(
        input({ currentStage: { ...stage("stage-discovery"), id: "" } as OpenStageTransitionInput["currentStage"] }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(
      validateOpenStageTransition(
        input({ targetStage: { ...stage("stage-qualified"), pipelineVersionId: "" } }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(
      validateOpenStageTransition({ ...input(), allowedTransitions: undefined } as unknown as OpenStageTransitionInput),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(
      validateOpenStageTransition({ ...input(), pipelineVersionPublished: undefined } as unknown as OpenStageTransitionInput),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("fails closed on malformed, duplicate, or contradictory graph definitions", () => {
    expect(
      validateOpenStageTransition(
        input({ allowedTransitions: [{ pipelineVersionId: versionA, fromStageId: "stage-discovery" } as AllowedPipelineTransition] }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION_DEFINITION" } });

    expect(
      validateOpenStageTransition(
        input({
          allowedTransitions: [
            edge("stage-discovery", "stage-qualified"),
            edge("stage-discovery", "stage-qualified"),
          ],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION_DEFINITION" } });

    // A self-edge contradicts this slice's rule that a stage must change.
    expect(
      validateOpenStageTransition(
        input({ allowedTransitions: [edge("stage-discovery", "stage-discovery")] }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION_DEFINITION" } });
  });

  it("rejects definitions that belong to a different pipeline version", () => {
    expect(
      validateOpenStageTransition(input({ allowedTransitions: [edge("stage-discovery", "stage-qualified", versionB)] })),
    ).toMatchObject({ ok: false, error: { code: "PIPELINE_VERSION_MISMATCH" } });
  });

  it("does not authorize similarly named stages from another version", () => {
    const otherVersionEdge = {
      ...edge("discovery-v2", "qualified-v2", versionB),
      fromStageName: "Discovery",
      toStageName: "Qualified",
    } as AllowedPipelineTransition;
    const sameLabelsInAnotherVersion = input({
      currentStage: { ...stage("discovery-v1"), name: "Discovery" } as OpenStageTransitionInput["currentStage"],
      targetStage: { ...stage("qualified-v1"), name: "Qualified" } as OpenStageTransitionInput["targetStage"],
      allowedTransitions: [otherVersionEdge],
    });

    expect(validateOpenStageTransition(sameLabelsInAnotherVersion)).toMatchObject({
      ok: false,
      error: { code: "PIPELINE_VERSION_MISMATCH" },
    });
  });

  it("returns the same result for identical input and does not mutate the input", () => {
    const value = input();
    const before = structuredClone(value);

    const first = validateOpenStageTransition(value);
    const second = validateOpenStageTransition(value);

    expect(second).toEqual(first);
    expect(value).toEqual(before);
  });
});
