import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
export function demoSeedDeclarationProblems(value: unknown, actions: readonly ActionDefinition[] = []): string[] {
  if (value === undefined) return [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["demo_seed 必须是动作引用"];
  const ref = value as Record<string, unknown>;
  if (Object.keys(ref).some(key => key !== "capability_id" && key !== "version") || typeof ref.capability_id !== "string" || !Number.isInteger(ref.version) || Number(ref.version) < 1) return ["demo_seed 必须是 { capability_id, version }"];
  const action = actions.find(item => item.capability_id === ref.capability_id && item.version === ref.version);
  if (!action) return ["demo_seed 必须引用本插件声明的动作"];
  const problems: string[] = [];
  if (action.action.scope !== "project") problems.push("demo_seed 必须是项目动作");
  if (action.operation !== "command" || action.action.audiences.length !== 1 || action.action.audiences[0] !== "workflow") problems.push("demo_seed 必须是仅 workflow 可调的写动作");
  const schema = action.action.input_schema;
  if (schema.type !== "object" || Object.keys(schema.properties ?? {}).length || schema.additionalProperties !== false) problems.push("demo_seed 输入必须是封闭的空对象");
  return problems;
}
