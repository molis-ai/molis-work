/** The agent-host contract (`services/agent-host`): what a run is started with, frozen when it starts — workspace, materials, references, budget, the Character and its role, the action client — and the authority checks the Host adds. */
import type { ActionCallOrigin, ExactActionReference, ActionView } from "../platform/actions.js";
import type { ArtifactReference, ArtifactProducerIdentity } from "../modules/artifacts.js";
import type { CharacterContent } from "../modules/characters.js";
import type { AgentRoleExecution, AgentPromptLayer, AgentSkillDeclaration, AgentPromptText, AgentSkillDefinition } from "../platform/plugin-agent.js";
import type { AgentActionOffer } from "./agent-host-offers.js";
import type { AgentRecalledMemory } from "./agent-host-memory.js";
import type { AgentSessionRef } from "./agent-host-runtime.js";

/** Host-owned, in-memory: authority checks, and the call number the Host gave the round (never from a Plugin payload). */
export interface AgentStartExecution extends ActionCallOrigin {
  beforeStart?(): void | Promise<void>;
  /** Original invocation's synchronous fence; only the start/accept phase uses it, never background dispatch. */
  assertBeforeStart?(): void;
  /** Live owner authority, valid beyond the start invocation's lifetime. */
  beforeDispatch?(): void | Promise<void>;
}

/** An authorized directory. The Host resolves and verifies it; the Plugin never passes a raw path. */
export interface AgentWorkingDirectory {
  canonical_path: string;
  realpath_verified: boolean;
}

/** Absence retains the historical workspace requirement. No process cwd fallback is permitted. */
export type AgentWorkspace =
  | { workspace?: "required"; directory: AgentWorkingDirectory }
  | { workspace: "none"; directory?: never }
  /** Business work: no directory; the Host gives it unified actions (by effect) and root-free tools only. */
  | { workspace: "business"; directory?: never };

export interface AgentTextMaterial {
  material_id: string;
  title: string;
  /** Verbatim text the model may read. Frozen before the Run starts. */
  text: string;
  source_artifact_id: string;
  source_version: number;
}

/**
 * An image the person brought, already taken in by the runtime (its bytes stay with the runtime; this is only the
 * reference). The model sees it in the Run it is attached to, and only there.
 */
export interface AgentImageMaterial {
  material_id: string;
  title: string;
  resource: { id: string; revision: number };
  media_type: string;
}

/** Metadata and verbatim body share one data resource, never a role/system prompt. */
export function agentTextMaterialContent(material: AgentTextMaterial): string {
  if (!material || typeof material.title !== "string" || material.title.length > 2000
    || typeof material.material_id !== "string" || !material.material_id || material.material_id.length > 240
    || typeof material.source_artifact_id !== "string" || !material.source_artifact_id || material.source_artifact_id.length > 200
    || !Number.isSafeInteger(material.source_version) || material.source_version < 1 || typeof material.text !== "string") {
    throw new Error("固定材料的标题、来源或版本无效");
  }
  const header = JSON.stringify({ title: material.title, artifact_id: material.source_artifact_id, version: material.source_version });
  const content = `${header}\n\n${material.text}`;
  // Prologue's required text resources reject more than 20,000 UTF-16 units.
  if (content.length > 20_000) throw new Error("材料连同来源超过 20,000 字符，请在文件中选择较小片段后重新保存");
  return content;
}

export interface AgentSkillRef {
  skill_id: string;
  version: number;
}

export interface AgentMcpToolRef {
  server: string;
  tool: string;
  /** Required for execution; older unversioned selections must be reselected. */
  version?: string;
  server_label?: string;
  /** Pins the endpoint, credentials and launch configuration, independently of tool schema. */
  configuration_version?: number;
}

/** Explicit access to the documents of a configured MCP service, without its external tools. */
export type AgentMcpSourceRef = Pick<AgentMcpToolRef, "server" | "configuration_version" | "server_label">;

