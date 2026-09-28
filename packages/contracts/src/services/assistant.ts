import type { ContractDescriptor } from "../platform/package.js";
import type { AgentPendingQuestion, AgentRunPhase, AgentRunUsage, AgentTurnView } from "./agent-host.js";

/**
 * The system Assistant: one personal assistant, many independent pieces of work.
 *
 * A work is the Assistant's own fact — its scope, title, Prologue session and the rounds it started. What was said and
 * done lives in the Prologue session; business results stay with their owning module. Plugins take part through the
 * context and capability contracts, never by the Assistant knowing them one by one.
 */
export const servicesAssistantContract = {
  contractId: "io.molis.work.service.assistant.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/system-assistant/spec.md",
} as const satisfies ContractDescriptor;

/** The identity the Assistant's sessions are owned by. It is a system module, not an installed Plugin. */
export const ASSISTANT_PLUGIN_ID = "io.molis.work.assistant";
export const ASSISTANT_INSTALL_ID = "system";
/**
 * Session owner for personal work. The Home is the person's own scope — the one the action service already calls
 * `home` — not a project made up to satisfy a project-shaped check.
 */
export const ASSISTANT_PERSONAL_OWNER = "home";

/** Where a work belongs. Switching pages never changes it; a new scope is a new work or an explicit handover. */
export type AssistantScope =
  | { kind: "personal" }
  | { kind: "project"; project_id: string };

/** What a work is doing, as the person can act on it. Derived from the real run, never from model prose. */
export type AssistantWorkState =
  | "idle"
  | "running"
  | "waiting-input"
  | "waiting-review"
  | "paused"
  | "completed"
  | "failed"
  | "stopped"
  | "needs-check";

/** The surface a work, message or material came from. Data about the screen, never an instruction. */
export interface AssistantSurfaceRef {
  /** e.g. `pages`, `coding`, `home`. */
  surface: string;
  plugin_id?: string;
  /** What the person saw it called. */
  title?: string;
}

/**
 * How a surface tells the Assistant what the person is looking at: the root element of a plugin surface carries this
 * attribute with an `AssistantSurfaceContext` as JSON, and keeps it current. The Assistant reads it when the person
 * focuses the composer; nothing is sent until they send, and every item stays visible and removable before that.
 */
export const ASSISTANT_CONTEXT_ATTRIBUTE = "data-assistant-context";

export interface AssistantSurfaceContext {
  plugin_id: string;
  /** What the person calls this surface, e.g. "Pages". */
  surface_title?: string;
  object?: AssistantObjectRef;
  /** The object has edits not saved yet. */
  unsaved?: boolean;
  /** The unsaved content itself, bounded, when the surface can give it; it is a draft, never the saved version. */
  draft_text?: string;
  /** Starting points that fit this surface; choosing one only fills the input. */
  starters?: Array<{ label: string; prompt: string }>;
}

/** An object a surface shows, by its owner's identity and version. */
export interface AssistantObjectRef {
  kind: string;
  id: string;
  version?: string | number;
  title?: string;
}

/**
 * What the current surface says the person is looking at, captured when they send.
 *
 * Supplied by the page, so it is a claim about the screen: the Host passes it to the model as marked data and reads
 * objects again through their owners before acting on them.
 */
export interface AssistantContextSnapshot {
  source: AssistantSurfaceRef;
  object?: AssistantObjectRef;
  /** Selected text, bounded; `truncated` says it was cut. */
  selection?: { text: string; truncated?: boolean };
  /** The object has edits not yet saved: a selection or excerpt from it is a draft, not the saved version. */
  unsaved?: boolean;
  captured_at: string;
}

/** A material the person put into this message, or one the page offered and they kept. */
export interface AssistantMaterial {
  material_id: string;
  kind: "selection" | "object" | "text" | "file" | "image";
  title: string;
  /** True when the person added it themselves; false when it came from the current page and they left it in. */
  explicit: boolean;
  source?: AssistantSurfaceRef;
  object?: AssistantObjectRef;
  /** Verbatim text the model may read, bounded. */
  text?: string;
  /** From unsaved edits: the saved object says something else. */
  draft?: boolean;
}

