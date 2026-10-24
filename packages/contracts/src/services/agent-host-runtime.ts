/** The agent-host contract (`services/agent-host`): a runtime's capabilities, descriptor and health, session and run references and phases, and the adapter a runtime implements. */
import type { AgentMemoryExecutionControl, AgentMemoryCapability, AgentDocumentCapability } from "./agent-host-memory.js";
import type { AgentRecoveryCapability, AgentScheduleCapability, AgentCheckpointsCapability, AgentSkillsCapability, AgentSkillLibrary, AgentMcpLibrary, AgentMcpCapability, AgentSubagentsCapability } from "./agent-host-ports.js";
import type { AgentSessionOwner, AgentCreateSessionRequest, AgentStartExecution, AgentStartRequest } from "./agent-host-start.js";
import type { AgentSessionView, AgentSessionStatus, AgentRunHandle, AgentRunView, AgentRunControl, AgentCommandOutputRef, AgentCommandOutput } from "./agent-host-run-view.js";
import type { AgentProjectWorkCapability, AgentSessionMessagesCapability, AgentBackgroundCapability } from "./agent-host-session.js";
import type { AgentCollaborationPort } from "./agent-collaboration.js";
import type { AgentOriginalInput, AgentOriginalInputRef } from "./agent-inputs.js";

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
  supports_action_tools?: boolean;
  supports_workspace_none?: boolean;
  /** Runs business roles: no directory, the unified actions given at start and the root-free host tools. */
  supports_workspace_business?: boolean;
  /** Has verified a Character's tool limits (its host tools and its actions) against the Runtime's own tool gates; a Runtime without this refuses a Character instead of running it unlimited. */
  supports_character_limits?: boolean;
  runtime_id: string;
  display_name: string;
  provider_version: string;
  capabilities: AgentRuntimeCapabilityMatrix;
}

export type AgentRuntimeHealthStatus = "ready" | "needs_setup";

/** A session can be made on this Runtime and a round can run in it: neither capability is declared unsupported. */
export const hostsAgentSessions = (runtime: AgentRuntimeDescriptor): boolean =>
  runtime.capabilities["session.create"] !== "unsupported" && runtime.capabilities["run.start"] !== "unsupported";

/** The Home default Runtime: the first one in the Runtime directory's order that hosts sessions, or none. A project that picks its own Runtime overrides it. */
export const defaultAgentRuntime = (runtimes: readonly AgentRuntimeDescriptor[]): AgentRuntimeDescriptor | null => runtimes.find(hostsAgentSessions) ?? null;

/** The Runtime a project's sessions run on: the one the person picked in the project's settings, else the Home default; with none, why. */
export type ProjectRuntimeResolution =
  | { readonly runtime: AgentRuntimeDescriptor; readonly picked: boolean }
  | { readonly runtime: null; readonly picked: boolean; readonly reason: string };

/** A pick the directory no longer offers, or that cannot host a session, resolves to none and says so: it is never replaced by another Runtime. */
export function resolveProjectRuntime(runtimes: readonly AgentRuntimeDescriptor[], pickedId: string | null): ProjectRuntimeResolution {
  if (pickedId === null) {
    const first = defaultAgentRuntime(runtimes);
    return first ? { runtime: first, picked: false } : { runtime: null, picked: false, reason: "宿主还没有可用的运行时" };
  }
  const picked = runtimes.find(runtime => runtime.runtime_id === pickedId);
  if (picked && hostsAgentSessions(picked)) return { runtime: picked, picked: true };
  return { runtime: null, picked: true, reason: `项目选定的运行时「${picked?.display_name ?? pickedId}」现在不可用，请在项目设置里改选，或恢复为默认运行时` };
}

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

