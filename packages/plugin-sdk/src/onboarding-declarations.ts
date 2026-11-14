import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA, ONBOARDING_TAKE_RESULT_SCHEMA } from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";

/** Key order aside, the same JSON: a take action's input and output are exactly the contract's (batch12-design §7.7 C2). */
const same = (left: unknown, right: unknown): boolean => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1).map(([key, item]) => [key, sorted(item)])) : value;

/**
 * 可承接上手材料 (batch12-design §7): each take names one of this plugin's own actions, a project command only the person can call,
 * whose input and output are the contract's exactly; one take per kind. Anything else refuses the Manifest.
 */
export function onboardingDeclarationProblems(value: unknown, actions: readonly ActionDefinition[] = []): string[] {
  if (value === undefined) return [];
  const takes = value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 ? (value as { takes?: unknown }).takes : undefined;
  if (!Array.isArray(takes) || !takes.length) return ["onboarding 必须是 { takes: [...] }，至少一条"];
  const problems: string[] = [], kinds = new Set<string>();
  for (const take of takes as unknown[]) {
    const ref = take && typeof take === "object" && !Array.isArray(take) ? take as Record<string, unknown> : {};
    if (Object.keys(ref).some(key => !["kind", "capability_id", "version"].includes(key)) || ref.kind !== "code_root"
      || typeof ref.capability_id !== "string" || !Number.isInteger(ref.version) || Number(ref.version) < 1) { problems.push("onboarding.takes 每条必须是 { kind: \"code_root\", capability_id, version }"); continue; }
    if (kinds.has(ref.kind)) problems.push(`onboarding.takes 里 ${ref.kind} 只能有一条`);
    kinds.add(ref.kind);
    const action = actions.find(item => item.capability_id === ref.capability_id && item.version === ref.version);
    if (!action) { problems.push("onboarding.takes 必须引用本插件声明的动作"); continue; }
    if (action.action.scope !== "project" || action.operation !== "command") problems.push("onboarding 的承接动作必须是项目里的写动作");
    if (action.action.audiences.length !== 1 || action.action.audiences[0] !== "user") problems.push("onboarding 的承接动作必须只给本人（audiences: [\"user\"]）");
    if (!same(action.action.input_schema, ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA)) problems.push("onboarding 的承接动作输入必须正好是 ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA");
    if (!same(action.action.output_schema, ONBOARDING_TAKE_RESULT_SCHEMA)) problems.push("onboarding 的承接动作输出必须正好是 ONBOARDING_TAKE_RESULT_SCHEMA");
  }
  return problems;
}
