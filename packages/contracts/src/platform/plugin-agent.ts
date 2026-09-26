import type { ContractDescriptor } from "./package.js";

export const platformPluginAgentContract = {
  contractId: "io.molis.work.platform.plugin-agent.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/horizontal/agent-host.md",
} as const satisfies ContractDescriptor;

/**
 * How far a role may act. Omitting it means read-only. A role can never widen
 * itself at start time; the Host freezes what the Manifest registered.
 */
export type AgentRoleExecution = "read-only" | "text-edit" | "workspace-write";

export interface AgentRoleDeclaration {
  role_id: string;
  version: number;
  name: string;
  execution?: AgentRoleExecution;
  /** Explicit pure inference role. Omission requires an authorized working directory. */
  workspace?: "required" | "none";
  /**
   * Prompt ids this role is composed from, in order.
   *
   * Omitted means every declared prompt, which is only right when all of them
   * are shared. Naming them is how a role keeps its own: a read-only role must
   * not be handed the prompt that tells a writer it may edit files.
   */
  prompts?: string[];
  /** Host tool names this role may call. Implementation and effect class stay with the Host. */
  host_tools?: string[];
  /** Read-only parent roles that must hand each child its own directory. */
  subagent_workspaces?: "required";
}

export interface AgentSubagentRoleDeclaration {
  /** Explicit child tools; omission grants none. */
  host_tools?: string[];
  role_id: string;
  version: number;
  name: string;
  execution?: AgentRoleExecution;
  /** Narrows which declared parent roles may dispatch this child. */
  parent_role_ids?: string[];
}

export interface AgentSubagentsDeclaration {
  parent_role_ids: string[];
  roles: AgentSubagentRoleDeclaration[];
}

/** Prompt bodies live in the Plugin package, never in the Manifest. */
/**
 * Which layer a prompt belongs to.
 *
 * A Run's instructions come from four different owners, and they answer to
 * different people: the product decides `base`, the Plugin's role decides
 * `role`, the project decides `project`, and the user decides `task`. Flattening
 * them into one string made the order the only thing distinguishing them — so
 * nothing could be replaced, shown or tested on its own.
 *
 * `task` is never a **declared** prompt. The task is what the user typed this
 * time; a package shipping one would be putting words in their mouth, and
 * `inspectAgentManifest` refuses it.
 */
export type AgentPromptLayer = "base" | "role" | "project" | "task";

/** Composition order. Later layers speak about the situation earlier ones set up. */
export const AGENT_PROMPT_LAYERS: readonly AgentPromptLayer[] = [
  "base", "role", "project", "task",
];

export interface AgentPromptDeclaration {
  prompt_id: string;
  version: number;
  /** Omitted means `role`, which is what a Plugin's own prompt almost always is. */
  layer?: AgentPromptLayer;
}

export interface AgentCompactionDeclaration {
  prompt_id: string;
  above_tokens: number;
}

export interface AgentSkillDeclaration {
  skill_id: string;
  version: number;
  name: string;
  summary: string;
  tools: string[];
}

export interface AgentSkillDefinition extends AgentSkillDeclaration {
  body: string;
}

export interface AgentPromptText {
  prompt_id: string;
  version: number;
  body: string;
  /** Omitted means `role`. The Host orders a composed role by this. */
  layer?: AgentPromptLayer;
}

export function promptLayerOf(prompt: { layer?: AgentPromptLayer }): AgentPromptLayer {
  return prompt.layer ?? "role";
}

/**
 * Order prompts by layer, keeping the caller's order inside each layer.
 *
 * Stable on purpose: a role names its prompts in an order it meant, and
 * layering must not shuffle that — it only decides which group comes first.
 */
export function orderPromptsByLayer<T extends { layer?: AgentPromptLayer }>(
  prompts: readonly T[],
): T[] {
  return AGENT_PROMPT_LAYERS.flatMap(
    (layer) => prompts.filter((prompt) => promptLayerOf(prompt) === layer),
  );
}

/** A text material the Agent may read, taken from one of the Plugin's inputs. */
export interface AgentTextSourceDeclaration {
  input_port: string;
  output_port: string;
  artifact_type_id: string;
  schema_version: number;
}

