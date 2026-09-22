import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { confirmedPlan, type CodingPlanDraft } from "./plans.js";

export interface CodingTaskBoardPlan {
  run_id: string;
  revision: number | null;
  plan: CodingPlanDraft | null;
  error: string | null;
}

/** Resolve only this session's original frozen references, never its newer draft. */
export function codingTaskBoardPlans(context: PluginStartContext, sessionId: string, runs: readonly AgentRunView[]): CodingTaskBoardPlan[] {
  const prefix = `coding-plan:${sessionId}:`;
  return runs.flatMap(run => run.frozen.text_materials.filter(material => material.source_artifact_id.startsWith(prefix)).map(material => {
    const revision = Number(material.source_artifact_id.slice(prefix.length));
    try {
      if (!Number.isSafeInteger(revision) || revision < 1 || material.source_version !== 1) throw new Error("原计划引用无效");
      return { run_id: run.ref.run_id, revision, plan: confirmedPlan(context, sessionId, revision), error: null };
    } catch {
      return { run_id: run.ref.run_id, revision: Number.isSafeInteger(revision) && revision > 0 ? revision : null,
        plan: null, error: "这轮引用的固定计划暂不可读；当前草稿不能替代原版本。" };
    }
  }));
}
