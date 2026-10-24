/**
 * Memory and documents through the Agent Host's runtime: part of the `services/agent-host` contract (re-exported there),
 * declared in their own file.
 */
import type { MemoryClassRestriction } from "./memory.js";
import type { AgentMemoryFormationInput, AgentMemoryFormationResult } from "./agent-host-memory-formation.js";

/** One remembered item in the runtime's memory store (Prologue Memory), in one scope and owner. */
export interface AgentMemoryEntry {
  memory_id: string;
  scope: "user" | "project" | "character";
  owner: string;
  text: string;
  /** Where it came from, as recorded when it was written. */
  origin: string;
  tags: string[];
  version: number;
  /** Bounded structured facts kept on the entry (Prologue validates the shape and size). */
  meta: AgentMemoryMeta;
  /** Kept but never recalled (switched off, or what it rests on is gone). */
  paused?: { reason: string; at_ms: number };
  disabled?: { reason: string; at_ms: number };
  tombstoned: boolean;
  key?: { domain: string; key: string };
  /** 0 for entries written before the runtime kept times. */
  created_at_ms: number;
  updated_at_ms: number;
}

/** What the platform memory keeps on an entry. Text is not repeated here. */
export interface AgentMemoryMeta {
  classification?: { scenes: string[]; lifecycle: string; extra?: Record<string, string[]> };
  session_ref?: { kind: "session"; id: string; revision: number };
  kind?: string;
  source?: string;
  basis?: "explicit" | "repeated" | "inferred";
  applies_when?: { plugins?: string[]; object_kinds?: string[]; goals?: string[]; task?: string; from_ms?: number; until_ms?: number };
  evidence?: Array<{ kind: string; text?: string; ref?: string; at_ms?: number }>;
  expires_at_ms?: number;
  /** Who approved it: the person, or a Host policy at a version. Candidates settle this themselves. */
  approved_by?: { by: "person" } | { by: "policy"; policy: string; version: number };
  /** A plugin's own memory. */
  namespace?: string;
}

/** A candidate waiting for the person (Prologue's persistent candidate box). */
export interface AgentMemoryCandidateEntry {
  candidate_id: string;
  version: number;
  sources?: AgentMemorySourceIdentity[];
  replacement?: { memory_id: string; expected_version: number };
  suggested_basis?: "explicit" | "inferred";
  scope: AgentMemoryEntry["scope"];
  owner: string;
  text: string;
  origin: string;
  tags: string[];
  meta: AgentMemoryMeta;
  state: "pending" | "accepted" | "promoted" | "discarded" | "expired" | "cancelled";
  created_at_ms: number;
  settled_at_ms?: number;
  memory_id?: string;
}

/** A memory the Host chose for one run, by the Prologue scope and owner it lives in. */
export interface AgentPinnedMemory { scope: "user" | "project" | "character"; owner: string; memory_id: string; version?: number }

/** App interpretation versions and exact effective restrictions captured by the Host for one Run. */
export interface AgentMemoryClassPolicy {
  readonly policy_version: 2;
  readonly taxonomy_version: 1;
  readonly personal: readonly MemoryClassRestriction[];
  readonly project: readonly MemoryClassRestriction[];
}

/** App-owned reading recipe. Selection, current authorization and final token accounting belong to the SDK. */
export interface AgentRecalledMemory {
  readonly class_restrictions: AgentMemoryClassPolicy;
  /** Only explicitly selected resident references; initial Molis policy keeps this empty. */
  pinned: AgentPinnedMemory[];
  consumer: string;
  current_scene: string;
  scopes: Array<{ scope: "user" | "project" | "character"; owner: string }>;
  task: boolean;
  skip: boolean;
  budget_tokens: number;
  budget_chars: number;
  /** Trusted applicability facts, independently of model/search query input. */
  facts?: { plugins?: string[]; object_kinds?: string[]; goals?: string[] };
  /** Host display provenance, persisted with the attempt and never sent as model input. */
  usage?: { title: string; work_id?: string };
  /** App ledger correlation only; SDK per-retrieval/per-request receipts remain distinct. */
  receipt_id?: string;
}