/** How much the model may think for a round: quick, balanced or deep (the provider's own low / medium / high). */
export type AgentReasoningEffort = "low" | "medium" | "high";

export const AGENT_REASONING_EFFORTS: readonly AgentReasoningEffort[] = ["low", "medium", "high"];

export interface AgentRunBudget {
  max_turns?: number;
  max_output_tokens?: number;
  max_total_tokens?: number;
  max_duration_ms?: number;
}

/** Runtime limits are explicit positive safe integers; omitted values keep SDK defaults. */
export function parseAgentRunBudget(value: AgentRunBudget | undefined): AgentRunBudget | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("执行预算格式无效");
  const budget: AgentRunBudget = {};
  for (const field of ["max_turns", "max_output_tokens", "max_total_tokens", "max_duration_ms"] as const) {
    const limit = value[field];
    if (limit === undefined) continue;
    if (!Number.isSafeInteger(limit) || limit < 1 || field === "max_duration_ms" && limit > 2_147_483_647) throw new Error(`执行预算 ${field} 必须为有效的正整数`);
    budget[field] = limit;
  }
  return budget;
}

/** Ordered steps supplied by the caller from its immutable confirmed Artifact. */
export interface AgentExecutionPlan {
  source: ArtifactReference;
  title: string;
  /** `depends_on` names earlier steps this one waits for; absent, a step waits for the one before it. */
  steps: Array<{ id: string; title: string; acceptance: string; depends_on?: string[] }>;
}

/**
 * Exactly what the Host froze for one Run. Later settings changes never alter a
 * started Run; the product shows this, not the next-run selection.
 */
export interface AgentFrozenCharacter extends CharacterContent {
  reference: ArtifactReference;
  project_id: string;
  content_digest: string;
  producer: ArtifactProducerIdentity;
  published_at: string;
}

interface AgentFrozenStartFields {
  /** Body-free reference to the original text, not the assembled model task. */
  original_input?: import("./agent-inputs.js").AgentOriginalInputRef;
  /** Canonical earlier Run of this Session supplying the original input. */
  continued_from?: import("./agent-host-runtime.js").AgentRunRef;
  action_tools?: ExactActionReference[];
  /** The run used the Host's action gateway (see AgentStartRequest.action_gateway). */
  action_gateway?: true;
  /** Exact imported Skill ids used by this Run; the full Character snapshot remains immutable. */
  character_skill_ids?: string[];
  execution_plan?: AgentExecutionPlan;
  /** The earlier round of this session whose unfinished step graph this Run continues, instead of a new graph. */
  continues_step_board_of?: string;
  /** Child directory grants frozen for this run; never a grant to write the parent. */
  subagent_workspaces?: AgentSubagentWorkspace[];
  /** Authoritative fixed Character content and source at start, never looked up for history. */
  character?: AgentFrozenCharacter;
  role_id: string;
  role_version: number;
  execution: AgentRoleExecution;
  model_id: string;
  /** Host-frozen context selection policy, absent when not wired for this runtime. */
  compaction?: { prompt_id: string; version: number; above_tokens: number };
  /** The ending review's prompt (D1②), the person's edit included; absent when the Agent declares none. */
  ending_review?: { prompt_id: string; version: number; user_revision?: number };
  /**
   * The window this Run was packed against (the model's own, capped by the runtime), and whether the provider's input
   * count already includes cached prompt tokens. Absent on runs started before it was recorded.
   */
  model_context?: { window_tokens: number; prompt_includes_cache: boolean };
  /** Present when this Run started from the Host's digest of earlier rounds instead of their verbatim history. */
  history?: "digest";
  /** Present when the model was asked to think before answering (the provider's setting when the Run started). */
  thinking?: "adaptive";
  /** The reasoning effort every model call of this Run was sent with; absent when none was chosen. */
  reasoning_effort?: AgentReasoningEffort;
  /**
   * Exactly the prompts this Run was frozen with, layer included.
   *
   * The layer travels so a surface can show *who* said each part — product,
   * Plugin role, or project. Without it the list is a flat set of ids that
   * nobody can attribute, which is the state this used to be in.
   */
  prompts: Array<{ prompt_id: string; version: number; layer: AgentPromptLayer;
    /** Present when the run used the person's edit of this prompt (its revision) instead of the default. */
    user_revision?: number }>;
  skills: AgentSkillDeclaration[];
  mcp_tools: AgentMcpToolRef[];
  mcp_sources?: AgentMcpSourceRef[];
  host_tools: string[];
  text_materials: Array<{ material_id: string; title?: string; source_artifact_id: string; source_version: number }>;
  /** Images the model was shown in this Run (references only). */
  image_materials?: Array<{ material_id: string; title: string; media_type: string }>;
  budget: AgentRunBudget | null;
}