/** Trusted business owner, supplied by the Host invocation, never by an action payload. */
export interface AgentSessionDecision {
  operation_id: string;
  /** SDK canonical Session revision observed by the caller, not an App-side counter. */
  expected_version: number;
  expected_state: "active" | "archived";
}
export interface AgentSessionPurgePreview {
  session: AgentSessionRef;
  version: number;
  state: "active" | "archived";
  runs: number;
  resources: number;
  destroys_key: boolean;
}
export interface AgentSessionLifecycleView {
  session: AgentSessionRef;
  /** Unknown means the original decision needs reconciliation; missing never means purged. */
  state: "active" | "archived" | "purged" | "unknown";
  version: number | null;
  /** Original owner decision for explicit recovery, not a replacement for current canonical state. */
  operation?: { action: "archive" | "unarchive" | "purge"; decision: AgentSessionDecision; completed: boolean;
    preview?: AgentSessionPurgePreview; receipt?: AgentSessionLifecycleReceipt };
}
export interface AgentSessionLifecycleReceipt {
  /** This does not certify Memory ledger or business-owner copies have been deleted. */
  scope: "agent-host-session";
  session: AgentSessionRef;
  operation_id: string;
  action: "archive" | "unarchive" | "purge";
  state: "active" | "archived" | "purged";
  version: number;
}
export interface AgentSessionLifecycle {
  read(session: AgentSessionRef, owner: AgentSessionOwner): Promise<AgentSessionLifecycleView>;
  archive(session: AgentSessionRef, decision: AgentSessionDecision, owner: AgentSessionOwner): Promise<AgentSessionLifecycleReceipt>;
  /** Unlike historical Session restore, this changes the canonical lifecycle. */
  unarchive(session: AgentSessionRef, decision: AgentSessionDecision, owner: AgentSessionOwner): Promise<AgentSessionLifecycleReceipt>;
  previewPurge(session: AgentSessionRef, owner: AgentSessionOwner): Promise<AgentSessionPurgePreview>;
  purge(session: AgentSessionRef, decision: AgentSessionDecision, preview: AgentSessionPurgePreview, owner: AgentSessionOwner): Promise<AgentSessionLifecycleReceipt>;
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

/**
 * What a Runtime says about itself, for developers: how it was assembled, what the machine gives it, and what it could
 * not write down. Read from the Runtime's own receipts, never inferred; nothing here is a person's content.
 */
export interface AgentRuntimeDiagnostics {
  app: { app_id: string; app_version: string };
  state: "starting" | "ready" | "failed" | "stopped";
  /** The assembly every run froze: the same inputs resolve to the same fingerprint. */
  fingerprint: string;
  slots: Array<{ slot: string; state: "ready" | "disabled" | "unavailable"; implementation: string | null; version: string | null;
    /** Why a slot is not ready, in the Runtime's words. */
    why: string | null; fallback: boolean }>;
  /** What the app asked of the machine, what it really has, and every capability that is not simply present. */
  host: { requested: string[]; effective: string[]; not_present: Array<{ capability: string; state: string }> };
  /** Terminal records the Runtime could not keep: runs listed here would not replay after a restart. Empty is good news. */
  ledger_failures: Array<{ kind: string; seq: number; code: string | null; detail: string | null }>;
}

export interface AgentRuntimeAdapter {
  /** Trusted Host commit scope through the runtime's asynchronous preparation; never an Agent payload. */
  withEffect?<T>(control: AgentMemoryExecutionControl, operation: () => Promise<T>): Promise<T>;
  /** The Runtime's own account of its assembly, for the developer diagnostics page; absent when it keeps none. */
  diagnostics?(): AgentRuntimeDiagnostics;
  readonly recovery?: AgentRecoveryCapability;
  readonly schedule?: AgentScheduleCapability;
  readonly memory?: AgentMemoryCapability;
  readonly documents?: AgentDocumentCapability;
  readonly sessionLifecycle?: AgentSessionLifecycle;
  readonly descriptor: AgentRuntimeDescriptor;
  health(): Promise<AgentRuntimeHealth>;
  createSession(input: AgentCreateSessionRequest, execution?: AgentStartExecution): Promise<AgentSessionRef>;
  readSession(session: AgentSessionRef): Promise<AgentSessionView>;
  /** First immutable original plus its latest accepted direct attempt (not a derived continuation); absence never falls back to a composed task. */
  readOriginalInput?(ref: AgentOriginalInputRef): Promise<{ original: AgentOriginalInput; accepted_run: AgentRunRef } | undefined>;
  /** The session's standing without copying its rounds; a Runtime without it is read through readSession. */
  readSessionStatus?(session: AgentSessionRef): Promise<{ owner: AgentSessionView["owner"]; status: AgentSessionStatus }>;
  /** The project's work under way, when this Runtime keeps it. */
  readonly projectWork?: AgentProjectWorkCapability;
  /** Messages between the project's sessions, when this Runtime carries them. */
  readonly messages?: AgentSessionMessagesCapability;
  /** What the project's sessions wait for and how they go on, when this Runtime keeps a task graph. */
  readonly collaboration?: AgentCollaborationPort;
  /** Supplements to a round, with what became of each (agent-inputs). */ readonly inputs?: import("./agent-inputs.js").AgentInputsPort;
  /** Background commands of the project's sessions. */
  readonly background?: AgentBackgroundCapability;
  start(request: AgentStartRequest, execution?: AgentStartExecution): Promise<AgentRunHandle>;
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
