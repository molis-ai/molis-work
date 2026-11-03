import {
  AGENT_PROMPT_LAYERS, BUSINESS_HOST_TOOLS, SKILL_TOOLS,
  type AgentManifest, type AgentRoleDeclaration, type AgentSkillDeclaration, type AgentSubagentRoleDeclaration, type AgentSubagentsDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";

// The checks a Manifest's `agent` and `methods` blocks get. `parsePluginManifest` is the one caller; they return every problem, in
// the order the checks run, so an author sees the whole contract at once. Moved here from the contracts package (W3-03): they run
// code, so they live with the other Manifest rules in the SDK, and they are not part of the SDK's public exports.

const AGENT_TOKEN = /^[a-z0-9][a-z0-9-]*$/u;

function validToken(value: unknown): value is string {
  return typeof value === "string" && AGENT_TOKEN.test(value);
}

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** A Plugin's methods for other Agents (Manifest `methods`): each a declared, versioned method for business work. */
export function inspectSkillDeclarations(methods: unknown): string[] {
  if (methods === undefined) return [];
  if (!Array.isArray(methods)) return ["方法声明必须是列表"];
  const problems: string[] = [], seen = new Set<string>();
  for (const method of methods as AgentSkillDeclaration[]) {
    if (!method || !validToken(method.skill_id) || !validVersion(method.version)) { problems.push("方法声明不合法"); continue; }
    if (seen.has(method.skill_id)) problems.push(`方法重复：${method.skill_id}`);
    seen.add(method.skill_id);
    if (typeof method.name !== "string" || !method.name.trim() || method.name.length > 80) problems.push(`方法 ${method.skill_id} 需要名称（80 字以内）`);
    if (typeof method.summary !== "string" || !method.summary.trim() || method.summary.length > 300) problems.push(`方法 ${method.skill_id} 需要适用说明（300 字以内）`);
    if (!Array.isArray(method.tools) || method.tools.some(tool => !(SKILL_TOOLS as readonly string[]).includes(tool))) {
      problems.push(`方法 ${method.skill_id} 只能使用业务工具：${SKILL_TOOLS.join("、")}`);
    }
  }
  return problems;
}

/** What one pass over a list of declarations found: the problems, and the ids that passed the identity check. */
interface Reviewed {
  readonly problems: string[];
  readonly ids: Set<string>;
}

interface ReviewedRoles extends Reviewed {
  /** Roles that asked for a directory of their own per sub-Agent: the only parents a writing sub-Agent may have. */
  readonly workspaceParents: Set<string>;
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
  const prompts = reviewPrompts(agent);
  const roles = reviewRoles(agent, prompts.ids);
  return [
    ...agentPortProblems(agent, declaredInputPorts),
    ...agentRolePromptProblems(agent),
    ...prompts.problems,
    ...roles.problems,
    ...agentCharacterProblems(agent, roles.ids),
    ...agentCompactionProblems(agent, prompts.ids),
    ...(agent.ending_review && !prompts.ids.has(agent.ending_review.prompt_id) ? [`Agent 收尾核对 Prompt ${agent.ending_review.prompt_id} 未声明`] : []),
    ...agentSkillProblems(agent),
    ...agentRoleSkillProblems(agent),
    ...agentSubagentProblems(agent, roles.ids, prompts.ids, roles.workspaceParents),
  ];
}

/** The input ports the block points at: the directory port and the text sources. */
function agentPortProblems(agent: AgentManifest, declaredInputPorts: readonly string[]): string[] {
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
  return problems;
}

/** A role may only name prompts the block declares. */
function agentRolePromptProblems(agent: AgentManifest): string[] {
  const problems: string[] = [];
  const declaredPromptIds = new Set((agent.prompts ?? []).map((prompt) => prompt.prompt_id));
  for (const role of agent.roles ?? []) {
    for (const promptId of role.prompts ?? []) {
      if (!declaredPromptIds.has(promptId)) {
        problems.push(`角色 ${role.role_id} 引用了未声明的 Prompt ${promptId}`);
      }
    }
  }
  return problems;
}

function reviewPrompts(agent: AgentManifest): Reviewed {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const prompt of agent.prompts ?? []) {
    if (!validToken(prompt.prompt_id) || !validVersion(prompt.version)) {
      problems.push("Agent Prompt 声明不合法");
      continue;
    }
    if (ids.has(prompt.prompt_id)) problems.push(`Agent Prompt 重复：${prompt.prompt_id}`);
    if (prompt.layer !== undefined && !AGENT_PROMPT_LAYERS.includes(prompt.layer)) {
      problems.push(`Agent Prompt ${prompt.prompt_id} 的层级不合法：${String(prompt.layer)}`);
    }
    if (prompt.layer === "task") {
      // The task is what the user typed this time. A package that ships one is
      // putting words in their mouth, and the surface that shows "your task"
      // would be showing somebody else's.
      problems.push(`Agent Prompt ${prompt.prompt_id} 不能声明为 task 层：任务是用户这一次写的`);
    }
    ids.add(prompt.prompt_id);
  }
  return { problems, ids };
}

