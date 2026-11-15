import { FIBONACCI_STORY_POINTS, isValidFibonacciStoryPoints, type AgentExecutionPlan, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

export { FIBONACCI_STORY_POINTS, isValidFibonacciStoryPoints };
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
    || plan.steps.some((step, index) => !step || step.id !== `step-${index + 1}` || !text(step.title, 1000) || !text(step.acceptance, 1000)
      || step.parent_id !== undefined && !plan.steps.slice(0, index).some(earlier => earlier.id === step.parent_id)
      || step.story_points !== undefined && step.story_points !== null && !isValidFibonacciStoryPoints(step.story_points)
      || step.estimate_source !== undefined && step.estimate_source !== "agent" && step.estimate_source !== "human"
      || step.estimate_reason !== undefined && !text(step.estimate_reason, 500)
      || step.depends_on !== undefined && (!Array.isArray(step.depends_on) || new Set(step.depends_on).size !== step.depends_on.length
        || step.depends_on.some(id => !plan.steps.slice(0, index).some(earlier => earlier.id === id))))
    || JSON.stringify(plan).length > 16_000) throw new Error("执行计划与固定材料不一致，或步骤格式无效");
  return structuredClone(plan);
}
