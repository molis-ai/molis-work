import { describe, expect, it } from "vitest";
import {
  inspectPulseCoverage,
  type Opportunity,
  transitionOpportunity,
} from "../../src/studio/domain/discovery/pulse";
import type { SourceCollectionResult } from "../../src/studio/domain/discovery/source";

const opportunity: Opportunity = {
  id: "opportunity_01",
  reportId: "pulse_report_01",
  title: "面向高频内容任务的垂直生成器",
  highlight: "从通用聊天转向带交付物的窄工作流。",
  rationale: "多个来源同时出现了围绕单一交付物的产品。",
  demandInference: "用户可能愿意为更短的交付路径付费，但尚未验证。",
  counterSignals: ["供给增加也可能只是模型能力趋同"],
  unknowns: ["重复使用与付费是否成立"],
  sourceSignalIds: ["signal_01", "signal_02"],
  status: "new",
  createdAt: "2026-07-31T00:00:00.000Z",
};

describe("Market Pulse domain", () => {
  it("keeps a failed source distinct from a successful empty source", () => {
    const results: SourceCollectionResult[] = [
      {
        sourceId: "toolify",
        status: "completed",
        requestUrl: "https://www.toolify.ai/Best-trending-AI-Tools",
        fetchedAt: "2026-07-31T00:00:00.000Z",
        signals: [],
      },
      {
        sourceId: "watcha",
        status: "error",
        requestUrl: "https://watcha.cn/api/v2/hot/products",
        fetchedAt: "2026-07-31T00:00:00.000Z",
        errorCode: "alchemist.source_timeout",
        signals: [],
      },
    ];

    expect(inspectPulseCoverage(results, ["toolify", "watcha"])).toEqual({
      status: "partial",
      successfulSourceIds: ["toolify"],
      failedSourceIds: ["watcha"],
      coverageGaps: ["观猹抓取失败，不能判断该来源当前是否存在信号。"],
    });
  });

  it("saves an opportunity for later without converting it", () => {
    const saved = transitionOpportunity(opportunity, {
      action: "save_for_later",
      now: "2026-07-31T01:00:00.000Z",
    });

    expect(saved).toMatchObject({ status: "saved_for_later", savedAt: "2026-07-31T01:00:00.000Z" });
    expect(saved.convertedDirectionId).toBeUndefined();
  });

  // ALCERR-01/ALCERR-02 (J5A-01/J5A-02): a converted opportunity cannot be converted again.
  it("converts a new or saved opportunity exactly once", () => {
    const saved = transitionOpportunity(opportunity, {
      action: "save_for_later",
      now: "2026-07-31T01:00:00.000Z",
    });
    const converted = transitionOpportunity(saved, {
      action: "convert_to_direction",
      directionId: "direction_01",
      now: "2026-07-31T02:00:00.000Z",
    });

    expect(converted).toMatchObject({
      status: "converted_to_direction",
      convertedDirectionId: "direction_01",
      convertedAt: "2026-07-31T02:00:00.000Z",
    });
    expect(() =>
      transitionOpportunity(converted, {
        action: "convert_to_direction",
        directionId: "direction_02",
        now: "2026-07-31T03:00:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "alchemist.opportunity_already_converted", message: "alchemist.opportunity_already_converted", kind: "invalid" }));
  });
});
