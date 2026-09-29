import type { InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { AgentPromptRegistration, AgentRoleRegistration } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { COGNIA_EVIDENCE_PROMPT, INFORMATION_PLANNER, ONBOARDING_NOTES, ONBOARDING_PROPOSAL } from "./system-prompts.js";
import { BUILDER_PLUGIN_ID, BUILDER_PROMPTS, BUILDER_PROMPT_TITLES, builderPromptVersion, type BuilderPromptName } from "@molis-ai/molis-work-plugin-builder";
import { PAGES_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-pages";
import { JELLY_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-jelly";
import { FORM_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-form";
import { DATASET_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-dataset";
import { LINGGUANG_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { WORKFLOWS_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-workflows";
import { COGNIA_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-cognia";
import { ALCHEMIST_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { TODO_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-todo";

/**
 * Every instruction a built-in model call uses. A Plugin's live in its package and are listed here once; the Host's own
 * sit beside the code that calls the model. `tests/prompt-registration.test.ts` fails when a call's instructions are
 * not in this list, or when a call sends a raw prompt string.
 */
export const BUILTIN_INSTRUCTIONS: readonly InstructionPrompt[] = [...PAGES_INSTRUCTIONS, ...JELLY_INSTRUCTIONS, ...FORM_INSTRUCTIONS, ...DATASET_INSTRUCTIONS,
  ...LINGGUANG_INSTRUCTIONS, ...WORKFLOWS_INSTRUCTIONS, ...COGNIA_INSTRUCTIONS, ...ALCHEMIST_INSTRUCTIONS, ...TODO_INSTRUCTIONS, ONBOARDING_NOTES, ONBOARDING_PROPOSAL, INFORMATION_PLANNER];

/**
 * Role prompts of Agents the Host starts itself, outside any Plugin manifest (Cognia's knowledge answers), with the
 * owner their runs resolve under. Registered so the person can see and edit them like every other prompt.
 */
export const BUILTIN_INLINE_AGENT_PROMPTS: ReadonlyArray<{ owner_id: string; prompt: AgentPromptRegistration }> = [
  { owner_id: "io.molis.work.cognia", prompt: { prompt_id: COGNIA_EVIDENCE_PROMPT.prompt_id, version: COGNIA_EVIDENCE_PROMPT.version, kind: "agent", layer: "base",
    title: "知识助手角色", purpose: "Cognia 整理与问答运行时的角色说明", used_by: ["Cognia 整理", "Cognia 问答"], body: COGNIA_EVIDENCE_PROMPT.body } },
  // Plugin Builder's designer and code Agents run these, outside the Agent Host; its workflow asks for them by name.
  ...(Object.keys(BUILDER_PROMPTS) as BuilderPromptName[]).map(name => ({ owner_id: BUILDER_PLUGIN_ID, prompt: { prompt_id: `builder-${name}`, version: builderPromptVersion(name),
    kind: "agent" as const, layer: "role" as const, ...BUILDER_PROMPT_TITLES[name], used_by: [...BUILDER_PROMPT_TITLES[name].used_by], body: BUILDER_PROMPTS[name].text } })),
];

/** Roles of those Agents, so they show as Characters beside the ones Plugin manifests declare. */
export const BUILTIN_INLINE_AGENT_ROLES: ReadonlyArray<{ owner_id: string; role: AgentRoleRegistration }> = [
  { owner_id: BUILDER_PLUGIN_ID, role: { role_id: "designer", version: 1, name: "主线设计师", purpose: "理解需求，设计插件的产品与功能合同；没有工具，只输出设计",
    execution: "read-only", workspace: "none", prompt_ids: ["builder-designer"] } },
  { owner_id: BUILDER_PLUGIN_ID, role: { role_id: "coder", version: 1, name: "代码 Agent", purpose: "在构建目录里写插件代码：实现、按意见修改、按检查修复、处理验收失败，每次按任务用其中一段",
    execution: "workspace-write", workspace: "required", prompt_ids: ["builder-implement", "builder-revise", "builder-repair", "builder-acceptance"] } },
];

/**
 * Model calls that still send text nobody can see in “Prompt 与 Character”, shown in developer diagnostics. Keep in
 * step with the transitional list in `tests/prompt-registration.test.ts`.
 */
export const UNREGISTERED_MODEL_CALLS: ReadonlyArray<{ owner_id: string; title: string; reason: string }> = [];

/** Built-in Plugins whose manifest Agent block is not what their runs use; their real prompts are registered above instead. */
export const UNUSED_MANIFEST_AGENTS: ReadonlySet<string> = new Set([BUILDER_PLUGIN_ID]);

/** The Host's own modules that call a model directly, by the owner id their instructions use. */
export const SYSTEM_INSTRUCTION_SOURCES: Readonly<Record<string, string>> = { "system:onboarding": "项目上手", "system:information": "信息助手" };
