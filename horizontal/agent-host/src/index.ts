import { agentBodyIn } from "@molis-ai/molis-work-contracts/platform/model-prompts";
export {readSavedAgentHistory,savedAgentHistoryView,type PrologueSavedHistoryPort,type SavedHistoryOwner} from './adapters/prologue-saved-history.js';
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
import type { UiLanguageTag } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ActionSkillRound } from "@molis-ai/molis-work-contracts/platform/actions";
import { freezeRoundSkills, type AgentRoundSkillCatalog, type AgentSkillSource } from "./round-skills.js";
import type {
  AgentActionClient,
  AgentHostApi,
  AgentSessionRef,
  AgentRunHandle,
  AgentRuntimeAdapter,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
  AgentStartRequest,
  AgentSkillOwner,
  AgentFrozenCharacter,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";

import { AgentReviewQueue } from "./reviews.js";
import { freezeExecutionPlan, STEP_TOOLS } from "./execution-plan.js";
import {
  assertBusinessRole, assertInferenceRole, assertKnownRoleTools, assertMaySuggest, checkStartRole, checkStartSession, composeRolePrompts, EXECUTION_CAPABILITIES,
  frozenActions, frozenGateway, frozenMcp, frozenSidePrompts, frozenSubagents, placeOf, roleExecution, runDirectoriesOf, selectStartCharacter, startGuards, widensFrozen, worktreesFor,
  type AgentHostWorktree,
} from "./run-start.js";

export { AgentReviewQueue } from "./reviews.js";
export { reviewPresentation, reviewText, type ReviewWord, type ReviewWords } from "./review-presentation.js";
export type { AgentRoundSkillCatalog, AgentSkillSource } from "./round-skills.js";
export type { AgentHostWorktree } from "./run-start.js";
export { emptyCapabilityMatrix } from "./capabilities.js";
export { AGENT_RUNTIME, AGENT_TOOLS, isAgentTool, RUNTIME_TOOLS_NOT_OFFERED, type AgentToolEntry } from "./tool-catalog.js";
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
export { fetchModelList, listProviderModels, modelListErrors, modelListRequest, readModelList, type ListedModel, type ModelListSend } from "./model-list.js";
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
export { openPrologueMemoryRestore } from "./adapters/prologue-memory-restore.js";
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
export { createCodeIntelligence, ensureTool, languageServersFrom, languageServerSettings, type CodeIntelligence, type LanguageServerSettings, type LanguageServerSpec, type ToolInstallSpec } from "./code-intelligence/index.js";
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

function assertSessionCreation(adapter: AgentRuntimeAdapter, input: import("@molis-ai/molis-work-contracts/services/agent-host").AgentCreateSessionRequest, authority: AgentStartAuthority,
  worktrees: readonly AgentHostWorktree[]): void {
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
  } else placeOf(input.directory, authority, worktrees, "这个目录没有被授权给当前项目");
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
  beforeDispatch?(): void | (() => void) | Promise<void | (() => void)>;
  /** Host-only lifetime transferred to the actual accepted Run. */
  disposeDispatch?(): void;
  /** Current runtime grants, resolved by Host; selecting a tool grants nothing. */
  /** The trusted guard must run again at dispatch, including after the Host queue. */
  /**
   * The round's actions. `skillRound` is the round's frozen consumer and named list, written on the Host's own calls to `system.skills`
   * for this round (`ActionCallContext.skill_round`, specs/capability-pack/contract-design.md §2.3) — `frozenActions`/`frozenGateway`
   * hand it on, and the Host must not write it on any other action's call. `memory` is the round's memory recipe: its scene and class
   * restrictions travel with the round's tool calls so a memory action inside the round is held to the same scene.
   */
  actions?(runtimeId: string, validate?: () => void | Promise<void>, session?: AgentSessionRef, skillRound?: ActionSkillRound,
    memory?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory | null): Promise<AgentActionClient>;
  /** Host-bound source resolver; browser/plugin-supplied bodies are never authority. */
  resolveCharacter?(reference: ArtifactReference, actorId: string): AgentFrozenCharacter;
  /** The Plugin's own Agent block. A role outside it can never start. */
  manifest: AgentManifest;
  /**
   * The directories a round or session of this Plugin may work in without asking the Host again, already realpath-verified: the project's
   * output (specs/shared-sources-and-surfaces §3, SSC-15). An input folder is never among them; the Host's worktrees are read by `worktrees`.
   */
  authorizedDirectories: readonly string[];
  /** The project's folders as the Host read them for this call: what a round freezes as `RunDirectories`, and which folders are only inputs. */
  directories?: {
    revision: string;
    output: { workspace_id: string; canonical_path: string };
    inputs: readonly { workspace_id: string; canonical_path: string }[];
  };
  /** The Host's own worktrees of the output, verified now: the only other places a round (a writing child among them) may work in. */
  worktrees?(): Promise<readonly AgentHostWorktree[]>;
  /**
   * Makes the output on disk if it is a default output directory not made yet (specs/shared-sources-and-surfaces §3 「碰磁盘的调用方」).
   * Called once a session, a round or a stdio MCP server is to start in the output, after its directory was checked; listing or reading
   * makes nothing. Absent, the output is taken to be there.
   */
  prepareOutput?(): Promise<void>;
  /**
   * Prompt bodies shipped in the Plugin package. The Host composes the role's
   * prompts from these; an adapter never invents one.
   */
  prompts?: readonly AgentPromptText[];
  /** The Plugin's own `agent.skills` bodies, registered with its installation; a round reads them without any I/O. */
  skills?: readonly AgentSkillDefinition[];
  /** The Plugin's own installation as a `SkillRef` names it: a reference with these parts and a declared `agent.skills` entry is its own. */
  skill_source?: AgentSkillSource;
  /** The shared Skill catalog for this round, bound by the Host (`system.skills`); absent, only the Plugin's own Skills can be frozen. */
  skillCatalog?: AgentRoundSkillCatalog;
  /** Whose MCP servers a round of this Plugin may use: this project's, this Plugin's. */
  mcp_owner?: AgentSkillOwner;
  /**
   * The project's own instructions, from a source the Host owns — today the
   * confirmed project guidance. Absent means this project has stated none,
   * which is different from stating an empty one and is shown differently.
   */
  project_prompts?: readonly AgentPromptText[];
  /**
   * The language this round replies in, and the words the Host chose to say so. Only the Host gives it, like `call_id`: no start request
   * carries a language, so a Plugin cannot set it. The words are composed with the role's prompts, and the language is written into the
   * round's frozen record (`frozen.reply_locale`), so the record names both.
   */
  reply_language?: { locale: UiLanguageTag; prompt: AgentPromptText };
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
  effective(ownerId: string, prompt: AgentPromptText, locale?: string): AgentPromptText;
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
      try { assertKnownRoleTools(role, manifest); } catch (error) { return { role_id: role.role_id, available: false, reason: (error as Error).message }; }
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
    const worktrees = input.workspace === "none" || input.workspace === "business" ? [] : await worktreesFor(authority, input.directory);
    assertSessionCreation(adapter, input, authority, worktrees);
    await authority.beforeStart?.();
    // Every check passed: a default output directory not made yet is made now, before the Runtime is asked to open a session in it.
    if (input.directory && authority.authorizedDirectories.includes(input.directory.canonical_path)) await authority.prepareOutput?.();
    requireSynchronous(authority.assertBeforeStart?.(), "最终授权检查必须同步完成");
    return adapter.createSession(input, { beforeStart: authority.beforeStart, assertBeforeStart: authority.assertBeforeStart });
  }

  mcpLibrary(runtimeId: string, authority: AgentStartAuthority) {
    const library = this.adapter(runtimeId).mcpLibrary;
    if (!authority.manifest.mcp || !authority.mcp_owner || !library) throw agentErrors.capability_unavailable("当前插件或运行时尚未接通 MCP");
    return { library, owner: authority.mcp_owner };
  }

  /**
   * Check the Host's own preconditions, then hand the request to the Runtime.
   * Nothing reaches an adapter until the role, capability and directory all pass.
   */
  async start(
    runtimeId: string,
    request: AgentStartRequest,
    authority: AgentStartAuthority,
  ): Promise<AgentRunHandle> {
    const originalDispose = authority.disposeDispatch;
    let disposed = false;
    // The authority object stays the caller's own (its checks read live state, such as a Character switched off mid-start);
    // only this once-only release is wrapped, and it is handed to the Runtime on its own.
    const disposeDispatch = () => { if (!disposed) { disposed = true; originalDispose?.(); } };
    try {
    request = { ...request, original_input: trustedOriginalInput(request, authority.original_input), continued_from: request.continued_from && structuredClone(request.continued_from), budget: parseAgentRunBudget(request.budget), execution_plan: freezeExecutionPlan(request) };
    // What runs is the registered prompt as the person left it: their version when they edited it, otherwise the
    // default. Same id and version either way — the frozen record says which, and no text widens what the role may do.
    const locale = authority.reply_language?.locale, resolve = this.#prompts;
    const promptAuthority = { manifest: authority.manifest, project_prompts: authority.project_prompts,
      reply_language: authority.reply_language, prompts: authority.prompts?.map(({ body_by_locale, ...prompt }) => {
        const declaration = { ...prompt, ...(body_by_locale ? { body_by_locale } : {}) };
        return resolve ? resolve.effective(request.plugin_id, declaration, locale) : { ...prompt, body: agentBodyIn(declaration, locale) };
      }) };
    const adapter = this.adapter(runtimeId);
    const worktrees = request.workspace === "none" || request.workspace === "business" ? [] : await worktreesFor(authority, request.directory, request.subagent_workspaces?.length);
    const { role, execution, workspace, place } = checkStartRole(adapter, runtimeId, request, authority, worktrees);
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
    // The round's Skills, in one catalog read (§3.4); who reads them is the round's consumer, set by its role's workspace (§2.3).
    const skills = await freezeRoundSkills({ selected: request.skills ?? [], manifest: authority.manifest, own: authority.skills ?? [],
      locale: authority.reply_language?.locale, source: authority.skill_source, catalog: authority.skillCatalog, consumer: workspace === "required" ? "coding" : "agent", hostTools,
      unsupported: adapter.descriptor.capabilities.skills === "unsupported" });
    const actionRefs = parseExactActionReferences(request.action_tools ?? []);
    if (request.action_gateway && actionRefs.length) throw agentErrors.capability_unavailable("能力网关与逐项能力不能同时使用");
    assertMaySuggest(hostTools, execution);
    const memory = authority.memory ? await authority.memory(request.task, character ? { character: { artifact_id: character.reference.artifact_id, title: character.title } } : {}).catch(() => null) : null;
    // What the round's own tool calls to `system.skills` read as: the frozen consumer and named list (§2.3). Only the Host's calls carry it,
    // and only where the composition asks for `system.skills`; a tool call into any other plugin's action never does (§2.6, S-skill-delegation).
    const skillRound: ActionSkillRound = { consumer: workspace === "required" ? "coding" : "agent", named: structuredClone(authority.skillCatalog?.named ?? []) };
    const source = { adapter, runtimeId, authority, session: session.session, validateCharacter, execution, skillRound, memory };
    const actions = await frozenActions(source, actionRefs, character);
    const gateway = request.action_gateway ? await frozenGateway(source, workspace) : undefined;
    const { mcp, sources } = await frozenMcp(request, execution, character, hostTools, () => this.mcpLibrary(runtimeId, authority));
    const { compaction, endingReview } = frozenSidePrompts(adapter, promptAuthority);
    const { subagents, childWorkspaces } = frozenSubagents(adapter, role, execution, request, promptAuthority, hostTools, worktrees);
    const directories = runDirectoriesOf(authority, place);
    const characterSkillIds = request.character_skill_ids === undefined ? undefined : [...request.character_skill_ids];
    if (characterSkillIds && !character?.import_snapshot && characterSkillIds.length) throw new Error("请先选择包含导入 Skills 的 Character");
    const prompts = composeRolePrompts(role, promptAuthority, character, character ? importedCharacterInstructions(character, request.directory?.canonical_path, characterSkillIds) : undefined);
    // The memories this run is given: the Host's recall for this consumer. A failed recall runs without memory, never stops the run.
    await beforeStart();
    // Everything was checked: a default output directory not made yet is made now, before the Runtime is asked to run in it.
    if (place?.kind === "output") await authority.prepareOutput?.();
    assertBeforeStart();
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
        ...(directories ? { directories } : {}),
        ...(character ? { character } : {}),
        ...(characterSkillIds === undefined ? {} : { character_skill_ids: characterSkillIds }),
        prompts: prompts.map((prompt) => ({ ...prompt })),
        ...(memory ? { memory: structuredClone(memory) } : {}),
        skills,
        ...(authority.reply_language ? { reply_locale: authority.reply_language.locale } : {}),
        ...(compaction ? { compaction } : {}), ...(endingReview ? { ending_review: { prompt: endingReview } } : {}),
        host_tools: hostTools,
      },
    }, { beforeStart, assertBeforeStart, beforeDispatch, disposeDispatch, ...(authority.call_id ? { call_id: authority.call_id } : {}) });
    if (widensFrozen(handle, { request, role, execution, workspace, actionRefs, gateway, character, characterSkillIds, childWorkspaces, hostTools, mcp, sources, compaction, skills, replyLocale: authority.reply_language?.locale })) {
      await adapter.control(handle.ref, { kind: "cancel" });
      throw agentErrors.role_execution_exceeded(`Runtime 返回的角色权限与 Manifest 冻结的不一致，已取消该 Run`);
    }
    return handle;
    } catch (error) { disposeDispatch(); throw error; }
  }
}

export { PrologueInferenceError, inferenceServiceUnavailableReason, isDispatchRefusal } from "./inference.js";
export { reportedTokenTotal, reportedPromptTotal, promptIncludesCache, decodePrologueJsonOutput } from "./inference.js";
export type { PrologueCredentialInput, PrologueTextInput, PrologueInputImage, PrologueTextResult, PrologueExecutionReceipt, PrologueRunRef, PrologueStructuredRequest, PrologueTextProgress, PrologueImageInput, PrologueImageOutputLimits, PrologueTypeSafeInput, PrologueInferenceClient } from "./inference.js";
export type { PrologueMemoryOptions } from "./adapters/prologue-memory-authority.js";
export { readPrologueSessionTerminations, retainPrologueSessionTerminations } from "./adapters/prologue-session-restore.js";
export type { SessionRestoreRef, SessionRestorePreview, SessionRestoreTermination } from "./adapters/prologue-session-restore.js";
