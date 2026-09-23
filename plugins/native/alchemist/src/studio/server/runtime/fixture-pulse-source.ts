import type {
  PulseSourceId,
  SourceCollectionResult,
  SourcePort,
  SourceQuery,
} from "../../domain/discovery/source.js";

const fixtureNames: Record<PulseSourceId, string> = {
  toolify: "Toolify Agent workflow",
  watcha: "观猹 Agent 工作流",
  github: "GitHub verifiable agent workflow",
};

export class FixturePulseSource implements SourcePort {
  constructor(readonly sourceId: PulseSourceId) {}

  async collect(input: SourceQuery): Promise<SourceCollectionResult> {
    const fetchedAt = new Date().toISOString();
    return {
      sourceId: this.sourceId,
      status: "completed",
      requestUrl: `https://fixture.alchemist.local/${this.sourceId}`,
      fetchedAt,
      httpStatus: 200,
      contentHash: `fixture:${this.sourceId}:${input.since}`,
      signals: [
        {
          id: `fixture_${this.sourceId}_${input.since.slice(0, 10)}`,
          sourceId: this.sourceId,
          title: fixtureNames[this.sourceId],
          url: `https://fixture.alchemist.local/${this.sourceId}/agent-workflow`,
          summary: "一个带检查点和人工确认的窄任务 Agent 工作流。",
          observedAt: fetchedAt,
          publishedAt: input.since,
          categories: ["agent", "workflow"],
          nativeMetrics: [
            {
              name: "fixture_attention",
              label: "离线验收信号",
              value: 1,
              unit: "count",
              observedAt: fetchedAt,
              definition: "仅用于端到端测试的确定性信号",
            },
          ],
          supports: ["端到端流程验收"],
          cannotProve: ["真实市场需求", "付费", "收入", "留存"],
        },
      ],
    };
  }
}