export interface AssistantWork {
  work_id: string;
  revision: number;
  title: string;
  scope: AssistantScope;
  /** How the person names the scope: their project's name, or absent for personal work. */
  scope_title?: string;
  /** Where the person started it. */
  origin: AssistantSurfaceRef | null;
  state: AssistantWorkState;
  /** The Prologue session carrying this work; null until its first round. */
  session_id: string | null;
  /** Unsent text for this work. Never sent, never read by a model. */
  draft: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
}

/** One thing the round did, in the person's terms: looked something up, read, changed, asked. Never the raw tool log. */
export interface AssistantActivity {
  call_id: string;
  /** `lookup` | `read` | `change` | `ask` | `todo`, or another tool's own name. */
  verb: string;
  /** What it acted on: the capability's provider and title, or the words it searched for. */
  target: string;
  state: "started" | "completed" | "failed" | "unknown";
  /** For a read or change: the capability it used, so the surface that owns that data can refresh. */
  capability_id?: string;
  /** Why it did not happen, when that is known: not authorized, declined by the person. */
  reason?: "not-authorized" | "declined";
  /** For a failure, what the owner said, bounded; data about the failure, never an instruction. */
  detail?: string;
  sequence?: number;
}

/** One round the person started, with the run's own facts. */
export interface AssistantRound {
  run_id: string;
  /** What the person sent this round. */
  text: string;
  materials: Array<Pick<AssistantMaterial, "material_id" | "kind" | "title" | "explicit" | "draft" | "source" | "object">>;
  context: AssistantContextSnapshot | null;
  started_at: string;
  phase: AgentRunPhase | "unknown";
  turns: AgentTurnView[];
  activity: AssistantActivity[];
  awaiting_input: readonly AgentPendingQuestion[];
  usage?: AgentRunUsage;
  stop_reason?: string;
  ended_at: string | null;
}

/**
 * A suggestion the person can run with one click. It carries the exact capability and prepared input; the click is
 * their choice of exactly what the card shows, and it runs at most once.
 */
export interface AssistantCard {
  card_id: string;
  revision: number;
  /** Which round proposed it. */
  run_id: string | null;
  title: string;
  summary: string;
  provider: string;
  capability_title: string;
  /** So the surface that owns the data can refresh once it has run. */
  capability_id: string;
  effect: "read" | "write" | "irreversible";
  /** The prepared input, field by field as the person reads it; `editable` ones can be changed before running. */
  fields: Array<{ key: string; label: string; value: string; editable: boolean }>;
  missing: Array<{ field: string; question: string }>;
  status: "ready" | "needs-input" | "running" | "done" | "failed" | "unknown" | "stale" | "dismissed";
  /** What happened, or why not, in the owner's words. */
  outcome?: string;
  created_at: string;
  updated_at: string;
}

/** An effect held for the person's decision in this work, exactly as the Runtime will execute it. */
export interface AssistantPendingReview {
  review_id: string;
  run_id: string | null;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  requested_at: string;
  expires_at: string | null;
}

export interface AssistantWorkView {
  work: AssistantWork;
  rounds: AssistantRound[];
  reviews: AssistantPendingReview[];
  cards: AssistantCard[];
  /** Why the work cannot run now, when it cannot (no model, a busy session…), with one next step. */
  problem?: { message: string; action?: string };
}

/** An interrupted round, as the runtime's own receipts show it: what happened, what did not, what is unknown. */
export interface AssistantRecovery {
  blockers: string[];
  rounds: Array<{
    run_id: string;
    version: number;
    can_close: boolean;
    blockers: string[];
    operations: Array<{ summary: string; outcome: "completed" | "failed" | "not-dispatched" | "unknown" }>;
  }>;
}

export interface AssistantSendInput {
  /** Omitted starts a new work. */
  work_id?: string;
  /** Required for a new work; ignored for an existing one, whose scope never changes. */
  scope?: AssistantScope;
  text: string;
  context?: AssistantContextSnapshot;
  materials?: AssistantMaterial[];
  /** One per press of Send. A repeat returns the first outcome and starts nothing. */
  request_id: string;
}

/** What one Send did: which work, and whether it started a round, reached a running one, or answered its question. */
export interface AssistantSendResult {
  work: AssistantWork;
  outcome: "started" | "steered" | "answered" | "repeated";
  run_id?: string;
}

export type AssistantControl =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" };