export interface AgentManifest {
  /**
   * Input port carrying the working directory, for a Plugin that really does
   * receive it as an Artifact.
   *
   * Optional, and normally absent: the working directory is a **Host fact**.
   * The Host authorizes it, verifies its realpath, and passes it on the start
   * request; a Plugin reads it through `projects.workspace.read.v1`, not
   * through a port. Declaring it here does not make the Host believe it —
   * start authority checks the directory either way.
   */
  directory_input_port?: string;
  text_sources?: AgentTextSourceDeclaration[];
  roles: AgentRoleDeclaration[];
  prompts: AgentPromptDeclaration[];
  compaction?: AgentCompactionDeclaration;
  skills?: AgentSkillDeclaration[];
  mcp?: boolean;
  /** Absent means Character input is not accepted. Selection always names a fixed Artifact. */
  characters?: { selection: "optional-exact-artifact"; scope: "project-owner"; role_ids: string[] };
  subagents?: AgentSubagentsDeclaration;
}

const AGENT_TOKEN = /^[a-z0-9][a-z0-9-]*$/u;

function validToken(value: unknown): value is string {
  return typeof value === "string" && AGENT_TOKEN.test(value);
}

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/**
 * Validate the Agent block against the Plugin's own ports. Returns every
 * problem so an author sees the whole contract at once.
 */
