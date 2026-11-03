import { agentErrors } from "./errors.js";
import { assertChildRoleTools } from "./child-role-tools.js";
import { requireSynchronous, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { currentCharacterMatches } from "./character-import.js";
import type {
  AgentManifest,
  AgentPromptText,
  AgentRoleDeclaration,
  AgentRoleExecution,
  AgentSkillDefinition,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { BUSINESS_HOST_TOOLS, orderPromptsByLayer } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type {
  AgentActionClient,
  AgentActionOffer,
  AgentFrozenCharacter,
  AgentFrozenSubagentRole,
  AgentMcpLibrary,
  AgentRunHandle,
  AgentRuntimeAdapter,
  AgentRuntimeCapability,
  AgentSessionRef,
  AgentSessionView,
  AgentSkillOwner,
  AgentStartRequest,
  AgentSubagentWorkspace,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { SUGGEST_HOST_TOOL } from "./adapters/prologue-action-tools.js";
import type { AgentStartAuthority } from "./index.js";

/**
 * The stages of the Host's start check (AgentHost.start): each freezes one part of what a round may do from the Plugin's
 * own declarations, so the adapter receives exactly what it is allowed to run instead of resolving it itself.
 */

type FrozenRole = NonNullable<AgentStartRequest["role"]>;

/** Capabilities a role needs before it may run. Omitted execution means read-only. */
export const EXECUTION_CAPABILITIES: Readonly<Record<AgentRoleExecution, AgentRuntimeCapability[]>> = {
  "read-only": [],
  "text-edit": ["text-edit"],
  "workspace-write": ["text-edit", "command"],
  // Business commands are unified actions under the effect policy, not files or shell commands.
  operate: [],
};

/** A prompt the Agent sends on the side of its rounds (compaction, the ending review), at the version its manifest declares. */
function declaredSidePrompt(authority: AgentStartAuthority, promptId: string | undefined): AgentPromptText | undefined {
  const declaration = promptId === undefined ? undefined : authority.manifest.prompts?.find(item => item.prompt_id === promptId);
  const prompt = authority.prompts?.find(item => item.prompt_id === declaration?.prompt_id && item.version === declaration.version);
  return prompt?.body.trim() ? { ...prompt } : undefined;
}

/**
 * The prompt bodies this role runs with, layer by layer.
 *
 * A role that names its prompts gets exactly those. A role that names none
 * falls back to every declared prompt, which is right only when all of them are
 * shared — an earlier version did that unconditionally, so a read-only role was
 * handed the writer's prompt.
 *
 * The project layer is appended from what the **Host** supplies, not from the
 * Plugin package: a project's conventions belong to the project, and a Plugin
 * that could ship them would be speaking for every project it is installed in.
 * Layers are then ordered base → role → project, stably, so the order inside a
 * layer stays the one the role meant.
 *
 * The task is not here. It travels as its own argument, because it is what the
 * user typed this time and nothing in a package may stand in for it.
 */
export function composeRolePrompts(
  role: AgentRoleDeclaration,
  authority: AgentStartAuthority,
  character?: AgentFrozenCharacter,
  characterInstructions?: string,
): AgentPromptText[] {
  const available = authority.prompts ?? [];
  const named = role.prompts;
  const own = named === undefined
    ? (() => {
      const declared = new Set((authority.manifest.prompts ?? []).map((item) => item.prompt_id));
      return available.filter((prompt) => declared.has(prompt.prompt_id) && prompt.prompt_id !== authority.manifest.compaction?.prompt_id && prompt.prompt_id !== authority.manifest.ending_review?.prompt_id);
    })()
    : named.flatMap((promptId) => {
      const found = available.find((prompt) => prompt.prompt_id === promptId);
      return found === undefined ? [] : [found];
    });
  const project = (authority.project_prompts ?? []).map((prompt) => ({
    ...prompt,
    // Forced rather than trusted: whatever the Host called it, a prompt that
    // arrives on the project channel is the project layer.
    layer: "project" as const,
  }));
  const characterPrompt: AgentPromptText[] = character ? [{ prompt_id: `character-${character.character_id}`, version: character.reference.version,
    layer: "role", body: characterInstructions ?? character.instructions }] : [];
  return orderPromptsByLayer([...own, ...characterPrompt, ...project]);
}

/** Omitting `execution` means read-only. Callers must not reimplement this default. */
export function roleExecution(role: AgentRoleDeclaration): AgentRoleExecution {
  return role.execution ?? "read-only";
}

export function assertInferenceRole(role: AgentRoleDeclaration, manifest: AgentManifest): void {
  if (role.workspace !== "none" || roleExecution(role) !== "read-only" || role.host_tools?.length
    || role.subagent_workspaces || manifest.subagents?.parent_role_ids.includes(role.role_id)) {
    throw agentErrors.role_execution_exceeded("此角色没有声明无工作区、无工具的推理方式");
  }
}

/** A business role: no directory, root-free host tools only, no children of its own (yet). */
export function assertBusinessRole(role: AgentRoleDeclaration, manifest: AgentManifest): void {
  if (role.workspace !== "business" || !["read-only", "operate"].includes(roleExecution(role))
    || role.host_tools?.some(tool => !(BUSINESS_HOST_TOOLS as readonly string[]).includes(tool))
    || role.subagent_workspaces || manifest.subagents?.parent_role_ids.includes(role.role_id)) {
    throw agentErrors.role_execution_exceeded("此角色没有声明无目录的业务执行方式");
  }
}

/** Suggesting offers the person one of the round's own actions as a button: only a role that may change things may do it. */
export function assertMaySuggest(hostTools: readonly string[], execution: string | undefined): void {
  if (hostTools.includes(SUGGEST_HOST_TOOL) && execution !== "workspace-write" && execution !== "operate") {
    throw agentErrors.role_execution_exceeded("当前执行方式只读，不能向人建议操作，请更换执行方式");
  }
}

/** A per-action round's client: discovering, checking and invoking only, each rechecking the Character it runs as. */
function frozenActionClient(source: AgentActionClient, validateCharacter: (() => void) | undefined): AgentActionClient {
  return {
    discover: async () => { validateCharacter?.(); return source.discover(); },
    ...(source.check ? { check: async (ref: ExactActionReference, input: unknown) => { validateCharacter?.(); return source.check!(ref, input); } } : {}),
    invoke: async (ref, input, signal) => { validateCharacter?.(); return source.invoke(ref, input, signal); },
  };
}

/** The role is declared, the runtime carries what it needs, and the request's workspace is the one the role declares. */
export function checkStartRole(adapter: AgentRuntimeAdapter, runtimeId: string, request: AgentStartRequest, authority: AgentStartAuthority) {
  const role = authority.manifest.roles.find((item) => item.role_id === request.role_id);
  if (!role) {
    throw agentErrors.role_not_declared(`插件没有声明角色 ${request.role_id}`);
  }
  const execution = roleExecution(role);
  const missing = EXECUTION_CAPABILITIES[execution]
    .filter((capability) => adapter.descriptor.capabilities[capability] === "unsupported");
  if (missing.length > 0) {
    throw agentErrors.capability_unavailable(`${runtimeId} 不支持 ${missing.join("、")}，角色 ${role.role_id} 不能在它上面运行`);
  }
  const workspace = role.workspace ?? "required";
  if (workspace !== (request.workspace ?? "required")) throw agentErrors.directory_unauthorized("请求与角色的工作区方式不一致");
  if (request.workspace === "none") {
    assertInferenceRole(role, authority.manifest);
    if (!adapter.descriptor.supports_workspace_none) throw agentErrors.capability_unavailable("当前运行时尚未接通无工作区推理");
    if (request.directory !== undefined || request.action_tools?.length || request.mcp_tools?.length || request.mcp_sources?.length
      || request.subagent_workspaces?.length || request.execution_plan || request.skills?.length) {
      throw agentErrors.role_execution_exceeded("无工作区推理不能选择目录、工具、工作区方法或子任务");
    }
  } else if (request.workspace === "business") {
    assertBusinessRole(role, authority.manifest);
    if (!adapter.descriptor.supports_workspace_business) throw agentErrors.capability_unavailable("当前运行时尚未接通无目录的业务执行");
    if (request.directory !== undefined || request.mcp_tools?.length || request.mcp_sources?.length
      || request.subagent_workspaces?.length || request.execution_plan) {
      throw agentErrors.role_execution_exceeded("业务执行不能选择目录、MCP、子任务目录或执行计划");
    }
  } else if (!request.directory?.realpath_verified
    || !authority.authorizedDirectories.includes(request.directory.canonical_path)) {
    throw agentErrors.directory_unauthorized("这个目录没有被授权给当前插件");
  }
  return { role, execution, workspace };
}

/** The round is for the session it names, on this runtime, and the session is the requester's with the role's workspace. */
export function checkStartSession(session: AgentSessionView, request: AgentStartRequest, runtimeId: string, workspace: string): void {
  if (request.session.runtime_id !== runtimeId || session.session.runtime_id !== runtimeId || session.session.session_id !== request.session.session_id
    || session.owner.project_id !== request.project_id || session.owner.plugin_id !== request.plugin_id || session.owner.install_id !== request.install_id
    || session.owner.actor_id !== request.actor_id
    || (session.workspace ?? "required") !== workspace) {
    throw agentErrors.session_unknown("执行请求与原会话的身份或工作区方式不一致");
  }
}

/**
 * The Character the round runs as, at the exact version the person picked and resolved by the Host, and the built-in tools
 * it leaves the round (never more than the role's). Only the Run's selected imported Skills travel with it.
 */
export function selectStartCharacter(role: AgentRoleDeclaration, request: AgentStartRequest, authority: AgentStartAuthority) {
  let character: AgentFrozenCharacter | undefined;
  let hostTools = [...(role.host_tools ?? [])];
  if (request.character !== undefined && request.character !== null) {
    const declared = authority.manifest.characters;
    if (!declared || declared.selection !== "optional-exact-artifact" || declared.scope !== "project-owner"
      || !declared.role_ids.includes(role.role_id) || !authority.resolveCharacter) {
      throw agentErrors.capability_unavailable("当前调用方或执行方式未开放 Character 选择");
    }
    const ref = request.character;
    if (typeof ref.artifact_id !== "string" || !ref.artifact_id.trim() || ref.artifact_id.length > 200
      || !Number.isSafeInteger(ref.version) || ref.version < 1) throw agentErrors.capability_unavailable("Character 精确版本引用无效");
    character = structuredClone(authority.resolveCharacter({ artifact_id: ref.artifact_id, version: ref.version }, request.actor_id));
    if (character.reference.artifact_id !== ref.artifact_id || character.reference.version !== ref.version
      || character.project_id !== request.project_id || character.source.owner_actor_id !== request.actor_id) {
      throw agentErrors.capability_unavailable("Character 来源与本轮项目、所有者或版本不一致");
    }
    if (character.host_tools !== null) {
      if (character.host_tools.some(tool => !hostTools.includes(tool))) throw agentErrors.role_execution_exceeded("所选 Character 包含当前执行方式未开放的内置工具，请更换角色或执行方式");
      hostTools = [...character.host_tools];
    }
  }
  if (character && request.character_skill_ids !== undefined) {
    const ids = request.character_skill_ids;
    if (!Array.isArray(ids) || ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !character!.import_snapshot?.skills.some(skill => skill.id === id))) throw new Error("本轮选择的 Skill 不在 Character 固定版本中");
    // Preserve the exact source reference; carry only this Run's selected resources into runtime history.
    if (character.import_snapshot) character.import_snapshot.skills = character.import_snapshot.skills.filter(skill => ids.includes(skill.id));
  }
  return { character, hostTools };
}

/** The authority checks the round runs under, each also checking the Character is still the version it froze. */
export function startGuards(authority: AgentStartAuthority, character: AgentFrozenCharacter | undefined, request: AgentStartRequest) {
  const validateCharacter = character ? () => {
    const current = authority.resolveCharacter!(character.reference, request.actor_id);
    if (!currentCharacterMatches(character, current, request.project_id, request.actor_id)) {
      throw agentErrors.capability_unavailable("原 Character 版本已变化，请重新选择后执行");
    }
  } : undefined;
  const assertBeforeStart = () => { requireSynchronous(authority.assertBeforeStart?.(), "最终授权检查必须同步完成"); validateCharacter?.(); };
  const beforeStart = async () => { await authority.beforeStart?.(); assertBeforeStart(); };
  const beforeDispatch = async () => { await authority.beforeDispatch?.(); validateCharacter?.(); };
  return { validateCharacter, assertBeforeStart, beforeStart, beforeDispatch };
}

/** Where the round's actions come from: the runtime must take action tools, and the Host must grant this plugin some. */
interface ActionSource {
  adapter: AgentRuntimeAdapter;
  runtimeId: string;
  authority: AgentStartAuthority;
  session: AgentSessionRef;
  validateCharacter: (() => void) | undefined;
  execution: AgentRoleExecution;
}

function assertActionsSupported(source: ActionSource): asserts source is ActionSource & { authority: Required<Pick<AgentStartAuthority, "actions">> } {
  if (!source.adapter.descriptor.supports_action_tools || !source.authority.actions) throw agentErrors.capability_unavailable("当前执行引擎尚未接入动作服务");
}

async function grantedActions(source: ActionSource): Promise<AgentActionClient> {
  assertActionsSupported(source);
  return source.authority.actions(source.runtimeId, source.validateCharacter, source.session);
}

/** The per-action tools the round picked, each found in the directory now, offered to the Agent, and within the role and Character. */
export async function frozenActions(source: ActionSource, actionRefs: readonly ExactActionReference[], character: AgentFrozenCharacter | undefined): Promise<FrozenRole["actions"]> {
  if (!actionRefs.length) return undefined;
  const { execution, validateCharacter } = source;
  assertActionsSupported(source);
  const key = (ref: { capability_id: string; version: number; provider_id: string }) => JSON.stringify([ref.capability_id, ref.version, ref.provider_id]);
  if (character?.action_tools && actionRefs.some(ref => !character.action_tools!.some(allowed => key(allowed) === key(ref)))) {
    throw agentErrors.role_execution_exceeded("所选能力超出了这个 Character 的工具范围");
  }
  const client = frozenActionClient(await grantedActions(source), validateCharacter);
  const directory = await client.discover();
  const tools = actionRefs.map(ref => {
    const view = directory.find(view => view.capability_id === ref.capability_id && view.version === ref.version && view.provider.provider_id === ref.provider_id);
    if (!view || !view.action.audiences.includes("agent")) throw agentErrors.capability_unavailable("原能力、版本或提供方已不可用，或尚未授权给内置 Agent");
    if (!view.availability.available) throw agentErrors.capability_unavailable(view.availability.reason);
    if (execution !== "workspace-write" && execution !== "operate" && view.operation !== "query") throw agentErrors.role_execution_exceeded("当前执行方式只允许查询能力，请移除操作能力或更换执行方式");
    return structuredClone(view);
  });
  return { tools, client };
}

/** The gateway replaces per-action tools for business roles: the directory is read at each call, never frozen here. */
export async function frozenGateway(source: ActionSource, workspace: string): Promise<FrozenRole["action_gateway"]> {
  if (workspace !== "business") throw agentErrors.capability_unavailable("能力网关只用于业务角色");
  const { validateCharacter } = source;
  const granted = await grantedActions(source);
  return { operate: source.execution === "operate", client: {
    discover: async () => { validateCharacter?.(); return granted.discover(); },
    ...(granted.check ? { check: (ref: ExactActionReference, input: unknown) => granted.check!(ref, input) } : {}),
    ...(granted.offer ? { offer: (offer: AgentActionOffer) => { validateCharacter?.(); return granted.offer!(offer); } } : {}),
    ...(granted.delegate ? { delegate: granted.delegate } : {}),
    ...(granted.memory ? { memory: granted.memory } : {}), ...(granted.reader ? { reader: granted.reader } : {}),
    // Which changes may run without a confirmation stays the caller's call (a declared undo, the person's setting).
    ...(granted.direct ? { direct: (view: ActionView) => granted.direct!(view) } : {}),
    invoke: async (ref, input, signal) => { validateCharacter?.(); return granted.invoke(ref, input, signal); },
  } };
}

/** The MCP tools and resource sources the round picked, validated by the caller's own library; tools only for a role that may act. */
export async function frozenMcp(request: AgentStartRequest, execution: AgentRoleExecution, character: AgentFrozenCharacter | undefined,
  hostTools: readonly string[], mcpLibrary: () => { library: AgentMcpLibrary; owner: AgentSkillOwner }) {
  let mcp = request.mcp_tools ?? [];
  if (!Array.isArray(mcp) || mcp.length > 100 || new Set(mcp.map(ref => JSON.stringify([ref.server, ref.tool]))).size !== mcp.length) throw agentErrors.capability_unavailable("MCP 选择重复或超过数量限制");
  if (mcp.length) {
    if (execution !== "workspace-write") throw agentErrors.role_execution_exceeded("MCP 可能产生外部操作，请选择执行方式后使用；调用仍需逐笔审查");
    const { library, owner } = mcpLibrary();
    mcp = await library.validate(owner, mcp);
  }
  let sources = request.mcp_sources ?? [];
  if (!Array.isArray(sources) || sources.length > 100 || new Set(sources.map(ref=>ref.server)).size !== sources.length) throw agentErrors.capability_unavailable("MCP 资料来源重复或超过数量限制");
  if(sources.length) {
    if (character && !hostTools.includes("read-mcp-resource")) throw agentErrors.role_execution_exceeded("所选 Character 未开放读取 MCP 资料的工具，请调整角色或取消资料选择");
    const {library,owner}=mcpLibrary();
    sources=await library.validateSources(owner,sources);
  }
  return { mcp, sources };
}

/** The prompts sent beside the round — context compaction and the ending review — at the versions the manifest declares. */
export function frozenSidePrompts(adapter: AgentRuntimeAdapter, authority: AgentStartAuthority) {
  let compaction: { prompt: AgentPromptText; above_tokens: number } | undefined;
  const declaredCompaction = authority.manifest.compaction;
  if (declaredCompaction && adapter.descriptor.capabilities.compaction !== "unsupported") {
    const prompt = declaredSidePrompt(authority, declaredCompaction.prompt_id);
    if (!prompt || !Number.isSafeInteger(declaredCompaction.above_tokens) || declaredCompaction.above_tokens < 1) throw agentErrors.capability_unavailable("上下文整理声明缺少对应版本的正文或有效阈值");
    compaction = { prompt, above_tokens: declaredCompaction.above_tokens };
  }
  const endingReview = declaredSidePrompt(authority, authority.manifest.ending_review?.prompt_id);
  if (authority.manifest.ending_review && !endingReview) throw agentErrors.capability_unavailable("收尾核对声明缺少对应版本的正文");
  return { compaction, endingReview };
}

/** Each writing child's own authorized directory, distinct and never the main workspace; only for a declared read-only coordinator. */
function childWorkspacesOf(adapter: AgentRuntimeAdapter, role: AgentRoleDeclaration, execution: AgentRoleExecution, request: AgentStartRequest,
  authority: AgentStartAuthority): AgentSubagentWorkspace[] | undefined {
  if (role.subagent_workspaces !== "required") {
    if (request.subagent_workspaces?.length) throw agentErrors.directory_unauthorized("当前角色没有声明独立子目录");
    return undefined;
  }
  if (execution !== "read-only" || !authority.manifest.subagents?.parent_role_ids.includes(role.role_id)) throw agentErrors.role_execution_exceeded("独立子目录必须由已声明的只读协调者分派");
  if (!adapter.subagents?.workspaces || !request.subagent_workspaces?.length) throw agentErrors.capability_unavailable("请先为每个写入子任务选择独立的已授权目录");
  const ids = new Set<string>(), paths = new Set<string>();
  return request.subagent_workspaces.map(grant => {
    const path = grant.directory?.canonical_path;
    if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,63}$/.test(grant.workspace_id) || ids.has(grant.workspace_id)
      || !grant.directory?.realpath_verified || !authority.authorizedDirectories.includes(path)
      || path === request.directory?.canonical_path || paths.has(path)) throw agentErrors.directory_unauthorized("子任务目录未授权、重复或指向主工作区");
    ids.add(grant.workspace_id); paths.add(path); return structuredClone(grant);
  });
}

