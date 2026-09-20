import type {
  AgentPromptLayer,
  AgentPromptText,
  AgentRoleExecution,
  AgentSkillDeclaration,
  AgentSkillDefinition,
} from "../platform/plugin-agent.js";
import type { HostCapabilityDefinition } from "../platform/app-host.js";
import type { ContractDescriptor } from "../platform/package.js";

export const servicesAgentHostContract = {
  contractId: "io.molis.work.service.agent-host.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "contract-only",
  ssot: "docs/horizontal/agent-host.md",
} as const satisfies ContractDescriptor;

export const AGENT_RUNTIME_CAPABILITIES = [
  "session.create",
  "session.read",
  "session.resume",
  "run.start",
  "run.observe",
  "run.control",
  "text-edit",
  "command",
  /**
   * Can report what a command it already ran produced.
   *
   * Separate from `command` on purpose: a Runtime may be unable to execute a
   * command under Host approval while still being able to say what it did run.
   * Folding the two together forced a surface that shows receipts to gate on
   * execution, which is a different question.
   */
  "command.receipts",
  "checkpoint",
  "rewind",
  "skills",
  "mcp",
  "subagents",
  "compaction",
  "usage",
] as const;

export type AgentRuntimeCapability = (typeof AGENT_RUNTIME_CAPABILITIES)[number];

export type AgentCapabilitySupport = "supported" | "partial" | "unsupported";

/**
 * What a Runtime can actually do. The product degrades against this matrix and
 * shows an unsupported capability as truly unavailable; it never simulates one.
 */
export type AgentRuntimeCapabilityMatrix = Record<AgentRuntimeCapability, AgentCapabilitySupport>;

export interface AgentRuntimeDescriptor {
  runtime_id: string;
  display_name: string;
  provider_version: string;
  capabilities: AgentRuntimeCapabilityMatrix;
}

export type AgentRuntimeHealthStatus = "ready" | "needs_setup" | "unavailable";

export interface AgentRuntimeHealth {
  ok: boolean;
  status: AgentRuntimeHealthStatus;
  message: string;
  /** One concrete next step for the user. Never a raw provider diagnostic. */
  action?: string;
}

export interface AgentSessionRef {
  session_id: string;
  runtime_id: string;
}

export interface AgentRunRef {
  run_id: string;
  session_id: string;
}

export type AgentRunPhase =
  | "starting"
  | "running"
  | "awaiting-review"
  | "awaiting-input"
  | "paused"
  | "compacting"
  | "completed"
  | "failed"
  | "cancelled"
  | "stopped"
  | "reconcile-required";

const TERMINAL_AGENT_PHASES: readonly AgentRunPhase[] = [
  "completed",
  "failed",
  "cancelled",
  "stopped",
];

/** `reconcile-required` is not terminal: an unsettled effect still needs a decision. */
export function isTerminalAgentPhase(phase: AgentRunPhase): boolean {
  return TERMINAL_AGENT_PHASES.includes(phase);
}

/** An authorized directory. The Host resolves and verifies it; the Plugin never passes a raw path. */
export interface AgentWorkingDirectory {
  canonical_path: string;
  realpath_verified: boolean;
}

