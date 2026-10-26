import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentImageMaterial, AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type {
  AgentRuntimeAdapter,
  AgentRecalledMemory,
  AgentMemoryUseReceipt,
  AgentSkillLibrary,
  AgentMcpLibrary,
  AgentMcpToolRef,
  AgentMcpSourceRef,
  AgentCommandOutput,
  AgentCommandOutputRef,
  AgentCreateSessionRequest,
  AgentRunControl,
  AgentRunRef,
  AgentRunView,
  AgentRuntimeCapabilityMatrix,
  AgentSessionView,
  AgentStartRequest,
  AgentStartExecution,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueRunMemoryPort } from "./prologue-run-memory.js";
import type { SupplementaryLocation } from "./prologue-original-inputs.js";
import type { RoundInputs, SessionQueue } from "./prologue-inputs.js";
import type { PrologueApprovalBridge } from "./prologue-approvals.js";
import type { RoundDesk, PrologueControlState, PrologueEvent } from "./prologue-stream.js";

/**
 * The ports the Prologue adapter (prologue.ts) needs, not a mirror of the SDK: the SDK's own shapes stay in the
 * composition file, so the adapter is testable without a model, a network or a disk.
 */

/** What the Host must supply before a Run can start. The adapter reads, never stores. */
export interface PrologueModelConfiguration {
  protocol: string;
  endpoint: string;
  model: string;
  /** Opaque credential reference. The adapter never sees the secret itself. */
  credential_ref: string;
  /** The model's configured context window. Absent means unknown; the runtime default then applies. */
  context_tokens?: number;
  /**
   * Prompt cache mode for this Run. Absent is `off`, and `off` must behave
   * exactly as if caching did not exist — no field is sent at all.
   */
  prompt_cache?: "off" | "best-effort" | "required";
  /** The model thinks before answering. Absent means off, and no thinking field is sent. */
  thinking?: "adaptive";
  /** The person marked this model as taking a reasoning effort; only then may a round choose one. */
  reasoning_effort?: true;
  /** What the model settings say about seeing images. Absent means unknown — never guessed. */
  vision?: boolean;
}

export interface PrologueAdapterPorts {
  /** The current model configuration, or null when the user has not set one. */
  modelConfiguration(selection?: AgentStartRequest["model_selection"]): Promise<PrologueModelConfiguration | null>;
  /** Why the Host held the run's latest ending, in the person's words (the runtime's event does not say), taken once. */
  stopHeld?(runId: string): { target: string; summary: string } | undefined;
  /** True when the run was held for only saying what it would do, and called nothing after its one continuation. */
  endedOnPromise?(runId: string, sessionId: string): boolean;
  /** Project actual SDK Context receipts into the App's existing memory ledger. Never a model tool. */
  memoryUsage?(receipt: AgentMemoryUseReceipt): void | Promise<void>;
}

export interface PrologueRunPort {
  ref: { id: string };
  subscribe(listener: (event: PrologueEvent) => void): () => void;
  cancel(): Promise<void>;
}