/** The child roles a parent role may dispatch, each frozen with no tool its parent does not hold (unless it writes in its own directory). */
export function frozenSubagents(adapter: AgentRuntimeAdapter, role: AgentRoleDeclaration, execution: AgentRoleExecution, request: AgentStartRequest,
  authority: AgentStartAuthority, hostTools: readonly string[]) {
  const childWorkspaces = childWorkspacesOf(adapter, role, execution, request, authority);
  let subagents: AgentFrozenSubagentRole[] | undefined;
  const declaration = authority.manifest.subagents;
  if (declaration?.parent_role_ids.includes(role.role_id)) {
    if (!adapter.subagents || adapter.descriptor.capabilities.subagents === "unsupported") throw agentErrors.capability_unavailable("当前运行时尚未接通子任务");
    subagents = declaration.roles.filter(child => !child.parent_role_ids || child.parent_role_ids.includes(role.role_id)).map(child => {
      const tools = child.host_tools ?? [];
      const childExecution = child.execution ?? "read-only";
      assertChildRoleTools(childExecution, tools, Boolean(childWorkspaces), hostTools);
      if (EXECUTION_CAPABILITIES[childExecution].some(capability => adapter.descriptor.capabilities[capability] === "unsupported")) throw agentErrors.capability_unavailable("运行时不能执行声明的子角色操作");
      const prompt = authority.prompts?.find(prompt => prompt.prompt_id === child.role_id && prompt.version === child.version);
      if (!prompt) throw agentErrors.role_not_declared("子角色缺少声明版本的正文");
      return { role_id: child.role_id, version: child.version, name: child.name, execution: childExecution, host_tools: [...tools],
        prompts: composeRolePrompts({ ...child, prompts: [...(role.prompts ?? []).filter(id => authority.prompts?.some(p => p.prompt_id === id && p.layer === "base")), child.role_id] }, authority) };
    });
    if (!subagents.length) throw agentErrors.role_not_declared("没有可分派的子角色");
  } else if (hostTools.some(tool => ["dispatch-subagent", "await-subagents", "steer-subagent"].includes(tool))) throw agentErrors.role_not_declared("没有声明子角色的执行方式不能分派子任务");
  return { subagents, childWorkspaces };
}