export type AgentFrozenStart = AgentFrozenStartFields & AgentWorkspace & ActionCallOrigin;

interface AgentCreateSessionFields {
  project_id: string;
  plugin_id: string;
  install_id: string;
  actor_id: string;
  title: string;
}

export type AgentCreateSessionInput = AgentCreateSessionFields & (
  | { workspace?: "required"; directory: AgentWorkingDirectory; role_id?: string }
  | { workspace: "none"; directory?: never; role_id: string }
  | { workspace: "business"; directory?: never; role_id: string }
);

/**
 * The role as the Host froze it, taken from the Plugin's own declarations.
 *
 * An adapter receives this and never invents a prompt, a version or a wider
 * execution level: prompt bodies belong to the Plugin package, and the Host is
 * the only place allowed to decide what a Run is permitted to do.
 */
export interface AgentFrozenSubagentRole {
  role_id: string; version: number; name: string; execution: AgentRoleExecution;
  prompts: AgentPromptText[]; host_tools: string[];
}

export interface AgentSubagentWorkspace {
  workspace_id: string;
  directory: AgentWorkingDirectory;
}

/**
 * Sub-tasks a business round hands to separate works of the same person and scope (the Host's delegation, where the
 * runtime has no sub-agents of its own). Each delegated work is a real work with its own session: its changes still
 * wait for the person's confirmation, and it cannot delegate further.
 */
export interface AgentDelegatedWork {
  work_id: string;
  title: string;
  /** The work's state: running, waiting-input/-review (on the person), completed, failed, stopped… */
  state: string;
  /** Its latest reply, shortened. */
  reply?: string;
  /** Objects it produced or changed, as their owners name them. */
  results?: Array<{ kind: string; id: string; revision: string | null }>;
  /** Follow-ups sent to it so far; the Host refuses more than the limit. */
  follow_ups: number;
  /** The person took this part back into the delegating work: it is finished there, not followed up here. */
  taken_back?: boolean;
  /** What the delegating round should make of this state, in words (set when the person took it back). */
  note?: string;
}

export interface AgentDelegation {
  /** `character`: one of the professional roles offered this round (its id); the sub-task then runs as exactly that role. */
  start(input: { title: string; brief: string; acceptance: string; materials?: Array<{ title: string; text: string }>; character?: string }): Promise<AgentDelegatedWork>;
  /** The delegated works (all, or the given ones), waiting up to `wait_ms` for them to finish or need the person. */
  status(input: { work_ids?: string[]; wait_ms?: number }, signal?: AbortSignal): Promise<AgentDelegatedWork[]>;
  /** Tell a delegated work what to fix or add (its next round); bounded per work. */
  follow_up(workId: string, text: string): Promise<AgentDelegatedWork>;
  stop(workId: string): Promise<AgentDelegatedWork>;
}

/**
 * A round's separately authorized memory reads and changes. `remember` and `forget` rest on the person's own words and wishes, so a delegated work, whose only words are the delegating work's brief, gets neither.
 */