/** What a run really took from memory, from the Runtime's own event: references and versions only. */
export interface AgentMemoryRecallFact {
  method: "pinned" | "recall";
  injected: Array<{ memory_id: string; version: number }>;
  omitted: Array<{ memory_id: string; version: number }>;
  /** Named, but deleted, paused or expired by the time the run started. */
  unavailable: string[];
  /** Retrieved/prepared references are not proof that a Provider received them. Older records may lack these facts. */
  selected?: Array<{ memory_id: string; version: number }>;
  retrievals?: Array<{ receipt_id: string; outcome: "ready" | "none" | "skip" | "unavailable" | "failed" | "timeout" | "cancelled"; error_code?: string }>;
  /** Latest disposition of each prepared model call, measured with its complete memory wrapper. */
  contexts?: Array<{ call_id: string; status: "prepared" | "not-dispatched" | "dispatched-or-unknown" | "response-observed";
    tokens: number; budget_tokens: number; basis: "conservative-estimate" | "provider-reported";
    references: Array<{ receipt_id: string; memory_id: string; version: number }>;
    parts: Array<{ index: number; tokens: number; form: "entry" | "excerpt" | "summary" }> }>;
  /** The Run facts remain available when the App's recent-reference projection could not be saved. */
  recording_error?: "memory.receipt_unrecorded";
}

/** A body-free projection from an owned Run, never a model/Action-supplied command. */
export interface AgentMemoryUseReceipt {
  run: { session_id: string; run_id: string };
  owner: { actor_id?: string; project_id: string; plugin_id: string; install_id: string };
  /** Persisted round time, not a claim about the exact network-dispatch time. */
  started_at: string;
  consumer: string;
  usage?: AgentRecalledMemory["usage"];
  contexts: NonNullable<AgentMemoryRecallFact["contexts"]>;
}

/** A document parser the App supplies to the runtime (the SDK ships none): bounded text, or a failure — never empty text. */
export interface AgentDocumentParser {
  mediaTypes: readonly string[];
  parse(input: { bytes: Uint8Array; mediaType: string; maxChars: number }): Promise<{ text: string; pages?: number }>;
}

/** Documents the person brings, read through the runtime's own resources and parsers (Prologue `parseResource`). */
export interface AgentDocumentCapability {
  parse(input: { bytes: Uint8Array; name: string }): Promise<{ text: string; truncated: boolean; pages?: number }>;
  /**
   * An image taken in by the runtime (PNG, JPEG, GIF or WebP, recognised by its bytes) so a Run can show it to the
   * model. The reference holds while this runtime process lives.
   */
  intakeImage?(input: { bytes: Uint8Array; name: string }): Promise<{ resource: { id: string; revision: number }; media_type: string; byte_length: number }>;
  /** An image taken in earlier, read back for the person to look at again; null once this runtime no longer holds it. */
  readImage?(resource: { id: string; revision: number }): Promise<Uint8Array | null>;
}

/** Trusted per-call control, retained through each SDK storage commit. Never persisted or model input. */
export interface AgentMemoryExecutionControl {
  beforeEffect(): void | Promise<void>;
  assert_current(): void;
}

export interface AgentMemorySourceRef { event_id: string; version: string }
export interface AgentMemorySourceIdentity extends AgentMemorySourceRef {
  speaker: { kind: "person" | "app" | "model" | "tool"; id: string };
  derivation: "original" | "derived";
  occurred_at_ms: number;
  about?: AgentMemorySourceRef;
}

/** Ephemeral canonical source text supplied by its trusted owner, never a model claim. */
export interface AgentMemorySourceSnapshot extends AgentMemorySourceIdentity { text: string }
export interface AgentMemorySourceRequest {
  app_id: string;
  target: { scope: AgentMemoryEntry["scope"]; owner: string; namespace?: string };
  signal?: AbortSignal;
}

/** One original candidate decision. Policy version and candidate version are distinct. */
export interface AgentMemoryPromotionIdentity {
  operation_id: string;
  candidate: { candidate_id: string; version: number };
  policy: string;
  version: number;
}
export interface AgentMemoryPromotionRequest extends AgentMemoryPromotionIdentity {
  proposed: AgentMemoryCandidateEntry;
  sources: readonly AgentMemorySourceSnapshot[];
  desired: { kind: "create" | "replace"; change: AgentMemoryChange; target?: { memory_id: string; expected_version: number } };
  signal?: AbortSignal;
}
export interface AgentMemoryPromotionPreparation extends AgentMemoryPromotionIdentity {
  before?: AgentMemoryEntry;
  after: AgentMemoryEntry;
  signal?: AbortSignal;
}
export interface AgentMemoryPromotionApplied extends AgentMemoryPromotionIdentity {
  entry: AgentMemoryEntry;
  signal?: AbortSignal;
}
export interface AgentMemoryPromotionReceipt extends AgentMemoryPromotionIdentity {
  entry: { memory_id: string; version: number };
  change_id: string;
}
/** Current App policy plus its existing durable history/undo owner; no SDK-side journal. */
export interface AgentMemoryPromotion {
  policy: string;
  version: number;
  decide(caller: AgentMemoryCaller, request: AgentMemoryPromotionRequest): "promote" | "hold" | Promise<"promote" | "hold">;
  undo: {
    prepare(caller: AgentMemoryCaller, request: AgentMemoryPromotionPreparation): Promise<void>;
    record(caller: AgentMemoryCaller, request: AgentMemoryPromotionApplied): Promise<AgentMemoryPromotionReceipt>;
  };
}
/** Formal storage has committed; complete the original operation instead of starting another one. */
export interface AgentMemoryPromotionPendingError extends Error {
  readonly code: "agent.memory_promotion_record_pending";
  readonly operation_id: string;
  readonly committed: { memory_id: string; version: number };
}