export function inspectAgentDeclaration(
  agent: AgentManifest | undefined,
  declaredInputPorts: readonly string[],
): string[] {
  if (!agent) return [];
  const problems: string[] = [];
  if (agent.directory_input_port !== undefined
    && !declaredInputPorts.includes(agent.directory_input_port)) {
    problems.push(`Agent 的 directory_input_port ${agent.directory_input_port} 不是已声明输入端口`);
  }

  for (const source of agent.text_sources ?? []) {
    if (!declaredInputPorts.includes(source.input_port)) {
      problems.push(`Agent 文本来源引用了未声明输入端口 ${source.input_port}`);
    }
    if (!validVersion(source.schema_version)) {
      problems.push(`Agent 文本来源 ${source.input_port} 的 schema_version 无效`);
    }
  }

  const declaredPromptIds = new Set((agent.prompts ?? []).map((prompt) => prompt.prompt_id));
  for (const role of agent.roles ?? []) {
    for (const promptId of role.prompts ?? []) {
      if (!declaredPromptIds.has(promptId)) {
        problems.push(`角色 ${role.role_id} 引用了未声明的 Prompt ${promptId}`);
      }
    }
  }

  const prompts = new Set<string>();
  for (const prompt of agent.prompts ?? []) {
    if (!validToken(prompt.prompt_id) || !validVersion(prompt.version)) {
      problems.push("Agent Prompt 声明不合法");
      continue;
    }
    if (prompts.has(prompt.prompt_id)) problems.push(`Agent Prompt 重复：${prompt.prompt_id}`);
    if (prompt.layer !== undefined && !AGENT_PROMPT_LAYERS.includes(prompt.layer)) {
      problems.push(`Agent Prompt ${prompt.prompt_id} 的层级不合法：${String(prompt.layer)}`);
    }
    if (prompt.layer === "task") {
      // The task is what the user typed this time. A package that ships one is
      // putting words in their mouth, and the surface that shows "your task"
      // would be showing somebody else's.
      problems.push(`Agent Prompt ${prompt.prompt_id} 不能声明为 task 层：任务是用户这一次写的`);
    }
    prompts.add(prompt.prompt_id);
  }

  const roles = new Set<string>();
  const workspaceParents = new Set<string>();
  if (!Array.isArray(agent.roles) || agent.roles.length === 0) {
    problems.push("Agent 至少需要一个角色");
  }
  for (const role of agent.roles ?? []) {
    if (!validToken(role.role_id) || !validVersion(role.version)) {
      problems.push("Agent 角色声明不合法");
      continue;
    }
    if (roles.has(role.role_id)) {
      problems.push(`Agent 角色重复：${role.role_id}`);
      continue;
    }
    roles.add(role.role_id);
    if (role.workspace !== undefined && role.workspace !== "required" && role.workspace !== "none") {
      problems.push(`Agent 角色 ${role.role_id} 的工作区声明无效`);
    }
    if (role.workspace === "none" && ((role.execution ?? "read-only") !== "read-only" || role.host_tools?.length
      || role.subagent_workspaces || agent.subagents?.parent_role_ids.includes(role.role_id))) {
      problems.push(`无工作区角色 ${role.role_id} 必须为不使用工具或子任务的只读推理`);
    }
    // A role must resolve to at least one prompt: either the ones it names, or
    // — for a role that names none — a prompt sharing its id. A role running
    // with no prompt at all would be an agent with no instructions.
    const named = role.prompts ?? [];
    if (named.length === 0 && !prompts.has(role.role_id)) {
      problems.push(`Agent 角色 ${role.role_id} 既没有声明 prompts，也没有同名 Prompt`);
    }
    if (role.subagent_workspaces === "required") {
      if (role.execution !== undefined && role.execution !== "read-only") {
        problems.push(`Agent 角色 ${role.role_id} 要求独立子目录时必须是只读父角色`);
      }
      workspaceParents.add(role.role_id);
    }
  }

  if (agent.characters) {
    const selection = agent.characters;
    if (selection.selection !== "optional-exact-artifact" || selection.scope !== "project-owner"
      || !Array.isArray(selection.role_ids) || !selection.role_ids.length
      || new Set(selection.role_ids).size !== selection.role_ids.length
      || selection.role_ids.some(id => !roles.has(id))) problems.push("Agent Character 必须声明本项目本人范围、精确版本选择和已声明的角色");
  }

  if (agent.compaction) {
    if (!prompts.has(agent.compaction.prompt_id)) {
      problems.push(`Agent 压缩 Prompt ${agent.compaction.prompt_id} 未声明`);
    }
    if (!Number.isSafeInteger(agent.compaction.above_tokens) || agent.compaction.above_tokens < 1) {
      problems.push("Agent 压缩阈值无效");
    }
  }

  const skills = new Set<string>();
  for (const skill of agent.skills ?? []) {
    if (!validToken(skill.skill_id) || !validVersion(skill.version)) {
      problems.push("Agent 方法声明不合法");
      continue;
    }
    if (skills.has(skill.skill_id)) problems.push(`Agent 方法重复：${skill.skill_id}`);
    skills.add(skill.skill_id);
    if (!Array.isArray(skill.tools) || skill.tools.length === 0) {
      problems.push(`Agent 方法 ${skill.skill_id} 必须声明可用工具`);
    }
  }

  const subagents = agent.subagents;
  if (subagents) {
    for (const parent of subagents.parent_role_ids ?? []) {
      if (!roles.has(parent)) problems.push(`子 Agent 父角色 ${parent} 未声明`);
    }
    const childRoles = new Set<string>();
    for (const child of subagents.roles ?? []) {
      if (!validToken(child.role_id) || !validVersion(child.version)) {
        problems.push("子 Agent 角色声明不合法");
        continue;
      }
      if (childRoles.has(child.role_id)) {
        problems.push(`子 Agent 角色重复：${child.role_id}`);
        continue;
      }
      childRoles.add(child.role_id);
      if (!prompts.has(child.role_id)) {
        problems.push(`子 Agent 角色 ${child.role_id} 没有对应 Prompt 声明`);
      }
      for (const parent of child.parent_role_ids ?? []) {
        if (!(subagents.parent_role_ids ?? []).includes(parent)) {
          problems.push(`子 Agent 角色 ${child.role_id} 引用了未登记的父角色 ${parent}`);
        }
      }
      if (child.execution === "workspace-write") {
        const parents = child.parent_role_ids ?? subagents.parent_role_ids ?? [];
        const allOwnWorkspaces = parents.length > 0
          && parents.every((parent) => workspaceParents.has(parent));
        if (!allOwnWorkspaces) {
          problems.push(`可写子 Agent ${child.role_id} 只能属于要求独立子目录的父角色`);
        }
      }
    }
  }
  return problems;
}
