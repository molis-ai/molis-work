import { importedCharacterInstructions } from "./character-import.js";
import type {
  AgentManifest,
  AgentPromptText,
  AgentRoleDeclaration,
  AgentRoleExecution,
  AgentSkillDefinition,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { orderPromptsByLayer } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type {
  AgentHostApi,
  AgentHostErrorCode,
  AgentRunHandle,
  AgentRuntimeAdapter,
  AgentRuntimeCapability,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
  AgentStartRequest,
  AgentSkillCatalogEntry,
  AgentSkillRef,
  AgentSkillOwner,
  AgentWorkingDirectory,
  AgentFrozenCharacter,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";

import { AgentReviewQueue } from "./reviews.js";
import { freezeExecutionPlan, STEP_TOOLS } from "./execution-plan.js";

export { AgentReviewQueue, AgentReviewError } from "./reviews.js";
export { emptyCapabilityMatrix } from "./capabilities.js";
export {
  PrologueCredentialBridge,
  prologueAcceptsProtocol,
  prologueProtocolFacts,
  type PrologueCredentialHost,
} from "./adapters/prologue-node.js";
export {
  createModelConfigurationPort,
  prologueModelConfiguration,
  prologueProtocolFor,
  type ModelSelectionPort,
  type ResolvedModelSelection,
} from "./model-configuration.js";
export { registerAgentHostCapabilities, runViewVersion } from "./capability-registration.js";
export type {
  AgentCapabilityPorts,
  AgentCapabilityRegistrar,
} from "./capability-registration.js";
export { PrologueAgentAdapter, PrologueAdapterError, PROLOGUE_RUNTIME_ID } from "./adapters/prologue.js";
export { createPrologueNodeAdapter } from "./adapters/prologue-node.js";
export { resolveModelHostname } from "./adapters/node-model-dns.js";
export { PrologueApprovalBridge, PrologueApprovalError } from "./adapters/prologue-approvals.js";
export {
  applyPrologueEvent,
  emptyPrologueStreamState,
  prologuePhaseOf,
  settleProloguePending,
} from "./adapters/prologue-stream.js";
export type {
  PrologueApprovalWaiting,
  PrologueControlState,
  PrologueEvent,
  PrologueStreamState,
  PrologueUsageReceipt,
} from "./adapters/prologue-stream.js";
export { CliAgentAdapter, CliAgentError } from "./adapters/cli-runtime.js";
export type {
  CliAgentAdapterOptions,
  CliProcessEvent,
  CliProcessHandle,
  CliProcessPort,
} from "./adapters/cli-runtime.js";
export {
  CLI_RECEIPT_MAX_BYTES, applyCliStreamLine, emptyStreamState } from "./adapters/cli-stream.js";
export type { CliStreamState } from "./adapters/cli-stream.js";
export { createNodeCliProcessPort } from "./adapters/cli-node-process.js";
export type {
  MirrorPendingInput,
  ProloguePending,
  ProloguePendingPort,
  ProloguePendingState,
  PrologueApprovalBridgeOptions,
} from "./adapters/prologue-approvals.js";
export type { PrologueNodeAdapterOptions } from "./adapters/prologue-node.js";
export type {
  PrologueAdapterOptions,
  PrologueAdapterPorts,
  PrologueControlPort,
  PrologueModelConfiguration,
  PrologueRunPort,
  PrologueRunTiming,
  PrologueRuntimePort,
  PrologueStartInput,
} from "./adapters/prologue.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-agent-host",
  packagePath: "horizontal/agent-host",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/agent-host",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "agent.host.v1",
    "agent.review-queue.v1",
    "agent.runtimes.v1",
    "agent.run.start.v1",
    "agent.reviews.list.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export class AgentHostError extends Error {
  constructor(
    readonly code: Extract<AgentHostErrorCode,
      | "agent.session_unknown"
      | "agent.run_unknown"
      | "agent.runtime_unknown"
      | "agent.runtime_duplicate"
      | "agent.capability_unavailable"
      | "agent.role_not_declared"
      | "agent.role_execution_exceeded"
      | "agent.directory_unauthorized">,
    message: string,
  ) {
    super(message);
    this.name = "AgentHostError";
  }
}

/** Capabilities a role needs before it may run. Omitted execution means read-only. */
const EXECUTION_CAPABILITIES: Readonly<Record<AgentRoleExecution, AgentRuntimeCapability[]>> = {
  "read-only": [],
  "text-edit": ["text-edit"],
  "workspace-write": ["text-edit", "command"],
};

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
function composeRolePrompts(
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
      return available.filter((prompt) => declared.has(prompt.prompt_id) && prompt.prompt_id !== authority.manifest.compaction?.prompt_id);
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
function roleExecution(role: AgentRoleDeclaration): AgentRoleExecution {
  return role.execution ?? "read-only";
}

export interface AgentStartAuthority {
  /** Host-bound source resolver; browser/plugin-supplied bodies are never authority. */
  resolveCharacter?(reference: ArtifactReference, actorId: string): AgentFrozenCharacter;
  /** The Plugin's own Agent block. A role outside it can never start. */
  manifest: AgentManifest;
  /** Directories the Host authorized for this Plugin, already realpath-verified. */
  authorizedDirectories: readonly string[];
  /**
   * Prompt bodies shipped in the Plugin package. The Host composes the role's
   * prompts from these; an adapter never invents one.
   */
  prompts?: readonly AgentPromptText[];
  skills?: readonly AgentSkillDefinition[];
  method_owner?: AgentSkillOwner;
  /**
   * The project's own instructions, from a source the Host owns — today the
   * confirmed project guidance. Absent means this project has stated none,
   * which is different from stating an empty one and is shown differently.
   */
  project_prompts?: readonly AgentPromptText[];
}

/**
 * Agent Runtime registry and start authority.
 *
 * The Host decides what may run before any Runtime is asked: the role must be
 * declared, the Runtime must really support what that role needs, and the
 * directory must be one the Host authorized. An adapter reports facts and
 * executes approved work; it never widens its own authority.
 */
export class AgentHost implements AgentHostApi {
  readonly #adapters = new Map<string, AgentRuntimeAdapter>();
  readonly reviews: AgentReviewQueue;

  constructor(options: { reviews?: AgentReviewQueue } = {}) {
    this.reviews = options.reviews ?? new AgentReviewQueue();
  }

  register(adapter: AgentRuntimeAdapter): void {
    const runtimeId = adapter.descriptor.runtime_id;
    if (this.#adapters.has(runtimeId)) {
      throw new AgentHostError("agent.runtime_duplicate", `Agent Runtime ${runtimeId} 已注册`);
    }
    this.#adapters.set(runtimeId, adapter);
  }

  descriptors(): AgentRuntimeDescriptor[] {
    return [...this.#adapters.values()]
      .map((adapter) => structuredClone(adapter.descriptor))
      .sort((left, right) => left.runtime_id.localeCompare(right.runtime_id));
  }

  adapter(runtimeId: string): AgentRuntimeAdapter {
    const adapter = this.#adapters.get(runtimeId);
    if (!adapter) {
      throw new AgentHostError("agent.runtime_unknown", `没有注册 Agent Runtime ${runtimeId}`);
    }
    return adapter;
  }

  matrix(runtimeIds: string[]): Array<{
    runtime_id: string;
    capabilities: AgentRuntimeCapabilityMatrix;
  }> {
    return runtimeIds.map((runtimeId) => ({
      runtime_id: runtimeId,
      capabilities: structuredClone(this.adapter(runtimeId).descriptor.capabilities),
    }));
  }

  /**
   * Roles this Runtime can actually carry, with a reason for each one it cannot.
   * The product shows an unavailable role as unavailable instead of hiding it.
   */
  availableRoles(runtimeId: string, manifest: AgentManifest): Array<{
    role_id: string;
    available: boolean;
    reason?: string;
  }> {
    const capabilities = this.adapter(runtimeId).descriptor.capabilities;
    return manifest.roles.map((role) => {
      if (role.subagent_workspaces && (!this.adapter(runtimeId).subagents?.workspaces || !manifest.subagents?.parent_role_ids.includes(role.role_id)) || manifest.subagents?.parent_role_ids.includes(role.role_id) && capabilities.subagents === "unsupported") return { role_id: role.role_id, available: false, reason: "当前运行时尚未接通这个协作方式" };
      const missing = EXECUTION_CAPABILITIES[roleExecution(role)]
        .filter((capability) => capabilities[capability] === "unsupported");
      return missing.length === 0
        ? { role_id: role.role_id, available: true }
        : {
          role_id: role.role_id,
          available: false,
          reason: `${runtimeId} 不支持 ${missing.join("、")}`,
        };
    });
  }

  /**
   * Check the Host's own preconditions, then hand the request to the Runtime.
   * Nothing reaches an adapter until the role, capability and directory all pass.
   */
  async skillCatalog(runtimeId: string, authority: AgentStartAuthority): Promise<AgentSkillCatalogEntry[]> {
    const supported = this.adapter(runtimeId).descriptor.capabilities.skills !== "unsupported";
    const builtins = (authority.manifest.skills ?? []).map(declared => ({ ...declared, tools: [...declared.tools],
      source: "builtin" as const, enabled: supported && Boolean(authority.skills?.some(skill => skill.skill_id === declared.skill_id && skill.version === declared.version && skill.body.trim())) }));
    const library = this.adapter(runtimeId).skillLibrary;
    return [...builtins, ...(library && authority.method_owner ? await library.list(authority.method_owner) : [])];
  }

  async readSkill(runtimeId: string, authority: AgentStartAuthority, ref: AgentSkillRef): Promise<AgentSkillDefinition> {
    const entry = (await this.skillCatalog(runtimeId, authority)).find(item => item.skill_id === ref.skill_id && item.version === ref.version);
    const definition = authority.skills?.find(item => item.skill_id === ref.skill_id && item.version === ref.version);
    if (entry?.source === "installed" && authority.method_owner) return this.adapter(runtimeId).skillLibrary!.read(authority.method_owner, ref);
    if (!entry?.enabled || !definition) throw new AgentHostError("agent.capability_unavailable", "这个方法版本不可用，请重新选择");
    if (definition.body.length > 20_000 || JSON.stringify(definition.tools) !== JSON.stringify(entry.tools)) {
      throw new AgentHostError("agent.capability_unavailable", "方法正文或工具声明与发布版本不一致");
    }
    return { skill_id: entry.skill_id, version: entry.version, name: entry.name, summary: entry.summary, tools: [...entry.tools], body: definition.body };
  }

  async discoverSkills(runtimeId: string, authority: AgentStartAuthority, directory: AgentWorkingDirectory, path: string) {
    if (!directory.realpath_verified || !authority.authorizedDirectories.includes(directory.canonical_path)) {
      throw new AgentHostError("agent.directory_unauthorized", "这个方法目录不属于当前项目的授权工作区");
    }
    const library = this.adapter(runtimeId).skillLibrary;
    if (!library || !authority.method_owner) throw new AgentHostError("agent.capability_unavailable", "此运行时尚未接通方法安装");
    return library.discover(authority.method_owner, directory, path);
  }

  async installSkill(runtimeId: string, authority: AgentStartAuthority, candidateId: string) {
    const library = this.adapter(runtimeId).skillLibrary;
    if (!library || !authority.method_owner) throw new AgentHostError("agent.capability_unavailable", "此运行时尚未接通方法安装");
    return library.install(authority.method_owner, candidateId);
  }

  mcpLibrary(runtimeId: string, authority: AgentStartAuthority) {
    const library = this.adapter(runtimeId).mcpLibrary;
    if (!authority.manifest.mcp || !authority.method_owner || !library) throw new AgentHostError("agent.capability_unavailable", "当前插件或运行时尚未接通 MCP");
    return { library, owner: authority.method_owner };
  }

  async start(
    runtimeId: string,
    request: AgentStartRequest,
    authority: AgentStartAuthority,
  ): Promise<AgentRunHandle> {
    request = { ...request, execution_plan: freezeExecutionPlan(request) };
    const adapter = this.adapter(runtimeId);
    const role = authority.manifest.roles.find((item) => item.role_id === request.role_id);
    if (!role) {
      throw new AgentHostError(
        "agent.role_not_declared",
        `插件没有声明角色 ${request.role_id}`,
      );
    }
    const execution = roleExecution(role);
    const missing = EXECUTION_CAPABILITIES[execution]
      .filter((capability) => adapter.descriptor.capabilities[capability] === "unsupported");
    if (missing.length > 0) {
      throw new AgentHostError(
        "agent.capability_unavailable",
        `${runtimeId} 不支持 ${missing.join("、")}，角色 ${role.role_id} 不能在它上面运行`,
      );
    }
    if (!request.directory.realpath_verified
      || !authority.authorizedDirectories.includes(request.directory.canonical_path)) {
      throw new AgentHostError(
        "agent.directory_unauthorized",
        "这个目录没有被授权给当前插件",
      );
    }

    let character: AgentFrozenCharacter | undefined;
    let hostTools = [...(role.host_tools ?? [])];
    if (request.character !== undefined && request.character !== null) {
      const declared = authority.manifest.characters;
      if (!declared || declared.selection !== "optional-exact-artifact" || declared.scope !== "project-owner"
        || !declared.role_ids.includes(role.role_id) || !authority.resolveCharacter) {
        throw new AgentHostError("agent.capability_unavailable", "当前调用方或执行方式未开放 Character 选择");
      }
      const ref = request.character;
      if (typeof ref.artifact_id !== "string" || !ref.artifact_id.trim() || ref.artifact_id.length > 200
        || !Number.isSafeInteger(ref.version) || ref.version < 1) throw new AgentHostError("agent.capability_unavailable", "Character 精确版本引用无效");
      character = structuredClone(authority.resolveCharacter({ artifact_id: ref.artifact_id, version: ref.version }, request.actor_id));
      if (character.reference.artifact_id !== ref.artifact_id || character.reference.version !== ref.version
        || character.board_id !== request.board_id || character.source.owner_actor_id !== request.actor_id) {
        throw new AgentHostError("agent.capability_unavailable", "Character 来源与本轮项目、所有者或版本不一致");
      }
      if (character.host_tools !== null) {
        if (character.host_tools.some(tool => !hostTools.includes(tool))) throw new AgentHostError("agent.role_execution_exceeded", "所选 Character 包含当前执行方式未开放的内置工具，请更换角色或执行方式");
        hostTools = [...character.host_tools];
      }
    }

    if (character && request.character_skill_ids !== undefined) {
      const ids = request.character_skill_ids;
      if (!Array.isArray(ids) || ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !character!.import_snapshot?.skills.some(skill => skill.id === id))) throw new Error("本轮选择的 Skill 不在 Character 固定版本中");
      // Preserve the exact source reference; carry only this Run's selected resources into runtime history.
      if (character.import_snapshot) character.import_snapshot.skills = character.import_snapshot.skills.filter(skill => ids.includes(skill.id));
    }
    if (request.execution_plan && STEP_TOOLS.some(tool => !hostTools.includes(tool))) {
      throw new AgentHostError("agent.role_execution_exceeded", "当前角色未开放计划回报工具，请调整角色或取消角色选择后执行计划");
    }
    if (!request.execution_plan) hostTools = hostTools.filter(tool => !STEP_TOOLS.includes(tool));

    // Freeze the role here, from the Plugin's own declarations, so the adapter
    // receives exactly what it is allowed to run instead of resolving it itself.
    const selected = request.skills ?? [];
    if (!Array.isArray(selected) || selected.length > 20 || new Set(selected.map(ref => ref.skill_id)).size !== selected.length) {
      throw new AgentHostError("agent.capability_unavailable", "方法选择重复或超过数量限制");
    }
    const skills = await Promise.all(selected.map(ref => this.readSkill(runtimeId, authority, ref)));
    for (const skill of skills) if (skill.tools.some(tool => !hostTools.includes(tool))) {
      throw new AgentHostError("agent.role_execution_exceeded", `方法“${skill.name}”需要当前执行方式未开放的工具，请更换方式或取消选择`);
    }
    let mcp = request.mcp_tools ?? [];
    if (!Array.isArray(mcp) || mcp.length > 100 || new Set(mcp.map(ref => JSON.stringify([ref.server, ref.tool]))).size !== mcp.length) throw new AgentHostError("agent.capability_unavailable", "MCP 选择重复或超过数量限制");
    if (mcp.length) {
      if (execution !== "workspace-write") throw new AgentHostError("agent.role_execution_exceeded", "MCP 可能产生外部操作，请选择执行方式后使用；调用仍需逐笔审查");
      const { library, owner } = this.mcpLibrary(runtimeId, authority);
      mcp = await library.validate(owner, mcp);
    }
    let sources = request.mcp_sources ?? [];
    if (!Array.isArray(sources) || sources.length > 100 || new Set(sources.map(ref=>ref.server)).size !== sources.length) throw new AgentHostError("agent.capability_unavailable", "MCP 资料来源重复或超过数量限制");
    if(sources.length) {
      if (character && !hostTools.includes("read-mcp-resource")) throw new AgentHostError("agent.role_execution_exceeded", "所选 Character 未开放读取 MCP 资料的工具，请调整角色或取消资料选择");
      const {library,owner}=this.mcpLibrary(runtimeId,authority);
      sources=await library.validateSources(owner,sources);
    }
    let compaction: { prompt: AgentPromptText; above_tokens: number } | undefined;
    const declaredCompaction = authority.manifest.compaction;
    if (declaredCompaction && adapter.descriptor.capabilities.compaction !== "unsupported") {
      const declaration = authority.manifest.prompts?.find(item => item.prompt_id === declaredCompaction.prompt_id);
      const prompt = authority.prompts?.find(item => item.prompt_id === declaration?.prompt_id && item.version === declaration.version);
      if (!prompt?.body.trim() || !Number.isSafeInteger(declaredCompaction.above_tokens) || declaredCompaction.above_tokens < 1) {
        throw new AgentHostError("agent.capability_unavailable", "上下文整理声明缺少对应版本的正文或有效阈值");
      }
      compaction = { prompt: { ...prompt }, above_tokens: declaredCompaction.above_tokens };
    }
    let subagents: import("@molis-ai/molis-work-contracts/services/agent-host").AgentFrozenSubagentRole[] | undefined;
    let childWorkspaces: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSubagentWorkspace[] | undefined;
    if (role.subagent_workspaces === "required") {
      if (execution !== "read-only" || !authority.manifest.subagents?.parent_role_ids.includes(role.role_id)) throw new AgentHostError("agent.role_execution_exceeded", "独立子目录必须由已声明的只读协调者分派");
      if (!adapter.subagents?.workspaces || !request.subagent_workspaces?.length) throw new AgentHostError("agent.capability_unavailable", "请先为每个写入子任务选择独立的已授权目录");
      const ids = new Set<string>(), paths = new Set<string>();
      childWorkspaces = request.subagent_workspaces.map(grant => {
        const path = grant.directory?.canonical_path;
        if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,63}$/.test(grant.workspace_id) || ids.has(grant.workspace_id)
          || !grant.directory?.realpath_verified || !authority.authorizedDirectories.includes(path)
          || path === request.directory.canonical_path || paths.has(path)) throw new AgentHostError("agent.directory_unauthorized", "子任务目录未授权、重复或指向主工作区");
        ids.add(grant.workspace_id); paths.add(path); return structuredClone(grant);
      });
    } else if (request.subagent_workspaces?.length) throw new AgentHostError("agent.directory_unauthorized", "当前角色没有声明独立子目录");
    const declaration = authority.manifest.subagents;
    if (declaration?.parent_role_ids.includes(role.role_id)) {
      if (!adapter.subagents || adapter.descriptor.capabilities.subagents === "unsupported") throw new AgentHostError("agent.capability_unavailable", "当前运行时尚未接通子任务");
      subagents = declaration.roles.filter(child => !child.parent_role_ids || child.parent_role_ids.includes(role.role_id)).map(child => {
        const tools = child.host_tools ?? [];
        const childExecution = child.execution ?? "read-only";
        const allowed = ["read-file", "list", "search", "context-remaining", ...(childWorkspaces && childExecution !== "read-only" ? ["write", "edit-file"] : []), ...(childWorkspaces && childExecution === "workspace-write" ? ["run-command"] : [])];
        if (!childWorkspaces && childExecution !== "read-only" || tools.some(tool => !allowed.includes(tool) || !childWorkspaces && !hostTools.includes(tool))) throw new AgentHostError("agent.role_execution_exceeded", "只读子角色请求了当前父任务未开放的工具");
        if (EXECUTION_CAPABILITIES[childExecution].some(capability => adapter.descriptor.capabilities[capability] === "unsupported")) throw new AgentHostError("agent.capability_unavailable", "运行时不能执行声明的子角色操作");
        const prompt = authority.prompts?.find(prompt => prompt.prompt_id === child.role_id && prompt.version === child.version);
        if (!prompt) throw new AgentHostError("agent.role_not_declared", "子角色缺少声明版本的正文");
        return { role_id: child.role_id, version: child.version, name: child.name, execution: childExecution, host_tools: [...tools],
          prompts: composeRolePrompts({ ...child, prompts: [...(role.prompts ?? []).filter(id => authority.prompts?.some(p => p.prompt_id === id && p.layer === "base")), child.role_id] }, authority) };
      });
      if (!subagents.length) throw new AgentHostError("agent.role_not_declared", "没有可分派的子角色");
    } else if (hostTools.some(tool => ["dispatch-subagent", "await-subagents", "steer-subagent"].includes(tool))) throw new AgentHostError("agent.role_not_declared", "没有声明子角色的执行方式不能分派子任务");
    const characterSkillIds = request.character_skill_ids === undefined ? undefined : [...request.character_skill_ids];
    if (characterSkillIds && !character?.import_snapshot && characterSkillIds.length) throw new Error("请先选择包含导入 Skills 的 Character");
    const prompts = composeRolePrompts(role, authority, character, character ? importedCharacterInstructions(character, request.directory.canonical_path, characterSkillIds) : undefined);
    const handle = await adapter.start({
      ...request,
      mcp_tools: mcp,
      mcp_sources: sources,
      role: {
        role_id: role.role_id,
        version: role.version,
        execution,
        ...(subagents ? { subagents } : {}),
        ...(childWorkspaces ? { subagent_workspaces: childWorkspaces } : {}),
        ...(character ? { character } : {}),
        ...(characterSkillIds === undefined ? {} : { character_skill_ids: characterSkillIds }),
        prompts: prompts.map((prompt) => ({ ...prompt })),
        skills,
        ...(compaction ? { compaction } : {}),
        host_tools: hostTools,
      },
    });
    // The Runtime cannot widen what the Manifest froze. A mismatch is the
    // adapter's fault, and the run does not continue on a wider authority.
    if (JSON.stringify(handle.frozen.character) !== JSON.stringify(character)
      || JSON.stringify(handle.frozen.character_skill_ids) !== JSON.stringify(characterSkillIds)
      || JSON.stringify(handle.frozen.subagent_workspaces) !== JSON.stringify(childWorkspaces)
      || character && JSON.stringify(handle.frozen.host_tools) !== JSON.stringify(hostTools)
      || JSON.stringify(handle.frozen.mcp_sources ?? []) !== JSON.stringify(sources)
      || JSON.stringify(handle.frozen.mcp_tools) !== JSON.stringify(mcp)
      || JSON.stringify(handle.frozen.compaction) !== JSON.stringify(compaction && { prompt_id: compaction.prompt.prompt_id, version: compaction.prompt.version, above_tokens: compaction.above_tokens })
      || handle.frozen.role_id !== role.role_id
      || handle.frozen.role_version !== role.version
      || handle.frozen.execution !== execution
      || JSON.stringify(handle.frozen.skills.map(skill => [skill.skill_id, skill.version])) !== JSON.stringify(skills.map(skill => [skill.skill_id, skill.version]))) {
      await adapter.control(handle.ref, { kind: "cancel" });
      throw new AgentHostError(
        "agent.role_execution_exceeded",
        `Runtime 返回的角色权限与 Manifest 冻结的不一致，已取消该 Run`,
      );
    }
    return handle;
  }
}