export interface AgentTextMaterial {
  material_id: string;
  title: string;
  /** Verbatim text the model may read. Frozen before the Run starts. */
  text: string;
  source_artifact_id: string;
  source_version: number;
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

export interface AgentRunBudget {
  max_output_tokens?: number;
  max_total_tokens?: number;
  max_duration_ms?: number;
}

/**
 * Exactly what the Host froze for one Run. Later settings changes never alter a
 * started Run; the product shows this, not the next-run selection.
 */
export interface AgentFrozenStart {
  role_id: string;
  role_version: number;
  execution: AgentRoleExecution;
  model_id: string;
  /** Host-frozen context selection policy, absent when not wired for this runtime. */
  compaction?: { prompt_id: string; version: number; above_tokens: number };
  /**
   * Exactly the prompts this Run was frozen with, layer included.
   *
   * The layer travels so a surface can show *who* said each part — product,
   * Plugin role, or project. Without it the list is a flat set of ids that
   * nobody can attribute, which is the state this used to be in.
   */
  prompts: Array<{ prompt_id: string; version: number; layer: AgentPromptLayer }>;
  skills: AgentSkillDeclaration[];
  mcp_tools: AgentMcpToolRef[];
  mcp_sources?: AgentMcpSourceRef[];
  host_tools: string[];
  text_materials: Array<{ material_id: string; source_artifact_id: string; source_version: number }>;
  budget: AgentRunBudget | null;
  directory: AgentWorkingDirectory;
}

export interface AgentCreateSessionInput {
  board_id: string;
  plugin_id: string;
  install_id: string;
  actor_id: string;
  directory: AgentWorkingDirectory;
  title: string;
}

/**
 * The role as the Host froze it, taken from the Plugin's own declarations.
 *
 * An adapter receives this and never invents a prompt, a version or a wider
 * execution level: prompt bodies belong to the Plugin package, and the Host is
 * the only place allowed to decide what a Run is permitted to do.
 */
export interface AgentFrozenRole {
  role_id: string;
  version: number;
  execution: AgentRoleExecution;
  /** Separate selection prompt: never composed into the executing role. */
  compaction?: { prompt: AgentPromptText; above_tokens: number };
  /** Prompt bodies in composition order. */
  prompts: AgentPromptText[];
  /** Exact method bodies resolved by the Host, never accepted from the request. */
  skills?: AgentSkillDefinition[];
  /** Host tool names this role may call. */
  host_tools: string[];
}

export interface AgentStartRequest {
  session: AgentSessionRef;
  board_id: string;
  plugin_id: string;
  install_id: string;
  actor_id: string;
  /** The user's instruction for this Run. */
  task: string;
  role_id: string;
  /** A configured provider/model selected for this run, resolved by the Host. */
  model_selection?: { provider_id: string; model_id: string };
  /**
   * Filled in by the Host before the adapter is called. Absent only on a direct
   * adapter call, which an adapter must refuse rather than guess around.
   */
  role?: AgentFrozenRole;
  directory: AgentWorkingDirectory;
  text_materials?: AgentTextMaterial[];
  skills?: AgentSkillRef[];
  mcp_tools?: AgentMcpToolRef[];
  mcp_sources?: AgentMcpSourceRef[];
  budget?: AgentRunBudget;
}

export interface AgentRunHandle {
  ref: AgentRunRef;
  frozen: AgentFrozenStart;
}

export type AgentRunControl =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" }
  | { kind: "cancel" }
  /** Append an instruction to the running task. Never a new Run. */
  | { kind: "steer"; text: string }
  /**
   * Answer one question the Run is stopped on.
   *
   * Deliberately not `steer`: an answer is addressed to a specific pending
   * question and closes it. Sending it as a free instruction would leave the
   * question open while the Run reads the text as unrelated guidance.
   */
  | { kind: "answer"; pending_id: string; pending_revision?: number; text?: string;
      answers?: ReadonlyArray<{ question: number; indexes: readonly number[]; other?: string }> };

export type AgentTurnKind = "user" | "assistant" | "system";

export interface AgentTurnView {
  turn_id: string;
  kind: AgentTurnKind;
  text: string;
  /** Observation time; null when the original replay has no recorded time. */
  at: string | null;
  /** Relative presentation order within this Run, reconstructed from its events. */
  sequence?: number;
}

export type AgentToolActivityState = "started" | "completed" | "failed" | "unknown";

export interface AgentToolActivity {
  call_id: string;
  name: string;
  /** Safe target summary (path, command, query). Never raw credentials. */
  target: string;
  state: AgentToolActivityState;
  summary: string;
  /** Bounded execution evidence, shown only when the user expands the activity. */
  output?: string;
  output_truncated?: boolean;
  /** Last observation time; null when absent from the original replay. */
  at: string | null;
  /** Position of the original call; a result updates it without moving it. */
  sequence?: number;
}

export interface AgentTokenCount {
  input: number;
  output: number;
  cached_input?: number;
  reasoning?: number;
}

export interface AgentRunUsage {
  tokens: AgentTokenCount;
  cost_usd?: number;
  /** Set when the Runtime did not report usage. The product shows unavailable, never zero. */
  unavailable_reason?: string;
}

export interface AgentCommandOutputRef {
  call_id: string;
  /** Required for unambiguous product links; legacy callers may omit it. */
  run_id?: string;
}

export interface AgentCommandOutput {
  ref: AgentCommandOutputRef;
  command: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timed_out?: boolean;
  cancelled?: boolean;
  stop_reason?: "cancelled" | "timed-out";
}

/**
 * A question the Run stopped on and is waiting for a person to answer.
 *
 * Options are what the Runtime offered. An empty list means free text only —
 * never a hidden default, because answering on the user's behalf is the one
 * thing a question surface must not do.
 */
export interface AgentPendingQuestion {
  pending_id: string;
  pending_revision?: number;
  /** Position of the original waiting event among this Run's visible entries. */
  sequence?: number;
  /** The Runtime's own category, e.g. a plan choice or a clarification. */
  kind: string;
  /** The question as the Runtime phrased it. Shown as-is. */
  prompt: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Whether a written answer is accepted alongside, or instead of, the options. */
  allows_free_text: boolean;
  /** Frozen questionnaire read from its execution owner, never reconstructed from prose. */
  questions?: ReadonlyArray<{ index: number; prompt: string;
    options: ReadonlyArray<{ index: number; label: string }>; multiple: boolean; allow_other: boolean }>;
  answerable?: boolean;
  unavailable_reason?: string;
}

export interface AgentRunView {
  ref: AgentRunRef;
  phase: AgentRunPhase;
  frozen: AgentFrozenStart;
  turns: AgentTurnView[];
  activity: AgentToolActivity[];
  /** References to durable command facts, not inferred from assistant text. */
  command_outputs?: AgentCommandOutputRef[];
  usage: AgentRunUsage;
  /**
   * Questions this Run is stopped on. Empty while it is running.
   *
   * The phase alone was not enough: a surface could see `awaiting-input` but
   * had no way to show what was being asked, so the Run stalled with the user
   * unable to act.
   */
  awaiting_input: readonly AgentPendingQuestion[];
  /** Content-free reason when the Run stopped, failed or needs reconciliation. */
  stop_reason?: string;
  started_at: string;
  ended_at: string | null;
}

export interface AgentSessionView {
  /** A manual rewind is in progress or has an unresolved execution outcome. */
  checkpoint_busy?: boolean;
  /** Persisted work exists but is not safe to continue automatically. */
  recovery?: { required: true; reason: string };
  owner: Pick<AgentCreateSessionInput, "board_id" | "plugin_id" | "install_id">;
  session: AgentSessionRef;
  title: string;
  runs: AgentRunRef[];
  latest_run: AgentRunView | null;
}

export type AgentReviewKind = "text-edit" | "command" | "tool-operation" | "mcp" | "rewind";

export interface AgentTextReviewDocument {
  kind: "text-edit";
  target_path: string;
  exists: boolean;
  before_text: string | null;
  after_text: string;
}

export interface AgentCommandReviewDocument {
  kind: "command";
  command: string;
  args: string[];
  cwd: string;
  timeout_ms: number;
  env_allowlist?: string[];
  escalate?: boolean;
}

export interface AgentToolOperationReviewDocument {
  kind: "tool-operation";
  tool: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
}

export interface AgentMcpReviewDocument {
  kind: "mcp";
  server: string;
  tool: string;
  arguments_json: string;
}

export interface AgentRewindReviewDocument {
  kind: "rewind";
  checkpoint_id: string;
  files: Array<{ path: string; change: "restore" | "delete" | "create"; before_text: string | null; after_text: string | null }>;
}

export type AgentReviewDocument =
  | AgentTextReviewDocument
  | AgentCommandReviewDocument
  | AgentToolOperationReviewDocument
  | AgentMcpReviewDocument
  | AgentRewindReviewDocument;

export type AgentReviewStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired";

export interface AgentReviewRequest {
  review_id: string;
  /** Null for a manual operation; never fabricate an Agent Run. */
  run: AgentRunRef | null;
  operation?: { operation_id: string; session_id: string; kind: "checkpoint-rewind" };
  board_id: string;
  plugin_id: string;
  kind: AgentReviewKind;
  document: AgentReviewDocument;
  requested_at: string;
  expires_at: string | null;
}

export interface AgentReviewDecisionInput {
  review_id: string;
  decision: "approve" | "reject";
  actor_id: string;
  note?: string;
}

export interface AgentReviewReceipt {
  review_id: string;
  status: AgentReviewStatus;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  /** True once the approved effect really happened and the Runtime returned a receipt. */
  effect_settled: boolean;
  effect_error: string | null;
  /** The effect owner cannot yet determine what happened; never safe to retry automatically. */
  effect_uncertain?: string;
  /** Host recorded a decision, but the execution owner did not confirm receiving it. */
  delivery_error?: string;
}

/**
 * Host-owned approval queue. A Plugin can observe and present it, but only the
 * Host records a decision, and only a recorded approval releases an effect.
 */
export interface AgentReviewQueueApi {
  list(boardId: string, status?: AgentReviewStatus): AgentReviewRequest[];
  get(reviewId: string): AgentReviewRequest | null;
  decide(input: AgentReviewDecisionInput): AgentReviewReceipt;
  receipt(reviewId: string): AgentReviewReceipt | null;
  observe(listener: (request: AgentReviewRequest) => void): () => void;
}

export interface AgentCheckpoint {
  checkpoint_id: string;
  origin_run_id?: string;
  paths?: string[];
  directory?: AgentWorkingDirectory;
  session_id: string;
  label: string;
  created_at: string;
}

export interface AgentCheckpointsCapability {
  busy?(session: AgentSessionRef): boolean;
  list(session: AgentSessionRef): Promise<AgentCheckpoint[]>;
  prepareRewind(session: AgentSessionRef, checkpointId: string): Promise<AgentReviewRequest>;
}

export interface AgentSkillCatalogEntry extends AgentSkillDeclaration {
  source: "builtin" | "installed";
  enabled: boolean;
}

export interface AgentSkillOwner { board_id: string; plugin_id: string }
export interface AgentSkillCandidate {
  candidate_id: string;
  name: string;
  summary: string;
  source_label: string;
  files: string[];
  body: string;
}
export interface AgentSkillLibrary {
  list(owner: AgentSkillOwner): Promise<AgentSkillCatalogEntry[]>;
  read(owner: AgentSkillOwner, ref: AgentSkillRef): Promise<AgentSkillDefinition>;
  discover(owner: AgentSkillOwner, directory: AgentWorkingDirectory, path: string): Promise<AgentSkillCandidate[]>;
  install(owner: AgentSkillOwner, candidateId: string): Promise<AgentSkillCatalogEntry>;
}

export interface AgentSkillsCapability {
  catalog(session: AgentSessionRef): Promise<AgentSkillCatalogEntry[]>;
}

export interface AgentMcpServerHealth {
  server: string;
  status: "ready" | "failed" | "unknown";
}

export interface AgentMcpServerInput {
  id?: string;
  expected_version: number;
  label: string;
  enabled: boolean;
  timeout_ms: number;
  transport: "stdio" | "http";
  directory?: AgentWorkingDirectory;
  executable?: string;
  argv?: string[];
  endpoint?: string;
  auth?: { kind: "none" | "keep-existing" | "replace-secret"; secret?: string };
}
export interface AgentMcpServerView {
  id: string; version: number; label: string; enabled: boolean;
  transport: "stdio" | "http"; timeout_ms: number;
  directory?: AgentWorkingDirectory; executable?: string; argv?: string[]; endpoint?: string;
  credential: "none" | "present";
  health: "connected" | "disconnected" | "unavailable" | "not-reattached";
  busy?: string; error?: string;
  tools: Array<AgentMcpToolRef & { description: string }>;
  resources: string[];
}
export interface AgentMcpLibrary {
  list(owner: AgentSkillOwner): Promise<AgentMcpServerView[]>;
  save(owner: AgentSkillOwner, input: AgentMcpServerInput): Promise<AgentMcpServerView>;
  control(owner: AgentSkillOwner, id: string, action: "connect" | "disconnect" | "cancel" | "remove"): Promise<void>;
  validateSources(owner: AgentSkillOwner, selected: readonly AgentMcpSourceRef[]): Promise<AgentMcpSourceRef[]>;
  validate(owner: AgentSkillOwner, selected: readonly AgentMcpToolRef[]): Promise<AgentMcpToolRef[]>;
}

export interface AgentMcpCapability {
  catalog(session: AgentSessionRef): Promise<{
    servers: AgentMcpServerHealth[];
    tools: AgentMcpToolRef[];
  }>;
}

export type AgentSubagentState = "running" | "completed" | "failed" | "cancelled";

export interface AgentSubagentView {
  subagent_id: string;
  parent_run: AgentRunRef;
  role_id: string;
  task: string;
  state: AgentSubagentState;
  result: string | null;
  workspace_path: string | null;
}

export interface AgentSubagentsCapability {
  list(run: AgentRunRef): Promise<AgentSubagentView[]>;
  cancel(subagentId: string, actorId: string): Promise<void>;
}

/**
 * One Agent Runtime. An adapter reports facts and executes approved work; it
 * never owns approval, business meaning or durable product state.
 */
export interface AgentRuntimeAdapter {
  readonly descriptor: AgentRuntimeDescriptor;
  health(): Promise<AgentRuntimeHealth>;
  createSession(input: AgentCreateSessionInput): Promise<AgentSessionRef>;
  readSession(session: AgentSessionRef): Promise<AgentSessionView>;
  start(request: AgentStartRequest): Promise<AgentRunHandle>;
  read(run: AgentRunRef): Promise<AgentRunView>;
  observe(run: AgentRunRef, listener: (view: AgentRunView) => void): () => void;
  control(run: AgentRunRef, control: AgentRunControl): Promise<void>;
  readCommandOutput(
    session: AgentSessionRef,
    ref: AgentCommandOutputRef,
  ): Promise<AgentCommandOutput>;
  readonly checkpoints?: AgentCheckpointsCapability;
  readonly skills?: AgentSkillsCapability;
  readonly skillLibrary?: AgentSkillLibrary;
  readonly mcpLibrary?: AgentMcpLibrary;
  readonly mcp?: AgentMcpCapability;
  readonly subagents?: AgentSubagentsCapability;
}

/**
 * Every failure the Agent Host and its adapters can report.
 *
 * This is the whole domain, not a sample: each error class narrows from it with
 * `Extract`, so a code that is thrown but not listed here stops compiling. An
 * earlier version listed eight codes while seventeen were in use, and declared
 * one (`agent.review_required`) that nothing ever threw.
 */
export type AgentHostErrorCode =
  // Runtime registry
  | "agent.runtime_unknown"
  | "agent.runtime_duplicate"
  | "agent.runtime_missing"
  // Start authority: the three gates, plus what the adapter needs before it runs
  | "agent.capability_unavailable"
  | "agent.role_not_declared"
  | "agent.role_not_frozen"
  | "agent.role_execution_exceeded"
  | "agent.directory_unauthorized"
  | "agent.model_not_configured"
  // Session and run lookup
  | "agent.session_unknown"
  | "agent.session_busy"
  | "agent.run_unknown"
  // Host-owned review queue
  | "agent.review_unknown"
  | "agent.review_already_decided"
  | "agent.review_expired"
  | "agent.review_not_approved"
  // Approval bridge between a Runtime's pending effect and the queue
  | "agent.pending_unknown"
  | "agent.pending_not_open";

export interface AgentHostApi {
  register(adapter: AgentRuntimeAdapter): void;
  descriptors(): AgentRuntimeDescriptor[];
  adapter(runtimeId: string): AgentRuntimeAdapter;
  matrix(runtimeIds: string[]): Array<{
    runtime_id: string;
    capabilities: AgentRuntimeCapabilityMatrix;
  }>;
  readonly reviews: AgentReviewQueueApi;
}

/**
 * Capabilities the Host registers so Plugins can reach the Agent Host.
 *
 * A Plugin never holds the Agent Host itself: it declares these under
 * `capabilities.consumes` and `requires`, and the Host checks the declaration
 * before the call lands. That keeps the Manifest a complete account of what a
 * Plugin can reach, and keeps start authority in one place.
 */
export const agentHostCapabilities = {
  /** Which Runtimes exist and what each one really supports. */
  listRuntimes: {
    capability_id: "agent.runtimes.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[], AgentRuntimeDescriptor[]>,
  /** Roles this Runtime can carry for one Plugin, with a reason for each it cannot. */
  availableRoles: {
    capability_id: "agent.roles.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [runtimeId: string, pluginId: string],
    Array<{ role_id: string; available: boolean; reason?: string }>
  >,
  createSession: {
    capability_id: "agent.session.create.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [runtimeId: string, input: AgentCreateSessionInput],
    AgentSessionRef
  >,
  readSession: {
    capability_id: "agent.session.read.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef], AgentSessionView>,
  listSkills: {
    capability_id: "agent.skills.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string], AgentSkillCatalogEntry[]>,
  readSkill: {
    capability_id: "agent.skills.read.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, ref: AgentSkillRef], AgentSkillDefinition>,
  discoverSkills: {
    capability_id: "agent.skills.discover.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, directory: AgentWorkingDirectory, path: string], AgentSkillCandidate[]>,
  installSkill: {
    capability_id: "agent.skills.install.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, candidateId: string], AgentSkillCatalogEntry>,
  listMcp: {
    capability_id: "agent.mcp.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string], AgentMcpServerView[]>,
  saveMcp: {
    capability_id: "agent.mcp.save.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, input: AgentMcpServerInput], AgentMcpServerView>,
  controlMcp: {
    capability_id: "agent.mcp.control.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, id: string, action: "connect" | "disconnect" | "cancel" | "remove"], void>,
  /** Start a Run. The Host checks role, capability and directory before the Runtime is asked. */
  startRun: {
    capability_id: "agent.run.start.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [runtimeId: string, request: AgentStartRequest],
    AgentRunHandle
  >,
  readRun: {
    capability_id: "agent.run.read.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef], AgentRunView>,
  controlRun: {
    capability_id: "agent.run.control.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [session: AgentSessionRef, run: AgentRunRef, control: AgentRunControl],
    void
  >,
  /**
   * Read what one command this Run executed produced.
   *
   * This is a receipt of work already done, never a way to run something: there
   * is deliberately no command-execution Capability. A Runtime that has not
   * wired command execution to the Host's approval queue reports `command` as
   * unsupported, and this call then fails with `agent.capability_unavailable`
   * rather than returning an empty result.
   */
  readCommandOutput: {
    capability_id: "agent.command-output.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [session: AgentSessionRef, ref: AgentCommandOutputRef],
    AgentCommandOutput
  >,
  listCheckpoints: {
    capability_id: "agent.checkpoints.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef], AgentCheckpoint[]>,
  prepareRewind: {
    capability_id: "agent.checkpoints.prepare-rewind.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[session: AgentSessionRef, checkpointId: string, roleId: string], AgentReviewRequest>,
  /** Read the approval queue. Deciding is a user action and is not exposed to Plugins. */
  listReviews: {
    capability_id: "agent.reviews.list.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [boardId: string, status?: AgentReviewStatus],
    AgentReviewRequest[]
  >,
} as const;

export type AgentHostCapabilityId =
  (typeof agentHostCapabilities)[keyof typeof agentHostCapabilities]["capability_id"];
