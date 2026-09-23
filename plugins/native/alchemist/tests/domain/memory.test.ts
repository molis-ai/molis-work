import { describe, expect, it } from "vitest";
import {
  assertValidPlaybookScope,
  disableMemoryRule,
  MemoryRuleStateError,
  type PlaybookRule,
  type PlaybookScope,
} from "../../src/studio/domain/memory/rules";

describe("Memory rules", () => {
  it.each<[PlaybookScope]>([
    [{ kind: "report", reportId: "report-01" }],
    [{ kind: "direction", directionId: "direction-01" }],
    [{ kind: "global_market_space" }],
  ])("accepts the explicit Playbook scope %j", (scope) => {
    expect(assertValidPlaybookScope(scope)).toEqual(scope);
  });

  it("has no implicit or empty Playbook scope", () => {
    expect(() => assertValidPlaybookScope(undefined)).toThrowError("PLAYBOOK_SCOPE_REQUIRED");
    expect(() => assertValidPlaybookScope({ kind: "report", reportId: "" })).toThrowError(
      "PLAYBOOK_SCOPE_TARGET_REQUIRED",
    );
  });

  it("disables a rule without rewriting its version or source", () => {
    const rule: PlaybookRule = {
      id: "playbook-01",
      workspaceId: "workspace-local",
      actorId: "actor-local",
      version: 1,
      originalFeedback: "人工投入也应该作为付出意愿信号",
      methodChange: "同时检查持续时间、人力和替代成本",
      positiveExamples: ["团队每周人工整理三小时"],
      negativeExamples: ["一次点赞"],
      scope: { kind: "global_market_space" },
      source: { kind: "annotation", id: "annotation-01" },
      status: "active",
      createdAt: "2026-07-31T10:00:00.000Z",
      updatedAt: "2026-07-31T10:00:00.000Z",
    };
    const disabled = disableMemoryRule(rule, "2026-07-31T10:30:00.000Z");
    expect(disabled).toMatchObject({
      version: 1,
      source: rule.source,
      status: "disabled",
      updatedAt: "2026-07-31T10:30:00.000Z",
    });
    expect(() => disableMemoryRule(disabled, "2026-07-31T10:31:00.000Z")).toThrowError(
      new MemoryRuleStateError("MEMORY_RULE_NOT_ACTIVE"),
    );
  });
});