/** What the Host froze for the round, which the runtime's frozen record must repeat exactly. */
export interface StartFrozen {
  request: AgentStartRequest;
  role: AgentRoleDeclaration;
  execution: AgentRoleExecution;
  workspace: string;
  actionRefs: readonly ExactActionReference[];
  gateway: unknown;
  character: AgentFrozenCharacter | undefined;
  characterSkillIds: string[] | undefined;
  childWorkspaces: AgentSubagentWorkspace[] | undefined;
  hostTools: readonly string[];
  mcp: unknown;
  sources: unknown;
  compaction: { prompt: AgentPromptText; above_tokens: number } | undefined;
  skills: readonly AgentSkillDefinition[];
}

/**
 * The Runtime cannot widen what the Manifest froze. A mismatch is the adapter's fault, and the run does not continue on a
 * wider authority.
 */
export function widensFrozen(handle: AgentRunHandle, expected: StartFrozen): boolean {
  const { request, role, execution, workspace, actionRefs, gateway, character, characterSkillIds, childWorkspaces, hostTools, mcp, sources, compaction, skills } = expected;
  return (handle.frozen.workspace ?? "required") !== workspace
    || JSON.stringify(handle.frozen.directory) !== JSON.stringify(request.directory)
    || workspace === "none" && handle.frozen.host_tools.length !== 0
    || JSON.stringify(handle.frozen.action_tools ?? []) !== JSON.stringify(actionRefs)
    || Boolean(handle.frozen.action_gateway) !== Boolean(gateway)
    || JSON.stringify(handle.frozen.character) !== JSON.stringify(character)
    || JSON.stringify(handle.frozen.character_skill_ids) !== JSON.stringify(characterSkillIds)
    || JSON.stringify(handle.frozen.subagent_workspaces) !== JSON.stringify(childWorkspaces)
    || character !== undefined && JSON.stringify(handle.frozen.host_tools) !== JSON.stringify(hostTools)
    || JSON.stringify(handle.frozen.mcp_sources ?? []) !== JSON.stringify(sources)
    || JSON.stringify(handle.frozen.mcp_tools) !== JSON.stringify(mcp)
    || JSON.stringify(handle.frozen.compaction) !== JSON.stringify(compaction && { prompt_id: compaction.prompt.prompt_id, version: compaction.prompt.version, above_tokens: compaction.above_tokens })
    || handle.frozen.role_id !== role.role_id
    || handle.frozen.role_version !== role.version
    || handle.frozen.execution !== execution
    || JSON.stringify(handle.frozen.skills.map(skill => [skill.skill_id, skill.version])) !== JSON.stringify(skills.map(skill => [skill.skill_id, skill.version]));
}
