import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentRunView, AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";
import { confirmedPlan, type CodingPlanDraft } from "./plans.js";

export interface CodingTaskBoardPlan {
  run_id: string;
  revision: number | null;
  plan: CodingPlanDraft | null;
  error: string | null;
  board?: AgentStepBoard;
  board_error?: string;
  verdicts?: Record<string, CodingStepVerdict>;
}

export interface CodingStepVerdict {
  revision: number; status: "accepted" | "needs-work"; notes: string;
  board_id: string; board_version: number; actor: string; at: string;
}
export const stepVerdictKey = (session: string, run: string, step: string) => `step-verdict:${session}:${run}:${step}`;

/** Resolve only this session's original frozen references, never its newer draft. */
export function codingTaskBoardPlans(context: PluginStartContext, sessionId: string, runs: readonly AgentRunView[]): CodingTaskBoardPlan[] {
  const prefix = `coding-plan:${sessionId}:`;
  return runs.flatMap(run => run.frozen.text_materials.filter(material => material.source_artifact_id.startsWith(prefix)).map(material => {
    const revision = Number(material.source_artifact_id.slice(prefix.length));
    try {
      if (!Number.isSafeInteger(revision) || revision < 1 || material.source_version !== 1) throw new Error("原计划引用无效");
      const plan = confirmedPlan(context, sessionId, revision);
      const frozen = run.frozen.execution_plan;
      const original = frozen && frozen.source.artifact_id === material.source_artifact_id && frozen.source.version === material.source_version
        && JSON.stringify(frozen.steps) === JSON.stringify(plan.content.steps.map((step, index) => ({ id: `step-${index + 1}`, ...step })));
      const verdicts: Record<string, CodingStepVerdict> = {};
      if (original && run.step_board) for (const node of run.step_board.nodes) {
        const saved = context.services!.storage!.get(stepVerdictKey(sessionId, run.ref.run_id, node.id));
        if (typeof saved === "string") verdicts[node.id] = JSON.parse(saved);
      }
      return { run_id: run.ref.run_id, revision, plan, error: null,
        ...(original ? { board: run.step_board, board_error: run.step_board_error, verdicts } : frozen ? { board_error: "本轮步骤与固定计划不一致，不能评价。" } : {}) };
    } catch {
      return { run_id: run.ref.run_id, revision: Number.isSafeInteger(revision) && revision > 0 ? revision : null,
        plan: null, error: "这轮引用的固定计划暂不可读；当前草稿不能替代原版本。" };
    }
  }));
}
