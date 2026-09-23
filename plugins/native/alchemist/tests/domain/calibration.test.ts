import { describe, expect, it } from "vitest";
import {
  type ActionProposal,
  type Annotation,
  applyActionProposal,
  assertValidAnnotation,
  CalibrationStateError,
  resolveAnnotation,
} from "../../src/studio/domain/calibration/calibration";

const annotation: Annotation = {
  id: "annotation-01",
  workspaceId: "workspace-local",
  actorId: "actor-local",
  target: {
    kind: "lens_report",
    objectId: "report-01",
    revision: 1,
    blockId: "claim-demand",
  },
  quotedSnapshot: "这条结论认为付出意愿仍然较弱。",
  comment: "请把已经持续投入人工整理也视为付出意愿的正向信号。",
  status: "open",
  createdAt: "2026-07-31T10:00:00.000Z",
};

describe("Calibration domain", () => {
  it("keeps the quote and authored comment independently required", () => {
    expect(assertValidAnnotation(annotation)).toEqual(annotation);
    expect(() => assertValidAnnotation({ ...annotation, quotedSnapshot: " " })).toThrowError(
      "ANNOTATION_QUOTE_REQUIRED",
    );
    expect(() => assertValidAnnotation({ ...annotation, comment: " " })).toThrowError(
      "ANNOTATION_COMMENT_REQUIRED",
    );
    expect(() =>
      assertValidAnnotation({ ...annotation, target: { ...annotation.target, revision: 0 } }),
    ).toThrowError("ANNOTATION_REVISION_INVALID");
  });

  it("resolves an annotation once without changing its quote", () => {
    const resolved = resolveAnnotation(annotation, "2026-07-31T10:10:00.000Z");
    expect(resolved).toMatchObject({
      quotedSnapshot: annotation.quotedSnapshot,
      status: "resolved",
      resolvedAt: "2026-07-31T10:10:00.000Z",
    });
    expect(() => resolveAnnotation(resolved, "2026-07-31T10:11:00.000Z")).toThrowError(
      new CalibrationStateError("ANNOTATION_ALREADY_RESOLVED"),
    );
  });

  it("applies an Action Proposal at most once", () => {
    const proposal: ActionProposal = {
      id: "proposal-01",
      workspaceId: "workspace-local",
      actorId: "actor-local",
      source: { kind: "annotation", id: annotation.id },
      action: "create_playbook_rule",
      target: annotation.target,
      summary: "把人工投入纳入付出意愿判断",
      diff: [{ field: "付出意愿证据", before: "仅直接采购", after: "直接采购或持续人工投入" }],
      versionImpact: "不修改当前报告；影响后续兼容研究",
      costImpact: "不立即触发研究调用",
      memoryImpact: "将创建一条 Research Playbook Rule",
      status: "pending",
      createdAt: annotation.createdAt,
    };
    const applied = applyActionProposal(proposal, "2026-07-31T10:20:00.000Z");
    expect(applied).toMatchObject({ status: "applied", appliedAt: "2026-07-31T10:20:00.000Z" });
    expect(() => applyActionProposal(applied, "2026-07-31T10:21:00.000Z")).toThrowError(
      new CalibrationStateError("ACTION_PROPOSAL_NOT_PENDING"),
    );
  });
});
