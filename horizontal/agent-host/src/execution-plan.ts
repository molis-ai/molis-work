import type { AgentExecutionPlan, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

export const STEP_TOOLS = ["board-read", "board-report"];

/** The caller owns plan semantics; Host binds bounded steps to a frozen material. */
export function freezeExecutionPlan(request: AgentStartRequest): AgentExecutionPlan | undefined {
  if (request.execution_plan === undefined) return undefined;
  const plan = request.execution_plan;
  const text = (value: unknown, max: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= max;
  if (!plan || !text(plan.title, 200) || !plan.source || !text(plan.source.artifact_id, 200)
    || !Number.isSafeInteger(plan.source.version) || plan.source.version < 1
    || !request.text_materials?.some(material => material.source_artifact_id === plan.source.artifact_id && material.source_version === plan.source.version)
    || !Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 20
    || plan.steps.some((step, index) => !step || step.id !== `step-${index + 1}` || !text(step.title, 1000) || !text(step.acceptance, 1000))
    || JSON.stringify(plan).length > 16_000) throw new Error("执行计划与固定材料不一致，或步骤格式无效");
  return structuredClone(plan);
}
