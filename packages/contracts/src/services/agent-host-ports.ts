/** The agent-host contract (`services/agent-host`): a runtime's checkpoints, Skills, MCP, subagents, schedule and recovery. */
import type { AgentWorkingDirectory, AgentSkillRef, AgentMcpToolRef, AgentMcpSourceRef } from "./agent-host-start.js";
import type { AgentSessionRef, AgentRunRef } from "./agent-host-runtime.js";
import type { AgentReviewRequest } from "./agent-host-reviews.js";
import type { AgentSkillDeclaration, AgentSkillDefinition } from "../platform/plugin-agent.js";
import type { AgentToolActivity, AgentRunUsage } from "./agent-host-run-view.js";
import type { AgentMemoryExecutionControl } from "./agent-host-memory.js";

export interface AgentCheckpoint {
  checkpoint_id: string;
  origin_run_id?: string;
  paths?: string[];
  directory?: AgentWorkingDirectory;
  session_id: string;
  label: string;
  created_at: string;
  /** When a reviewed rewind to this checkpoint last took effect, if one has; the files may have changed since. */
  rewound_at?: string;
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

export interface AgentSkillOwner { project_id: string; plugin_id: string }

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
  auth?: { kind: "none" | "keep-existing" | "replace-secret" | "connection"; secret?: string; connection_id?: string };
}

export interface AgentMcpServerView {
  id: string; version: number; label: string; enabled: boolean;
  transport: "stdio" | "http"; timeout_ms: number;
  directory?: AgentWorkingDirectory; executable?: string; argv?: string[]; endpoint?: string;
  credential: "none" | "present";
  auth_connection_id?: string;
  health: "connected" | "disconnected" | "unavailable" | "not-reattached";
  busy?: string; error?: string;
  tools: Array<AgentMcpToolRef & { description: string }>;
  resources: string[];
}

export interface AgentMcpLibrary {
  /** Host management only: configuration provenance and safe views across projects; this grants no invocation authority. */
  catalog?(): Promise<Array<{ owner: AgentSkillOwner; server: AgentMcpServerView }>>;
  list(owner: AgentSkillOwner): Promise<AgentMcpServerView[]>;
  save(owner: AgentSkillOwner, input: AgentMcpServerInput): Promise<AgentMcpServerView>;
  control(owner: AgentSkillOwner, id: string, action: "connect" | "refresh" | "disconnect" | "cancel" | "remove", options?: { expected_version?: number; signal?: AbortSignal; beforeDispatch?(): void | Promise<void> }): Promise<void>;
  validateSources(owner: AgentSkillOwner, selected: readonly AgentMcpSourceRef[]): Promise<AgentMcpSourceRef[]>;
  validate(owner: AgentSkillOwner, selected: readonly AgentMcpToolRef[]): Promise<AgentMcpToolRef[]>;
  /** Connected tools with the input shape the server declared, for the shared action directory. */
  tools?(owner: AgentSkillOwner): Promise<AgentMcpToolDescriptor[]>;
  /** Whether this exact tool version is callable right now (connected, same configuration and shape). Synchronous. */
  live?(ref: AgentMcpToolRef): boolean;
  /** One call outside an Agent run. Recheck Host authority after asynchronous preparation and at the runtime's dispatch gate. */
  call?(owner: AgentSkillOwner, ref: AgentMcpToolRef, args: Readonly<Record<string, unknown>>, options?: {
    signal?: AbortSignal; beforeDispatch?(): void | Promise<void>;
    /** Host observation only, after preparation and the business dispatch guard; never grants authority. */
    onBusinessDispatch?(): void;
    onBusinessResult?(outcome: "succeeded" | "failed" | "unknown"): void;
  }): Promise<AgentMcpCallResult>;
}

export interface AgentMcpToolDescriptor extends Required<Pick<AgentMcpToolRef, "server" | "tool" | "version" | "configuration_version" | "server_label">> {
  description: string;
  input_schema: Record<string, unknown>;
}

/** What the external tool returned; untrusted data, never instructions. */
export interface AgentMcpCallResult { text: string; truncated: boolean }