export interface PrologueControlPort extends RoundInputs {
  state: PrologueControlState;
  stop(reason: "stopped" | "cancelled"): void | Promise<void>;
  /** Why the Host itself stopped this round, in the person's words; absent when the person or the runtime stopped it. */ readonly stopReason?: string;
  pause(): void;
  resume(): void;
  /** Revalidate the original invocation after model-selection waits. */ beforeModelSwitch?(): Promise<void>;
  /** Later model calls of this Run go to this target, from its next model boundary. Absent where the runtime cannot. */
  switchModel?(target: Pick<PrologueModelConfiguration, "protocol" | "endpoint" | "model" | "credential_ref">, beforeAccept: () => void): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface PrologueStartInput {
  /** Recheck original activation immediately before dispatch; never persisted. */
  beforeStart?: AgentStartExecution["beforeStart"];
  assertBeforeStart?: AgentStartExecution["assertBeforeStart"];
  beforeDispatch?: AgentStartExecution["beforeDispatch"];
  actions?: NonNullable<AgentStartRequest["role"]>["actions"];
  action_gateway?: NonNullable<AgentStartRequest["role"]>["action_gateway"];
  subagent_workspaces?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSubagentWorkspace[];
  subagents?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentFrozenSubagentRole[];
  /** Host provenance, persisted before execution; never credentials or event history. */
  original_input?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentOriginalInput;
  provenance: { frozen: AgentRunView["frozen"]; started_at: string };
  session_id: string;
  /** Authorized root this Run may touch, already resolved by the Host. `business`: no root, the App's actions only. */
  workspace?: "required" | "none" | "business";
  root_path?: string;
  model: PrologueModelConfiguration;
  /** Character frozen from the Plugin's own role declaration. */
  character: {
    id: string;
    version: number;
    name: string;
    /** Composed prompt bodies. The composition stages them as a resource. */
    instructions: string;
    tools: string[];
  };
  compaction?: { prompt: string; above_tokens: number }; ending_review?: { prompt: string };
  task: string;
  /** Memories the Host chose for this run; the runtime re-reads each and injects it as data. */
  memory?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory;
  text_materials?: readonly AgentTextMaterial[];
  /** Images shown to the model in this Run (runtime resource references). */
  image_materials?: readonly AgentImageMaterial[];
  skills?: readonly AgentSkillDefinition[];
  mcp_tools?: readonly AgentMcpToolRef[];
  mcp_sources?: readonly AgentMcpSourceRef[];
  /** Read-only work never asks to write; the Host decides this, not the model. */
  mode: "plan" | "build";
  /** `digest`: the task carries earlier rounds; do not replay the session's verbatim history. */
  history?: "digest";
  /** The project work item this round waited as; it takes that item over. */
  queued_work_id?: string;
  /** The supplements waiting in the session that this round takes (agent-inputs). */ queued?: import("@molis-ai/molis-work-contracts/services/agent-inputs").AgentQueuedInputs;
  /** The session's name as the person sees it. */
  session_title?: string;
  /** `false`: no side panel browser for this round. */
  browser?: false;
}

/** Host observation times only; the SDK ledger owns content and execution state. */
export interface PrologueRunTiming {
  turns: Array<{ turn_id: string; at: string | null }>;
  activity: Array<{ call_id: string; at: string | null }>;
  ended_at: string | null;
}

export interface PrologueRuntimePort {
  /** The SDK path really runs with no authorized root and no tools. */
  workspaceNone?: boolean;
  /** The SDK runs App-tools work (`workspace: "app"`): no root, the session pack's actions and root-free tools. */
  workspaceBusiness?: boolean;
  actionTools?: boolean;
  /** The window the runtime packs against when a model states none; a configured window is capped by it. */
  defaultContextWindowTokens?: number;
  readStepBoard?(run: AgentRunRef): Promise<AgentRunView["step_board"]>;
  subagents?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSubagentsCapability;
  projectWork?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentProjectWorkCapability;
  messages?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSessionMessagesCapability;
  collaboration?: import("./prologue-plan-steps.js").PlanCollaborationPort;
  /** The session's queue for the next round; absent where the runtime keeps none. */ queue?: SessionQueue;
  background?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentBackgroundCapability;
  recovery?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecoveryCapability;
  /** The runtime's durable local queue for timed work. */
  schedule?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentScheduleCapability;
  /** Prologue Memory, scope by scope. */
  memory?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryCapability;
  /** Documents parsed by the runtime's own parsers. */
  documents?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentDocumentCapability;
  checkpoints?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentCheckpointsCapability;
  skillLibrary?: AgentSkillLibrary;
  mcpLibrary?: AgentMcpLibrary;
  saveRunTiming?(run: AgentRunRef, timing: PrologueRunTiming): Promise<void>;
  /** This runtime prepares selected bounded text methods through SDK public APIs. */
  inlineMethods?: boolean;
  /** Images taken in by this runtime can be attached to a Run's model calls. */
  imageAttachments?: boolean;
  /** Node composition actually supplies a cancellable SDK ContextCompactor. */
  compaction?: boolean;
  /** null only when the original owner confirms the question was answered. */
  readPendingQuestion?(run: AgentRunRef, pendingId: string, revision: number): Promise<AgentPendingQuestion | null>;
  /** Current original SDK approval facts, observed without answering or dispatching anything. */
  unexecutedApprovalCall?(run: AgentRunRef, waiting: import("./prologue-stream.js").PrologueApprovalWaiting): string | undefined;
  readCommandOutput?(sessionId: string, ref: AgentCommandOutputRef): Promise<AgentCommandOutput>;
  sessions: {
    capture?(sessionId: string): () => void;
    assertReadable?(sessionId: string): Promise<void>;
    lifecycle?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSessionLifecycle;
    create(input: AgentCreateSessionRequest, execution?: AgentStartExecution): Promise<{ ref: { id: string } }>;
    originalInput?(sessionId: string, input: Pick<AgentStartRequest, "original_input" | "continued_from">): Promise<import("@molis-ai/molis-work-contracts/services/agent-host").AgentOriginalInput | undefined>;
    readOriginalInput?: AgentRuntimeAdapter["readOriginalInput"];
    locateInput?(sessionId: string, inputId: string): Promise<SupplementaryLocation | undefined>;
    restore?(sessionId: string): Promise<PrologueRestoredSession | undefined>;
    /** Same owner/recovery checks as restore, without restoring historical controls or retaining transcripts. */
    readStatus?(sessionId: string): Promise<{
      owner: AgentSessionView["owner"];
      recovery?: AgentSessionView["recovery"];
      latest?: PrologueRestoredSession["runs"][number];
      planned?: AgentRunRef;
    } | undefined>;
    /** Supplements waiting for the next round; undefined when unreadable. */ queued?(sessionId: string): Promise<import("@molis-ai/molis-work-contracts/services/agent-inputs").AgentQueuedInput[] | undefined>;
  };
  startAgentRun(input: PrologueStartInput): Promise<{
    memory?: PrologueRunMemoryPort;
    run: PrologueRunPort;
    control: PrologueControlPort;
  } & RoundDesk>;
  shutdown(): Promise<unknown>;
}

export interface PrologueRestoredSession {
  workspace?: "required" | "none" | "business";
  title: string;
  owner: AgentSessionView["owner"];
  recovery?: AgentSessionView["recovery"];
  runs: Array<{
    ref: AgentRunRef;
    frozen: AgentRunView["frozen"];
    started_at: string;
    task: string;
    original_input?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentOriginalInput;
    memory_context?: Pick<AgentRecalledMemory, "consumer" | "usage"> & Partial<Pick<AgentRecalledMemory, "class_restrictions" | "current_scene">>;
    stop_intent?: "stopped" | "cancelled";
    /** Why the Host stopped this run itself, when it did. */ stop_reason?: string;
    /** The runtime holds this run as finished (sealed), whatever its saved progress shows. */
    terminal?: boolean;
    timing?: PrologueRunTiming;
    original_questions?: Array<{ pending_id: string; pending_revision: number; kind: string; why: string }>;
    /** May be a durable incomplete prefix. Only an actual terminal event proves an ended Run. */
    events?: readonly PrologueEvent[];
  } & RoundDesk>;
}

export interface PrologueAdapterOptions extends PrologueAdapterPorts {
  runtime: PrologueRuntimePort;
  providerVersion?: string;
  /**
   * The bridge that puts this Runtime's pending effects in front of the user.
   *
   * Attaching it is what makes writes and commands honestly supported: with it,
   * every effect stops at the Host's review queue and waits for a decision.
   * Without it those capabilities stay `unsupported`, because a Run could
   * otherwise write with no recorded approval.
   */
  approvals?: PrologueApprovalBridge;
  /** Delivers an answer to one pending question the Run is stopped on; `queued` when the Run was parked and the answer waits for the session's next round. */
  answerPending?(run: AgentRunRef, answer: Extract<AgentRunControl, { kind: "answer" }>): Promise<"delivered" | "queued">;
  /**
   * Narrows the matrix further. Writes and commands stay off until the
   * approval bridge is attached for this Runtime.
   */
  capabilities?: Partial<AgentRuntimeCapabilityMatrix>;
  now?: () => Date;
}
