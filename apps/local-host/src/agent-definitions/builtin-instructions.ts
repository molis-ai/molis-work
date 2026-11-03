import type { InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { AgentPromptRegistration, AgentRoleRegistration } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { CONTEXTUAL_DRAFT, CONTEXTUAL_NEXT, CONTEXTUAL_SURFACE, INFORMATION_PLANNER, KNOWLEDGE_LOCATE, KNOWLEDGE_ORGANIZE, MEMORY_EXTRACT, MEMORY_TIDY, ONBOARDING_NOTES, ONBOARDING_PROPOSAL } from "./system-prompts.js";
import { BUILDER_CHOICE_INSTRUCTIONS, BUILDER_PLUGIN_ID, BUILDER_PROMPTS, BUILDER_PROMPT_TITLES, builderPromptVersion, type BuilderPromptName } from "@molis-ai/molis-work-plugin-builder";
import { ALCHEMIST_INSTRUCTIONS } from "../alchemist-prologue.js";

/**
 * Every instruction a model call the Host makes itself uses: its own modules', which sit beside the code that calls the model, Plugin
 * Builder's (a platform capability, PG-051 Q2) and Alchemist's (served by the Host, not run by the Plugin Runtime). A running plugin's
 * come with its definition (`PluginDefinition.instructions`, PG-051). `tests/prompt-registration.test.ts` fails when a call's
 * instructions are in neither, or when a call sends a raw prompt string.
 */
export const BUILTIN_INSTRUCTIONS: readonly InstructionPrompt[] = [
  ...BUILDER_CHOICE_INSTRUCTIONS, ...ALCHEMIST_INSTRUCTIONS, ONBOARDING_NOTES, ONBOARDING_PROPOSAL, INFORMATION_PLANNER, MEMORY_EXTRACT, MEMORY_TIDY,
  CONTEXTUAL_NEXT, CONTEXTUAL_SURFACE, CONTEXTUAL_DRAFT, KNOWLEDGE_ORGANIZE, KNOWLEDGE_LOCATE,
];

/**
 * Role prompts of Agents the Host starts itself, outside any Plugin manifest (Plugin Builder's designer and code Agents), with the
 * owner their runs resolve under. Registered so the person can see and edit them like every other prompt.
 */
export const BUILTIN_INLINE_AGENT_PROMPTS: ReadonlyArray<{ owner_id: string; prompt: AgentPromptRegistration }> = [
  // Plugin Builder's designer and code Agents run these, outside the Agent Host; its workflow asks for them by name.
  ...(Object.keys(BUILDER_PROMPTS) as BuilderPromptName[]).map(name => ({ owner_id: BUILDER_PLUGIN_ID, prompt: { prompt_id: `builder-${name}`, version: builderPromptVersion(name),
    kind: "agent" as const, layer: "role" as const, ...BUILDER_PROMPT_TITLES[name], used_by: [...BUILDER_PROMPT_TITLES[name].used_by], body: BUILDER_PROMPTS[name].text } })),
];

/** Roles of those Agents, so they show as Characters beside the ones Plugin manifests declare. */
export const BUILTIN_INLINE_AGENT_ROLES: ReadonlyArray<{ owner_id: string; role: AgentRoleRegistration }> = [
  { owner_id: BUILDER_PLUGIN_ID, role: { role_id: "designer", version: 2, name: "主线设计师", purpose: "理解需求，规划体验、功能合同与界面，并按截图复查；没有工具，每次按阶段使用对应指令",
    execution: "read-only", workspace: "none", prompt_ids: ["builder-designer", "builder-experience", "builder-ui", "builder-review"] } },
  { owner_id: BUILDER_PLUGIN_ID, role: { role_id: "coder", version: 1, name: "代码 Agent", purpose: "在构建目录里写插件代码：实现、按意见修改、按检查修复、处理验收失败，每次按任务用其中一段",
    execution: "workspace-write", workspace: "required", prompt_ids: ["builder-implement", "builder-revise", "builder-repair", "builder-acceptance"] } },
];

/**
 * Model calls that still send text nobody can see in “Prompt 与 Character”, shown in developer diagnostics. Keep in
 * step with the transitional list in `tests/prompt-registration.test.ts`.
 */
export const UNREGISTERED_MODEL_CALLS: ReadonlyArray<{ owner_id: string; title: string; reason: string }> = [
];

/**
 * The platform's own owners of instructions and Agents, by owner id: the Host's modules, and Plugin Builder, which keeps its plugin id as
 * owner so the person's edits stay theirs (PG-051 Q2).
 */
export const SYSTEM_INSTRUCTION_SOURCES: Readonly<Record<string, { module: string; title: string }>> = {
  "system:onboarding": { module: "onboarding", title: "项目上手" }, "system:information": { module: "information", title: "信息助手" },
  "system:memory": { module: "memory", title: "记忆" }, "system:contextual": { module: "contextual", title: "选区推荐" },
  [BUILDER_PLUGIN_ID]: { module: "plugin-builder", title: "插件创作工作台" },
};