export interface AgentMcpCapability {
  catalog(session: AgentSessionRef): Promise<{
    servers: AgentMcpServerHealth[];
    tools: AgentMcpToolRef[];
  }>;
}

export type AgentSubagentState = "running" | "completed" | "failed" | "cancelled" | "reconcile-required";

export interface AgentSubagentView {
  child_run?: AgentRunRef;
  activity?: AgentToolActivity[];
  usage?: AgentRunUsage;
  host_tools?: string[];
  error?: string;
  subagent_id: string;
  parent_run: AgentRunRef;
  role_id: string;
  /** Name frozen at dispatch, unaffected by later role edits. */
  role_name?: string;
  task: string;
  state: AgentSubagentState;
  result: string | null;
  workspace_path: string | null;
}

export interface AgentSubagentsCapability {
  /** Distinct child roots and their review/recovery bridge are actually wired. */
  workspaces?: true;
  list(run: AgentRunRef): Promise<AgentSubagentView[]>;
  cancel(run: AgentRunRef, subagentId: string, actorId: string): Promise<void>;
}

/**
 * One Agent Runtime. An adapter reports facts and executes approved work; it
 * never owns approval, business meaning or durable product state.
 */
export interface AgentRecoveryReport {
  session_id: string; blockers: string[];
  inputs?: import("./agent-inputs.js").AgentQueuedInput[];
  runs: Array<{
    run_id: string;
    version: number;
    live: boolean;
    waiting: number;
    can_close: boolean;
    /** Parked at a normal shutdown on an open question that can be answered now (it can still be closed instead). Absent: not answerable. */
    can_answer?: true;
    /** The questions the round left open; `answered`: answered after the interruption, the answer waits for the next round. */
    questions?: Array<{ pending_id: string; pending_revision: number; kind: string; prompt: string; answered?: true }>;
    blockers: string[];
    operations: Array<{ effect_id: string; kind: string; summary: string; outcome: "completed" | "failed" | "not-dispatched" | "unknown" }>;
    /** The interrupted round belongs to this subtask of the session; closing it settles the subtask. */
    subagent?: { subagent_id: string };
  }>;
}

/** Inspect authoritative receipts; closing records an interruption and never replays work. */
/** Timed work the runtime keeps across restarts: the Host names what to do; its runner does it when due. */
export interface AgentScheduledTask {
  task_id: string;
  /** Idempotency: the same key scheduled twice is one task. */
  key: string;
  session_id: string;
  kind: string;
  payload: Record<string, unknown>;
  due_at: string;
  state: "queued" | "running" | "done" | "failed" | "reconcile-required" | "cancelled";
  attempts: number;
  runs: number;
  last_failure?: string;
}

/** The runtime's durable local queue (Prologue `LocalQueue`), not a timer of the Host's own. */
export interface AgentScheduleCapability {
  /** Whether queued work still runs with the window closed, and why — from the Host's own handshake. */
  claim(): { survives_window_close: boolean; why: string };
  /** The live control protects only first admission; each background attempt owns fresh authority. */
  enqueue(input: { key: string; session_id: string; kind: string; payload: Record<string, unknown>; due_at: string; max_attempts?: number },
    control?: AgentMemoryExecutionControl & { signal?: AbortSignal }): Promise<AgentScheduledTask>;
  /** Cancels a task not yet started; null when there is none under that key. A running one cannot be cancelled. */
  cancel(key: string): Promise<AgentScheduledTask | null>;
  find(key: string): AgentScheduledTask | null;
  list(kind?: string): AgentScheduledTask[];
  /** The one runner for a kind. Tasks that fall due before it attaches wait for it (briefly), then count a failed attempt. */
  handle(kind: string, run: (task: AgentScheduledTask) => Promise<void>): () => void;
}

export interface AgentRecoveryCapability {
  inspect(session: AgentSessionRef): Promise<AgentRecoveryReport>;
  close(session: AgentSessionRef, runId: string, expectedVersion: number): Promise<AgentRecoveryReport>;
}