function reviewRoles(agent: AgentManifest, promptIds: ReadonlySet<string>): ReviewedRoles {
  const problems: string[] = [];
  const ids = new Set<string>();
  const workspaceParents = new Set<string>();
  if (!Array.isArray(agent.roles) || agent.roles.length === 0) {
    problems.push("Agent 至少需要一个角色");
  }
  for (const role of agent.roles ?? []) {
    if (!validToken(role.role_id) || !validVersion(role.version)) {
      problems.push("Agent 角色声明不合法");
      continue;
    }
    if (ids.has(role.role_id)) {
      problems.push(`Agent 角色重复：${role.role_id}`);
      continue;
    }
    ids.add(role.role_id);
    problems.push(...agentRoleProblems(agent, role, promptIds));
    if (role.subagent_workspaces === "required") {
      if (role.execution !== undefined && role.execution !== "read-only") {
        problems.push(`Agent 角色 ${role.role_id} 要求独立子目录时必须是只读父角色`);
      }
      workspaceParents.add(role.role_id);
    }
  }
  return { problems, ids, workspaceParents };
}

/** One role that passed the identity check: its workspace, execution and prompts. */
function agentRoleProblems(agent: AgentManifest, role: AgentRoleDeclaration, promptIds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (role.workspace !== undefined && role.workspace !== "required" && role.workspace !== "none" && role.workspace !== "business") {
    problems.push(`Agent 角色 ${role.role_id} 的工作区声明无效`);
  }
  if (role.workspace === "business" && (!["read-only", "operate"].includes(role.execution ?? "read-only")
    || role.host_tools?.some(tool => !(BUSINESS_HOST_TOOLS as readonly string[]).includes(tool))
    || role.subagent_workspaces || agent.subagents?.parent_role_ids.includes(role.role_id))) {
    problems.push(`业务角色 ${role.role_id} 只能只读或经审查操作，工具限于 ${BUSINESS_HOST_TOOLS.join("、")}，不能分派子任务`);
  }
  if (role.execution === "operate" && role.workspace !== "business") {
    problems.push(`Agent 角色 ${role.role_id} 的 operate 执行方式只用于业务角色`);
  }
  if (role.workspace === "none" && ((role.execution ?? "read-only") !== "read-only" || role.host_tools?.length
    || role.subagent_workspaces || agent.subagents?.parent_role_ids.includes(role.role_id))) {
    problems.push(`无工作区角色 ${role.role_id} 必须为不使用工具或子任务的只读推理`);
  }
  // A role must resolve to at least one prompt: either the ones it names, or
  // — for a role that names none — a prompt sharing its id. A role running
  // with no prompt at all would be an agent with no instructions.
  const named = role.prompts ?? [];
  if (named.length === 0 && !promptIds.has(role.role_id)) {
    problems.push(`Agent 角色 ${role.role_id} 既没有声明 prompts，也没有同名 Prompt`);
  }
  return problems;
}

function agentCharacterProblems(agent: AgentManifest, roleIds: ReadonlySet<string>): string[] {
  const selection = agent.characters;
  if (!selection) return [];
  if (selection.selection !== "optional-exact-artifact" || selection.scope !== "project-owner"
    || !Array.isArray(selection.role_ids) || !selection.role_ids.length
    || new Set(selection.role_ids).size !== selection.role_ids.length
    || selection.role_ids.some(id => !roleIds.has(id))) return ["Agent Character 必须声明本项目本人范围、精确版本选择和已声明的角色"];
  return [];
}

