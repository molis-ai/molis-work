import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions, ALCHEMIST_ACTION_PERMISSIONS, alchemistManifest, createAlchemistActionHandlers, createAlchemistStudioRuntime, type AlchemistAiPort } from "@molis-ai/molis-work-plugin-alchemist";

export function controlledAlchemistAi() {
  const model = { id: "fixture/model", label: "受控测试模型", runtimeLabel: "fixture", costVisibility: "unobservable" as const };
  const requests: Parameters<AlchemistAiPort["generate"]>[0][] = [];
  const ai: AlchemistAiPort = {
    listModels: async () => [model],
    search: async () => [{ url: "https://docs.example.org/evidence", title: "测试资料", excerpt: "可以保存访谈的来源与原文，付费意愿尚需验证。" }],
    generate: async input => {
      requests.push(input);
      const fields = input.jsonSchema.properties as any;
      const value = fields.reply ? { reply: "请先验证持续使用意愿。" } : fields.summary ? { summary: "测试来源支持有限，需验证持续使用。" }
        : fields.judgments ? { judgments: fields.judgments.items.properties.label.enum.map((label: string) => ({ label, status: "tentative", conclusion: "有限支持", rationale: "仅有测试来源",
          supportingEvidenceIndexes: [0], counterEvidenceIndexes: [], unknowns: ["持续使用"], changeConditions: ["用户访谈"] })) }
        : { understanding: { summary: "访谈证据工具", assumptions: ["愿意整理"], unknowns: ["使用频率"], concreteness: "direction" },
          cards: ["证据卡", "访谈时间线"].map(title => ({ title, highlight: "保留原文", targetUser: "创始人", scenario: "访谈后", problem: "证据散落", mechanism: "关联证据和判断",
            valueProposition: "少重复研究", whyItMayWork: "已有记录需求", assumptions: ["愿意记录"], unknowns: ["付费意愿"], mvp: { inScope: ["保存证据"], outOfScope: ["团队协作"] } })), noCardsReason: null };
      return { text: JSON.stringify(value), runtimeLabel: model.runtimeLabel };
    },
  };
  return { ai, requests, model };
}

export function alchemistFixture(home: string, projectId = "a", permissions: readonly string[] = ALCHEMIST_ACTION_PERMISSIONS) {
  const { ai, requests, model } = controlledAlchemistAi();
  const service = new ActionService();
  const caller: ActionCallContext = { actor_id: "fixture-owner", project_id: projectId, audience: "user", permissions };
  const bound = bindActionClient(service, () => caller);
  const runtime = createAlchemistStudioRuntime({ databasePath: join(home, `${projectId}.sqlite`), ai, pulseSourceMode: "fixture",
    actions: { async invoke<I, O>(definition: ActionDefinition<I, O>, input: I, signal?: AbortSignal): Promise<O> { return await service.invoke({ ...caller, signal }, definition, input) as O; } } });
  const dispose = service.registerProvider({ provider: { provider_id: alchemistManifest.plugin_id, title: alchemistManifest.name, kind: "plugin", plugin_id: alchemistManifest.plugin_id, project_id: projectId },
    definitions: Object.values(alchemistActions), handlers: createAlchemistActionHandlers(caller => runtime.actionsFor(caller.actor_id)) });
  return { service, caller, bound, runtime, ai, requests, model, actions: alchemistActions, async close() { dispose(); await runtime.close(); } };
}