/** Version and operation identity are conditions, never authority. Retry keeps the complete original command. */
export interface AgentMemoryMutation {
  expected_version: number;
  operation_id: string;
  signal?: AbortSignal;
}
export interface AgentMemoryChange { text: string; origin?: string; meta?: AgentMemoryMeta }
/** The actual maintenance command, checked before preparing App history; execution still rechecks authority. */
export type AgentMemoryPreviewMutation = { kind: "update"; change: AgentMemoryChange }
  | { kind: "pause" | "disable"; reason: string } | { kind: "resume" | "remove" };
/** Supplied only by trusted App/Host code, independently of business/model input. */
export interface AgentMemoryCaller {
  /** Set only by the trusted Run frame or its controlled Memory selector, never query input. */
  readonly run_explicit?: true;
  /** Original Run policy, supplied by Host rather than query input. */
  readonly class_restrictions?: AgentMemoryClassPolicy;
  actor_id: string;
  character_id?: string;
  project_id: string | null;
  consumer: string;
  plugin_id?: string | null;
  person?: boolean;
  session_id?: string;
  current_scene?: string;
  /** Host-owned source use, never model input or an authorization grant. Absent requires completed inputs. */
  source_use?: "explicit" | "learning";
  /** Host-frozen applicability identifiers; never taken from a recall query. */
  facts?: AgentRecalledMemory["facts"];
  purpose: "management" | "task";
}
export interface AgentMemoryDecisionReceipt {
  outcome: "closed" | "needs-reconcile";
  future_commit: "blocked" | "unknown";
  past_commit: "committed" | "not-committed" | "unknown";
  candidate: { candidate_id: string; version: number };
  target: { memory_id: string; observed_version?: number; state: "present" | "cleared" | "unknown" };
  operation_id: string;
  decision_operation_id: string;
}
export interface AgentMemoryScopePreview {
  count: number;
  fingerprint: string;
  operation_id: string;
  items: Array<{ memory_id: string; version: number }>;
  /** Fixed SDK purge decision, not permission; it carries no memory content. */
  decision: { version: 1; binding: string; scope: AgentMemoryEntry["scope"]; owner: string;
    items: readonly { ref: { kind: "memory"; id: string; revision: 1 }; expectedVersion: number;
      operationId: string; mutation: { kind: "purge" } }[] };
}
export interface AgentMemoryClearResult {
  items: Array<{ memory_id: string; outcome: "completed" | "already-absent" | "conflict" | "not-executed" | "unknown"; version?: number }>;
}
/** Query permission is distinct from task reads. Owner is supplied by the trusted App scope resolver. */
export interface AgentMemoryPageQuery {
  scope: AgentMemoryEntry["scope"];
  owner: string;
  filter?: { namespace?: string | null; scenes?: readonly string[]; kinds?: readonly string[]; lifecycles?: readonly string[];
    extra?: Readonly<Record<string, readonly string[]>>; sources?: readonly string[]; states?: readonly ("active" | "paused" | "disabled")[];
    expired?: boolean; tombstone?: boolean };
  limit?: number;
  scan_limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}
export interface AgentMemoryPage {
  items: AgentMemoryEntry[];
  cursor?: string;
  exhausted: boolean;
  stopped: "end" | "limit" | "scan-limit" | "unknown";
  total: { kind: "exact"; value: number } | { kind: "unknown" };
  scanned: number | "unknown";
  cost: { directory_entries: number | "unknown"; directory_enumerations: number | "unknown";
    directory_traversal: "full" | "bounded" | "unknown"; metadata_reads: number | "unknown"; body_reads: number | "unknown" };
}
type AgentMemoryLocation = { scope: AgentMemoryEntry["scope"]; owner: string; memory_id: string };
type AgentCandidateLocation = { scope: AgentMemoryEntry["scope"]; owner: string; candidate_id: string };