function agentCompactionProblems(agent: AgentManifest, promptIds: ReadonlySet<string>): string[] {
  const compaction = agent.compaction;
  if (!compaction) return [];
  const problems: string[] = [];
  if (!promptIds.has(compaction.prompt_id)) {
    problems.push(`Agent 压缩 Prompt ${compaction.prompt_id} 未声明`);
  }
  if (!Number.isSafeInteger(compaction.above_tokens) || compaction.above_tokens < 1) {
    problems.push("Agent 压缩阈值无效");
  }
  return problems;
}

function agentSkillProblems(agent: AgentManifest): string[] {
  const problems: string[] = [];
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
  return problems;
}

/**
 * A role's methods for its purpose: picked from the block's own methods, defaults among the allowed, and each allowed
 * method's tools among the role's — the same rule the Host applies to a selection at start, checked before install.
 */
function agentRoleSkillProblems(agent: AgentManifest): string[] {
  const problems: string[] = [];
  const declared = new Map((agent.skills ?? []).map(skill => [skill.skill_id, skill]));
  for (const role of agent.roles ?? []) {
    const skills = role.skills;
    if (skills === undefined) continue;
    const allowed = skills.allowed, defaults = skills.default ?? [];
    if (!Array.isArray(allowed) || !allowed.length || !Array.isArray(defaults)
      || [...allowed, ...defaults].some(id => !validToken(id))
      || new Set(allowed).size !== allowed.length || new Set(defaults).size !== defaults.length) {
      problems.push(`角色 ${role.role_id} 的方法声明不合法：allowed 至少一项，各项不重复`);
      continue;
    }
    if (role.workspace === "none") problems.push(`无工作区角色 ${role.role_id} 不能带方法`);
    const tools = new Set(role.host_tools ?? []);
    for (const id of allowed) {
      const skill = declared.get(id);
      if (!skill) problems.push(`角色 ${role.role_id} 引用了未声明的方法 ${id}`);
      else if (Array.isArray(skill.tools) && skill.tools.some(tool => !tools.has(tool))) {
        problems.push(`角色 ${role.role_id} 给不了方法 ${id} 要的工具：${skill.tools.filter(tool => !tools.has(tool)).join("、")}`);
      }
    }
    for (const id of defaults) if (!allowed.includes(id)) problems.push(`角色 ${role.role_id} 的默认方法 ${id} 不在可选方法里`);
  }
  return problems;
}

function agentSubagentProblems(
  agent: AgentManifest,
  roleIds: ReadonlySet<string>,
  promptIds: ReadonlySet<string>,
  workspaceParents: ReadonlySet<string>,
): string[] {
  const subagents = agent.subagents;
  if (!subagents) return [];
  const problems: string[] = [];
  for (const parent of subagents.parent_role_ids ?? []) {
    if (!roleIds.has(parent)) problems.push(`子 Agent 父角色 ${parent} 未声明`);
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
    problems.push(...subagentRoleProblems(subagents, child, promptIds, workspaceParents));
  }
  return problems;
}

/** One sub-Agent role that passed the identity check: its prompt, its parents and where it may write. */
function subagentRoleProblems(
  subagents: AgentSubagentsDeclaration,
  child: AgentSubagentRoleDeclaration,
  promptIds: ReadonlySet<string>,
  workspaceParents: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  if (!promptIds.has(child.role_id)) {
    problems.push(`子 Agent 角色 ${child.role_id} 没有对应 Prompt 声明`);
  }
  for (const parent of child.parent_role_ids ?? []) {
    if (!(subagents.parent_role_ids ?? []).includes(parent)) {
      problems.push(`子 Agent 角色 ${child.role_id} 引用了未登记的父角色 ${parent}`);
    }
  }
  // A child that can write files works only in its own directory. One that only runs commands (each a Host review)
  // may work in the main workspace, as a reviewer running the checks does.
  const writesFiles = child.host_tools === undefined || child.host_tools.some((tool) => tool === "write" || tool === "edit-file");
  if (child.execution === "workspace-write" && writesFiles) {
    const parents = child.parent_role_ids ?? subagents.parent_role_ids ?? [];
    const allOwnWorkspaces = parents.length > 0
      && parents.every((parent) => workspaceParents.has(parent));
    if (!allOwnWorkspaces) {
      problems.push(`可写子 Agent ${child.role_id} 只能属于要求独立子目录的父角色`);
    }
  }
  return problems;
}