interface AgentMemoryToolControl {
  /** Host-bound to this Run; only the read tool receives it. */
  readonly memory_read?: import("./memory.js").MemoryRunReadControl;
  /** One trusted invocation, generated by the executor, never the model's tool-call id or arguments. */
  readonly operation_id: string;
  /** The actual tool/Run cancellation, retained through formal storage and ledger commits. */
  readonly signal: AbortSignal;
}
export interface AgentMemoryTools {
  /**
   * Kept through the platform's write gate (specs/archive/memory-system §6.2); it throws with the reason when nothing was kept
   * (switched off, secret-shaped, held for the person). It is recorded as the person's own words (“you said”) only when `text` is the whole of one message they typed in this work, as the Host saved it, apart from case, width, spacing, quotation-mark style and one sentence mark at the very end (nothing else: a superscript, a ligature or an invisible character is not a space or the plain form). A paraphrase, a part of a message, words of two messages joined, a project's name put in: not theirs. It is left as the Assistant's suggestion for them to accept, and this throws. The judgement is against the saved message, never against `said`, which is only a pointer, and what is kept is the saved message as they wrote it, not the text given here. `note` says it was already kept.
   */
  remember?(input: { text: string; scope: "personal" | "project" | "character"; said: string; kind?: "preference" | "convention" | "fact" | "experience"; replaces?: string }, control: AgentMemoryToolControl): Promise<{ memory_id: string; scope: "personal" | "project" | "character"; applies: string; note?: string }>;
  list?(control: AgentMemoryToolControl): Promise<import("./memory.js").MemoryRunReadResult>;
  /** Switches one off (not a delete: the person can switch it on again or delete it in settings), as the Assistant's change. */
  forget?(memoryId: string, control: AgentMemoryToolControl): Promise<{ forgotten: boolean; note?: string }>;
  /** Suggest keeping something the person did not ask for: a candidate only, until they accept it. Absent: this round may not suggest. */
  propose?(input: { text: string; scope: "personal" | "project"; why: string; applies: string }, control: AgentMemoryToolControl): Promise<{ candidate_id: string; note: string }>;
}

export interface AgentActionClient {
  discover(): Promise<readonly ActionView[]>;
  /** Who reads this round's replies: absent, the person; `work`, the work that handed this one over (a delegated work reports to it). */
  reader?: "work";
  /** Delegate sub-tasks to separate works (see AgentDelegation). Absent: this round cannot delegate. */
  delegate?: AgentDelegation;
  /** Remember, list and forget for the person (see AgentMemoryTools). Absent: this round has no semantic memory tools. */
  memory?: AgentMemoryTools;
  /** Record a proposal for the person; validated against the current capability. Absent: this caller takes none. */
  offer?(offer: AgentActionOffer): Promise<{ offer_id: string }>;
  /** Validate an input exactly as dispatch will, running nothing; throws the contract's own error. */
  check?(reference: ExactActionReference, input: unknown): Promise<void>;
  /**
   * Whether this change may run without the person's confirmation: it declares how it is undone, its undo is offered
   * now, and the person has not set it to confirm each time. Absent: every change is confirmed.
   */
  direct?(view: ActionView): boolean;
  invoke(reference: ExactActionReference, input: unknown, signal?: AbortSignal, memoryRead?: import("./memory.js").MemoryRunReadControl): Promise<unknown>;
}

export interface AgentFrozenRole {
  /** Trusted Host composition only: the memories this run is given (from the platform memory's recall for its consumer). */
  memory?: AgentRecalledMemory;
  workspace?: "required" | "none" | "business";
  /** Trusted Host composition only. `operate` lets the gateway request changes; reads are always allowed. */
  action_gateway?: { client: AgentActionClient; operate: boolean };
  /** Trusted Host composition only. Never serialized into run history. */
  actions?: { tools: ActionView[]; client: AgentActionClient };
  character_skill_ids?: string[];
  subagent_workspaces?: AgentSubagentWorkspace[];
  subagents?: AgentFrozenSubagentRole[];
  character?: AgentFrozenCharacter;
  role_id: string;
  version: number;
  execution: AgentRoleExecution;
  /** Separate selection prompt: never composed into the executing role. */
  compaction?: { prompt: AgentPromptText; above_tokens: number };
  /** Separate review prompt, the same: never composed into the executing role. */
  ending_review?: { prompt: AgentPromptText };
  /** Prompt bodies in composition order. */
  prompts: AgentPromptText[];
  /** Exact method bodies resolved by the Host, never accepted from the request. */
  skills?: AgentSkillDefinition[];
  /** Host tool names this role may call. */
  host_tools: string[];
}