/** One SDK owner, with an immutable caller binding and current Host authority before effects. */
export interface AgentMemoryCapability {
  withCaller(caller: AgentMemoryCaller): AgentMemoryCapability;
  withExecution?(control: AgentMemoryExecutionControl): AgentMemoryCapability;
  list(scope: AgentMemoryEntry["scope"], owner: string): Promise<AgentMemoryEntry[]>;
  page(input: AgentMemoryPageQuery): Promise<AgentMemoryPage>;
  /** Append maps operation_id to SDK idempotencyKey; it has no synthetic expected version. */
  write(input: { scope: AgentMemoryEntry["scope"]; owner: string; text: string; origin: string; tags?: string[]; meta?: AgentMemoryMeta; operation_id: string; signal?: AbortSignal }): Promise<AgentMemoryEntry>;
  update(input: AgentMemoryLocation & AgentMemoryMutation & { change: AgentMemoryChange }): Promise<AgentMemoryEntry>;
  setMeta(input: AgentMemoryLocation & AgentMemoryMutation & { meta: AgentMemoryMeta }): Promise<AgentMemoryEntry>;
  pause(input: AgentMemoryLocation & AgentMemoryMutation & { reason: string }): Promise<AgentMemoryEntry>;
  disable(input: AgentMemoryLocation & AgentMemoryMutation & { reason: string }): Promise<AgentMemoryEntry>;
  resume(input: AgentMemoryLocation & AgentMemoryMutation): Promise<AgentMemoryEntry>;
  /** Explicit expiry renewal preserves the canonical identity, metadata and raw state. */
  renew(input: AgentMemoryLocation & AgentMemoryMutation & { expires_at_ms: number }): Promise<AgentMemoryEntry>;
  previewMutation(input: AgentMemoryLocation & AgentMemoryMutation & { mutation: AgentMemoryPreviewMutation }): Promise<void>;
  /** Logical removal preserves the original SDK operation receipt for maintenance reconciliation. */
  tombstone(input: AgentMemoryLocation & AgentMemoryMutation): Promise<AgentMemoryEntry>;
  remove(input: AgentMemoryLocation & AgentMemoryMutation): Promise<void>;
  recall(input: { scope: AgentMemoryEntry["scope"]; owner: string; keywords?: string[]; text?: string; kinds?: string[]; limit?: number }): Promise<Array<{ entry: AgentMemoryEntry; score: number }>>;
  candidates: AgentMemoryCandidateCapability;
  screen?(text: string): Promise<{ hold: boolean; reasons: string[]; redacted: string }>;
  previewScope(scope: AgentMemoryEntry["scope"], owner: string): Promise<AgentMemoryScopePreview>;
  clearScope(input: { scope: AgentMemoryEntry["scope"]; owner: string; preview: AgentMemoryScopePreview; operation_id: string; signal?: AbortSignal }): Promise<AgentMemoryClearResult>;
}

export interface AgentMemoryCandidateCapability {
  form(input: AgentMemoryFormationInput): Promise<AgentMemoryFormationResult>;
  propose(input: { scope: AgentMemoryEntry["scope"]; owner: string; text: string; origin: string; tags?: string[]; meta?: AgentMemoryMeta; sources?: AgentMemorySourceRef[]; expected_version: 0; operation_id: string; signal?: AbortSignal }): Promise<AgentMemoryCandidateEntry>;
  list(scope: AgentMemoryEntry["scope"], owner: string): Promise<AgentMemoryCandidateEntry[]>;
  /** Missing is distinct from denied; the original scope and owner remain binding. */
  get(input: AgentCandidateLocation & { signal?: AbortSignal }): Promise<AgentMemoryCandidateEntry | undefined>;
  accept(input: AgentCandidateLocation & AgentMemoryMutation & { text?: string; origin?: string; meta?: AgentMemoryMeta }): Promise<AgentMemoryEntry>;
  promote(input: AgentCandidateLocation & AgentMemoryMutation & { policy: string; version: number; origin?: string; meta?: AgentMemoryMeta }): Promise<AgentMemoryEntry>;
  /** The SDK changes the formal text/meta and then reconciles the candidate; the App never pre-updates it. */
  settleInto(input: AgentCandidateLocation & { candidate_expected_version: number; operation_id: string; signal?: AbortSignal;
    target: { memory_id: string; expected_version: number; change: AgentMemoryChange };
    by: { by: "person" } | { by: "policy"; policy: string; version: number } }): Promise<AgentMemoryEntry>;
  discard(input: AgentCandidateLocation & AgentMemoryMutation): Promise<AgentMemoryCandidateEntry>;
  expire(input: AgentCandidateLocation & AgentMemoryMutation): Promise<AgentMemoryCandidateEntry>;
  reconcileDecision(input: AgentCandidateLocation & AgentMemoryMutation): Promise<AgentMemoryDecisionReceipt>;
  purge(input: AgentCandidateLocation & AgentMemoryMutation): Promise<void>;
}
