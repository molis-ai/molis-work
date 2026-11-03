import { trustedOriginalInput } from "./original-inputs.js";
import { agentErrors } from "./errors.js";
import { parseAgentRunBudget } from "@molis-ai/molis-work-contracts/services/agent-host";
import { parseExactActionReferences, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { importedCharacterInstructions } from "./character-import.js";
import type {
  AgentManifest,
  AgentPromptText,
  AgentSkillDefinition,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type {
  AgentActionClient,
  AgentHostApi,
  AgentSessionRef,
  AgentRunHandle,
  AgentRuntimeAdapter,
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
import {
  assertBusinessRole, assertInferenceRole, assertMaySuggest, checkStartRole, checkStartSession, composeRolePrompts, EXECUTION_CAPABILITIES,
  frozenActions, frozenGateway, frozenMcp, frozenSidePrompts, frozenSubagents, roleExecution, selectStartCharacter, startGuards, widensFrozen,
} from "./run-start.js";

export { AgentReviewQueue } from "./reviews.js";
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
export { registerAgentHostCapabilities } from "./capability-registration.js";
export { runViewVersion } from "./run-wait.js";
export { actionDigest } from "./action-digest.js";
export type {
  AgentCapabilityPorts,
  AgentCapabilityRegistrar,
} from "./capability-registration.js";
export { PrologueAgentAdapter, PROLOGUE_RUNTIME_ID } from "./adapters/prologue.js";
export { createPrologueNodeAdapter, SUBAGENT_DEFAULT_TURNS } from "./adapters/prologue-node.js";
export { verifyPrologueNodeStorageContents, type PrologueNodeStorageVerificationOptions } from "./adapters/prologue-storage-verification.js";
export { surfaceRules } from "./adapters/prologue-surfaces.js";
export { deliverDesktopAct } from "./adapters/desktop-act-delivery.js";
export { screenModelMaterial } from "./adapters/prologue-screening.js";
export { projectQuestion, answerProblems } from "./adapters/prologue-questions.js";
export { boundReferenceKinds, type ReferenceKindCandidate, type ReferenceKindProblem, type ReferenceKindsFor } from "./adapters/prologue-reference-kinds.js";
export { createPluginBuilderAgent } from "./adapters/plugin-builder.js";
export type { PluginBuilderAgentOptions, BuilderAgentRequest, BuilderAgentRecord, BuilderAgentActivity } from "./adapters/plugin-builder.js";
export { resolveModelHostname } from "./adapters/node-model-dns.js";
export { PrologueApprovalBridge } from "./adapters/prologue-approvals.js";
export {
  applyRunEvent,
  closeInterruptedPrologueStream,
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

function assertSessionCreation(adapter: AgentRuntimeAdapter, input: import("@molis-ai/molis-work-contracts/services/agent-host").AgentCreateSessionRequest, authority: AgentStartAuthority): void {
  if (input.workspace === "none") {
    const role = authority.manifest.roles.find(row => row.role_id === input.role_id);
    if (!role) throw agentErrors.role_not_declared("无工作区会话需要插件声明的推理角色");
    assertInferenceRole(role, authority.manifest);
    if (!adapter.descriptor.supports_workspace_none) throw agentErrors.capability_unavailable("当前运行时尚未接通无工作区推理");
    if (input.directory !== undefined || !input.actor_id?.trim()) throw agentErrors.directory_unauthorized("无工作区会话不能携带目录且必须有明确用户归属");
  } else if (input.workspace === "business") {
    const role = authority.manifest.roles.find(row => row.role_id === input.role_id);
    if (!role) throw agentErrors.role_not_declared("业务会话需要已声明的业务角色");
    assertBusinessRole(role, authority.manifest);
    if (!adapter.descriptor.supports_workspace_business) throw agentErrors.capability_unavailable("当前运行时尚未接通无目录的业务执行");
    if (input.directory !== undefined || !input.actor_id?.trim()) throw agentErrors.directory_unauthorized("业务会话不能携带目录且必须有明确用户归属");
  } else if (!input.directory?.realpath_verified || !authority.authorizedDirectories.includes(input.directory.canonical_path)) {
    throw agentErrors.directory_unauthorized("这个目录没有被授权给当前项目");
  }
}

export interface AgentStartAuthority {
  /** Original text from the protected Host entry/current Action, never a plugin's start DTO. */
  original_input?: Omit<import("@molis-ai/molis-work-contracts/platform/actions").HostOfferedOriginalInput, "action">;
  /**
   * The number of the operation that starts this round (`ActionCallOrigin`). Only the Host gives it; nothing in a request is read for it.
   * The adapter writes it into the round's frozen record as `frozen.call_id` (not a tool call's id); it is not sent to Prologue.
   */
  call_id?: string;
  /** Original invocation guard, after all asynchronous preparation and before starting the Runtime. */
  beforeStart?(): void | Promise<void>;
  /** Final check in the same synchronous segment as accepting a session or Run. */
  assertBeforeStart?(): void;
  /** Recheck installation/material authority at real dispatch, without retaining a completed invocation. */
  beforeDispatch?(): void | Promise<void>;
  /** Current runtime grants, resolved by Host; selecting a tool grants nothing. */
  /** The trusted guard must run again at dispatch, including after the Host queue. */
  actions?(runtimeId: string, validate?: () => void | Promise<void>, session?: AgentSessionRef): Promise<AgentActionClient>;
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
  skill_owner?: AgentSkillOwner;
  /**
   * The project's own instructions, from a source the Host owns — today the
   * confirmed project guidance. Absent means this project has stated none,
   * which is different from stating an empty one and is shown differently.
   */
  project_prompts?: readonly AgentPromptText[];
  /**
   * The platform memory for this run, recalled by the Host for this consumer (the switches and scopes are the Host's).
   * Absent or null: the run is given no memory.
   */
  memory?(task: string, context?: { character?: { artifact_id: string; title: string } }): Promise<import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory | null>;
}

/**
 * Agent Runtime registry and start authority.
 *
 * The Host decides what may run before any Runtime is asked: the role must be
 * declared, the Runtime must really support what that role needs, and the
 * directory must be one the Host authorized. An adapter reports facts and
 * executes approved work; it never widens its own authority.
 */
/** Looks up the text a registered prompt runs with now. Returns the prompt unchanged when the person has not edited it. */
export interface AgentPromptResolver {
  effective(ownerId: string, prompt: AgentPromptText): AgentPromptText;
}

export class AgentHost implements AgentHostApi {
  readonly #adapters = new Map<string, AgentRuntimeAdapter>();
  readonly reviews: AgentReviewQueue;

  /** The person's edits of registered prompts, looked up when a run starts. Absent means every prompt runs as shipped. */
  readonly #prompts: AgentPromptResolver | undefined;

  constructor(options: { reviews?: AgentReviewQueue; prompts?: AgentPromptResolver } = {}) {
    this.reviews = options.reviews ?? new AgentReviewQueue();
    this.#prompts = options.prompts;
  }

  register(adapter: AgentRuntimeAdapter): void {
    const runtimeId = adapter.descriptor.runtime_id;
    if (this.#adapters.has(runtimeId)) {
      throw agentErrors.runtime_duplicate(`Agent Runtime ${runtimeId} 已注册`);
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
      throw agentErrors.runtime_unknown(`没有注册 Agent Runtime ${runtimeId}`);
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
      if (role.workspace === "none") {
        try { assertInferenceRole(role, manifest); } catch (error) { return { role_id: role.role_id, available: false, reason: (error as Error).message }; }
        if (!this.adapter(runtimeId).descriptor.supports_workspace_none) return { role_id: role.role_id, available: false, reason: "当前运行时尚未接通无工作区推理" };
      }
      if (role.workspace === "business") {
        try { assertBusinessRole(role, manifest); } catch (error) { return { role_id: role.role_id, available: false, reason: (error as Error).message }; }
        if (!this.adapter(runtimeId).descriptor.supports_workspace_business) return { role_id: role.role_id, available: false, reason: "当前运行时尚未接通无目录的业务执行" };
      }
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

  async createSession(runtimeId: string, input: import("@molis-ai/molis-work-contracts/services/agent-host").AgentCreateSessionRequest, authority: AgentStartAuthority) {
    const adapter = this.adapter(runtimeId);
    assertSessionCreation(adapter, input, authority);
    await authority.beforeStart?.();
    requireSynchronous(authority.assertBeforeStart?.(), "最终授权检查必须同步完成");
    return adapter.createSession(input, { beforeStart: authority.beforeStart, assertBeforeStart: authority.assertBeforeStart });
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
    return [...builtins, ...(library && authority.skill_owner ? await library.list(authority.skill_owner) : [])];
  }

  async readSkill(runtimeId: string, authority: AgentStartAuthority, ref: AgentSkillRef): Promise<AgentSkillDefinition> {
    const entry = (await this.skillCatalog(runtimeId, authority)).find(item => item.skill_id === ref.skill_id && item.version === ref.version);
    const definition = authority.skills?.find(item => item.skill_id === ref.skill_id && item.version === ref.version);
    if (entry?.source === "installed" && authority.skill_owner) return this.adapter(runtimeId).skillLibrary!.read(authority.skill_owner, ref);
    if (!entry?.enabled || !definition) throw agentErrors.capability_unavailable("这个方法版本不可用，请重新选择");
    if (definition.body.length > 20_000 || JSON.stringify(definition.tools) !== JSON.stringify(entry.tools)) {
      throw agentErrors.capability_unavailable("方法正文或工具声明与发布版本不一致");
    }
    return { skill_id: entry.skill_id, version: entry.version, name: entry.name, summary: entry.summary, tools: [...entry.tools], body: definition.body };
  }

  async discoverSkills(runtimeId: string, authority: AgentStartAuthority, directory: AgentWorkingDirectory, path: string) {
    if (!directory.realpath_verified || !authority.authorizedDirectories.includes(directory.canonical_path)) {
      throw agentErrors.directory_unauthorized("这个方法目录不属于当前项目的授权工作区");
    }
    const library = this.adapter(runtimeId).skillLibrary;
    if (!library || !authority.skill_owner) throw agentErrors.capability_unavailable("此运行时尚未接通方法安装");
    return library.discover(authority.skill_owner, directory, path);
  }

  async installSkill(runtimeId: string, authority: AgentStartAuthority, candidateId: string) {
    const library = this.adapter(runtimeId).skillLibrary;
    if (!library || !authority.skill_owner) throw agentErrors.capability_unavailable("此运行时尚未接通方法安装");
    return library.install(authority.skill_owner, candidateId);
  }

  mcpLibrary(runtimeId: string, authority: AgentStartAuthority) {
    const library = this.adapter(runtimeId).mcpLibrary;
    if (!authority.manifest.mcp || !authority.skill_owner || !library) throw agentErrors.capability_unavailable("当前插件或运行时尚未接通 MCP");
    return { library, owner: authority.skill_owner };
  }

  async start(
    runtimeId: string,
    request: AgentStartRequest,
    authority: AgentStartAuthority,
  ): Promise<AgentRunHandle> {
    request = { ...request, original_input: trustedOriginalInput(request, authority.original_input), continued_from: request.continued_from && structuredClone(request.continued_from), budget: parseAgentRunBudget(request.budget), execution_plan: freezeExecutionPlan(request) };
    // What runs is the registered prompt as the person left it: their version when they edited it, otherwise the
    // default. Same id and version either way — the frozen record says which, and no text widens what the role may do.
    if (this.#prompts && authority.prompts?.length) {
      const resolve = this.#prompts;
      authority = { ...authority, prompts: authority.prompts.map(prompt => resolve.effective(request.plugin_id, prompt)) };
    }
    const adapter = this.adapter(runtimeId);
    const { role, execution, workspace } = checkStartRole(adapter, runtimeId, request, authority);
    const session = await adapter.readSession(request.session);
    checkStartSession(session, request, runtimeId, workspace);
    const { character, hostTools } = selectStartCharacter(role, request, authority);
    const { validateCharacter, assertBeforeStart, beforeStart, beforeDispatch } = startGuards(authority, character, request);
    if (request.execution_plan && STEP_TOOLS.some(tool => !hostTools.includes(tool))) {
      throw agentErrors.role_execution_exceeded("当前角色未开放计划回报工具，请调整角色或取消角色选择后执行计划");
    }
    // A round without a plan of its own keeps the board tools its role grants: it reads the project's board, and reads and
    // reports on steps handed to its session, even ones handed while it runs. The Host's board hook allows nothing else.

    // Freeze the role here, from the Plugin's own declarations, so the adapter
    // receives exactly what it is allowed to run instead of resolving it itself.
    const selected = request.skills ?? [];
    if (!Array.isArray(selected) || selected.length > 20 || new Set(selected.map(ref => ref.skill_id)).size !== selected.length) {
      throw agentErrors.capability_unavailable("方法选择重复或超过数量限制");
    }
    const skills = await Promise.all(selected.map(ref => this.readSkill(runtimeId, authority, ref)));
    for (const skill of skills) if (skill.tools.some(tool => !hostTools.includes(tool))) {
      throw agentErrors.role_execution_exceeded(`方法“${skill.name}”需要当前执行方式未开放的工具，请更换方式或取消选择`);
    }
    const actionRefs = parseExactActionReferences(request.action_tools ?? []);
    if (request.action_gateway && actionRefs.length) throw agentErrors.capability_unavailable("能力网关与逐项能力不能同时使用");
    assertMaySuggest(hostTools, execution);
    const source = { adapter, runtimeId, authority, session: session.session, validateCharacter, execution };
    const actions = await frozenActions(source, actionRefs, character);
    const gateway = request.action_gateway ? await frozenGateway(source, workspace) : undefined;
    const { mcp, sources } = await frozenMcp(request, execution, character, hostTools, () => this.mcpLibrary(runtimeId, authority));
    const { compaction, endingReview } = frozenSidePrompts(adapter, authority);
    const { subagents, childWorkspaces } = frozenSubagents(adapter, role, execution, request, authority, hostTools);
    const characterSkillIds = request.character_skill_ids === undefined ? undefined : [...request.character_skill_ids];
    if (characterSkillIds && !character?.import_snapshot && characterSkillIds.length) throw new Error("请先选择包含导入 Skills 的 Character");
    const prompts = composeRolePrompts(role, authority, character, character ? importedCharacterInstructions(character, request.directory?.canonical_path, characterSkillIds) : undefined);
    // The memories this run is given: the Host's recall for this consumer. A failed recall runs without memory, never stops the run.
    const memory = authority.memory ? await authority.memory(request.task, character ? { character: { artifact_id: character.reference.artifact_id, title: character.title } } : {}).catch(() => null) : null;
    await beforeStart(); assertBeforeStart();
    const handle = await adapter.start({
      ...request,
      ...(actionRefs.length || request.action_tools !== undefined || character?.action_tools ? { action_tools: actionRefs } : {}),
      mcp_tools: mcp,
      mcp_sources: sources,
      role: {
        ...(workspace === "none" ? { workspace: "none" as const } : workspace === "business" ? { workspace: "business" as const } : {}),
        role_id: role.role_id,
        version: role.version,
        execution,
        ...(actions ? { actions } : {}),
        ...(gateway ? { action_gateway: gateway } : {}),
        ...(subagents ? { subagents } : {}),
        ...(childWorkspaces ? { subagent_workspaces: childWorkspaces } : {}),
        ...(character ? { character } : {}),
        ...(characterSkillIds === undefined ? {} : { character_skill_ids: characterSkillIds }),
        prompts: prompts.map((prompt) => ({ ...prompt })),
        ...(memory ? { memory: structuredClone(memory) } : {}),
        skills,
        ...(compaction ? { compaction } : {}), ...(endingReview ? { ending_review: { prompt: endingReview } } : {}),
        host_tools: hostTools,
      },
    }, { beforeStart, assertBeforeStart, beforeDispatch, ...(authority.call_id ? { call_id: authority.call_id } : {}) });
    if (widensFrozen(handle, { request, role, execution, workspace, actionRefs, gateway, character, characterSkillIds, childWorkspaces, hostTools, mcp, sources, compaction, skills })) {
      await adapter.control(handle.ref, { kind: "cancel" });
      throw agentErrors.role_execution_exceeded(`Runtime 返回的角色权限与 Manifest 冻结的不一致，已取消该 Run`);
    }
    return handle;
  }
}

export { PrologueInferenceError, inferenceServiceUnavailableReason, isDispatchRefusal } from "./inference.js";
export { reportedTokenTotal, decodePrologueJsonOutput } from "./inference.js";
export type { PrologueCredentialInput, PrologueTextInput, PrologueInputImage, PrologueTextResult, PrologueExecutionReceipt, PrologueRunRef, PrologueStructuredRequest, PrologueTextProgress, PrologueImageInput, PrologueTypeSafeInput, PrologueInferenceClient } from "./inference.js";
export type { PrologueMemoryOptions } from "./adapters/prologue-memory-authority.js";