interface AgentStartRequestFields {
  /** Host-proven original text before assembly. Mutually exclusive with continued_from; person requires Host authority. */
  original_input?: import("./agent-inputs.js").AgentOriginalInputDraft;
  /** Reuse the original input of this exact Run in the same Session, without creating a new personal statement. */
  continued_from?: import("./agent-host-runtime.js").AgentRunRef;
  action_tools?: ExactActionReference[];
  /**
   * Business roles only: instead of one tool per action, the Host's gateway — find the actions in scope, run a read,
   * or request a change (held for review). The directory is read at every call, so installing, upgrading or switching
   * off an action takes effect at once. Exclusive with `action_tools`.
   */
  action_gateway?: boolean;
  /** Explicit subset of the selected Character's imported Skills. Empty uses rules only. */
  character_skill_ids?: string[];
  execution_plan?: AgentExecutionPlan;
  /**
   * Continue the unfinished step graph of this earlier round in the same session. The plan must be exactly the
   * one that round was frozen with; a person's inserted and skipped steps carry over because the graph does.
   */
  continue_step_board_of?: string;
  /** The project work item this round waited as (see queueProjectRound); the round takes it over when it starts. */
  queued_work_id?: string;
  /** The supplements waiting in this session that the round takes (agent-inputs); none when absent, unless the session says `auto`. */ queued?: import("./agent-inputs.js").AgentQueuedInputs;
  /** The session's name as the person sees it, for the project's list of work under way. */
  session_title?: string;
  /**
   * `false`: this round gets no side panel browser even where its project has one (specs/archive/side-panel) — e.g. a delegated
   * work running beside its parent. Absent: a business round in a project with a browser may use it.
   */
  browser?: false;
  /**
   * How earlier rounds of the session reach this one. Absent or `session` carries every earlier round verbatim, tool
   * output included. `digest` starts without that raw history: the task itself carries the caller's digest of earlier
   * rounds, which is how a long session keeps working once its history no longer fits the model's window.
   */
  history?: "session" | "digest";
  /** Selected child roots; the Host must independently verify every directory grant. */
  subagent_workspaces?: AgentSubagentWorkspace[];
  /** Only a reference is accepted from the caller; the Host resolves its immutable content. */
  character?: ArtifactReference | null;
  session: AgentSessionRef;
  project_id: string;
  plugin_id: string;
  install_id: string;
  actor_id: string;
  /** The assembled task for this Run; it may contain Host-derived text and is not proof of personal authorship. */
  task: string;
  role_id: string;
  /** A configured provider/model selected for this run, resolved by the Host. */
  model_selection?: { provider_id: string; model_id: string };
  /** Refused unless the selected model is marked as taking a reasoning effort. */
  reasoning_effort?: AgentReasoningEffort;
  /**
   * Filled in by the Host before the adapter is called. Absent only on a direct
   * adapter call, which an adapter must refuse rather than guess around.
   */
  role?: AgentFrozenRole;
  text_materials?: AgentTextMaterial[];
  /** Images for the model to see in this Run; refused when the selected model is marked as not seeing images. */
  image_materials?: AgentImageMaterial[];
  skills?: AgentSkillRef[];
  mcp_tools?: AgentMcpToolRef[];
  mcp_sources?: AgentMcpSourceRef[];
  budget?: AgentRunBudget;
}

export type AgentStartRequest = AgentStartRequestFields & AgentWorkspace;
