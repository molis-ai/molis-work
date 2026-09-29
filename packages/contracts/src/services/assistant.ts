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

/**
 * Both directions of "the other entry changed this", as window events on the same page:
 * - the Assistant raises `ASSISTANT_EFFECT_EVENT` after it changed something through a plugin's capability, so the
 *   plugin's surface re-reads that object (keeping the person's unsaved edits);
 * - a surface raises `ASSISTANT_SURFACE_CHANGED_EVENT` after the person changed an object the Assistant may be showing,
 *   e.g. a Coding session's mode or a new round from Coding's own input, so the Assistant re-reads its work.
 * Neither carries the change itself; each side reads its owner again.
 */
export const ASSISTANT_EFFECT_EVENT = "molis:assistant-effect";
export const ASSISTANT_SURFACE_CHANGED_EVENT = "molis:assistant-surface-changed";

/**
 * A plugin page tells the Assistant something (spec 8.3). What happens depends on the purpose, never on wording:
 * - `background`: context for the next round the person starts here; nothing is sent, no model runs.
 * - `change`: an object changed; works that relate to it read it again. Not a request.
 * - `suggest`: a request the person may send — offered to put into the input, never sent by itself.
 * - `delegate`: the person just asked the page to hand this to the Assistant. It starts only right after a real user
 *   gesture on the page; otherwise it becomes a suggestion. A repeat of the same `message_id` starts nothing.
 * - `reply`: a plugin hands a result back to a work; the object is linked as that work's result (read from its owner).
 * A plugin cannot claim the person's consent in the message itself.
 */
export const ASSISTANT_MESSAGE_EVENT = "molis:assistant-message";
export type AssistantMessagePurpose = "background" | "change" | "suggest" | "delegate" | "reply";
export interface AssistantPluginMessage {
  message_id: string;
  purpose: AssistantMessagePurpose;
  /** The surface speaking, as the person knows it. */
  source: { surface: string; title?: string };
  /** The object it concerns (for change, reply, and what a suggestion or delegation is about). */
  object?: { kind: string; id: string; title?: string; version?: number | string | null };
  /** For suggest/delegate: the request in the person's words. For background: what the page shows now. */
  text?: string;
  /** Text the request brings along (at most 4, each at most 20000 characters). */
  materials?: Array<{ title: string; text: string }>;
  /** For reply (and to continue a work on delegate): the work it belongs to. */
  work_id?: string;
}

export interface AssistantEffectDetail {
  work_id: string;
  /** The capability it ran, e.g. `pages.docs.update`; surfaces match on their own prefix. */
  capability_id: string;
  /** For work carried by a plugin's own session. */
  session_id?: string | null;
}

export interface AssistantSurfaceChangedDetail {
  plugin_id: string;
  object: AssistantObjectRef;
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
  kind: "selection" | "object" | "text" | "file" | "image" | "capability";
  title: string;
  /** For `capability`: the one the person picked with “/” to be used this round (its exact identity). */
  capability?: { capability_id: string; version: number; provider_id: string; title: string };
  /** True when the person added it themselves; false when it came from the current page and they left it in. */
  explicit: boolean;
  source?: AssistantSurfaceRef;
  object?: AssistantObjectRef;
  /** Verbatim text the model may read, bounded. */
  text?: string;
  /** From unsaved edits: the saved object says something else. */
  draft?: boolean;
}

/**
 * Who carries a work. The Assistant itself, or a plugin's own Agent: then the work is that plugin's session, driven
 * through the plugin's own actions, and its professional page shows the same session.
 */
export type AssistantExecutor =
  | { kind: "assistant" }
  | { kind: "coding"; title: string; session_id: string | null;
      /** The session's own next-round mode, shared with the Coding page: discuss, plan, edit, execute, review… */
      mode?: string };

export interface AssistantWork {
  work_id: string;
  executor: AssistantExecutor;
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
  /**
   * The Character the person chose to carry this work's rounds: an exact published version, in force from the next
   * round on. Absent means the Assistant itself. Only project work can have one (Characters are published per project).
   */
  character?: AssistantCharacter;
  /** Set on a work another work delegated: which one, and what it was asked to deliver. */
  delegated_by?: { work_id: string; title: string; acceptance: string };
}

/** An exact published Character version, as the person chose it. */
export interface AssistantCharacterRef { artifact_id: string; version: number }
export interface AssistantCharacter extends AssistantCharacterRef { title: string }

/** A Character the person may choose for project work, and whether it can run now (never swapped for another). */
export interface AssistantCharacterChoice { reference: AssistantCharacterRef; title: string; available: boolean; reason?: string }

/** One thing the round did, in the person's terms: looked something up, read, changed, asked. Never the raw tool log. */
export interface AssistantActivity {
  call_id: string;
  /**
   * `lookup` | `read` | `change` (business capabilities) | `ask` | `todo`; for a professional Agent's own tools
   * `file-read` | `file-list` | `file-search` | `file-change` | `command` | `command-output`; otherwise the tool's own name.
   */
  verb: string;
  /** What it acted on: the capability's provider and title, or the words it searched for. */
  target: string;
  state: "started" | "completed" | "failed" | "unknown";
  /** For a read or change: the capability it used, so the surface that owns that data can refresh. */
  capability_id?: string;
  /** Why it did not happen, when that is known: not authorized, declined by the person, stopped, or switched off / gone by the time it would run. */
  reason?: "not-authorized" | "declined" | "interrupted" | "unavailable";
  /** For a failure, what the owner said, bounded; data about the failure, never an instruction. */
  detail?: string;
  sequence?: number;
}

/** One round the person started, with the run's own facts. */
export interface AssistantRound {
  run_id: string;
  /** Who ran it: the Assistant, or the professional Agent the work was handed to. */
  executor?: "assistant" | "coding";
  /** The Character that really carried this round, frozen at its start; absent when the Assistant itself did. */
  character?: AssistantCharacter;
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
  /** What is held: a business change, a file edit, a command, an MCP call… The fields read accordingly. */
  kind: string;
  run_id: string | null;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  requested_at: string;
  expires_at: string | null;
}

/**
 * How a work relates to an object, as Context Ledger edges the Assistant owns. The object itself, its content and its
 * current revision stay with its owner; the edge keeps only the reference and the revision at the time.
 */
export const ASSISTANT_RELATIONS = {
  /** The object the work was started from. */
  origin: "assistant.work.origin",
  /** An object the person put into a round, at the revision it had then. */
  material: "assistant.work.material",
  /** An object the work created or changed, at the revision it produced. */
  result: "assistant.work.result",
  /** A professional Agent's session that carries (part of) the work, e.g. a Coding session. */
  session: "assistant.work.session",
} as const;
export type AssistantRelation = keyof typeof ASSISTANT_RELATIONS;

/**
 * An object a work is related to, read again from its owner: where it is now, and whether it changed since the work
 * last recorded it (the person edited it, something else did, or it is gone).
 */
export interface AssistantWorkObject {
  relation: AssistantRelation;
  subject: { kind: string; id: string };
  title: string;
  /** The revision the work recorded; null when it recorded only the identity. */
  recorded_revision: string | null;
  /** The owner's revision now; null when it cannot be read. */
  current_revision: string | null;
  /**
   * `current` — as recorded; `changed` — the owner has a newer revision (for a result: someone changed what the work
   * produced); `missing` — the owner no longer has it; `unavailable` — it cannot be read now (plugin off, no access).
   */
  state: "current" | "changed" | "missing" | "unavailable";
  recorded_at: string;
  /** Where the person opens it. */
  open?: { surface: string; id: string };
}

/** A work that relates to an object, for the object's own page ("this document belongs to …"). */
export interface AssistantRelatedWork {
  work_id: string;
  title: string;
  state: AssistantWorkState;
  relation: AssistantRelation;
  recorded_revision: string | null;
  updated_at: string;
}

export interface AssistantWorkView {
  work: AssistantWork;
  rounds: AssistantRound[];
  reviews: AssistantPendingReview[];
  cards: AssistantCard[];
  /** The objects this work started from, used, produced and handed to, as their owners have them now. */
  objects: AssistantWorkObject[];
  /** Sub-tasks this work handed to works of their own (its task board): each one's state and follow-ups. */
  delegated?: Array<{ work_id: string; title: string; state: AssistantWorkState; follow_ups: number }>;
  /** Timed rounds the person asked this work to run. */
  scheduled?: AssistantFollowUp[];
  /** Whether those timed rounds still run with the window closed (the runtime queue's own claim). */
  schedule_survives_close?: boolean;
  /** Changes still running at their owner when a round stopped or ran out of time, and what the owner finally did. */
  unsettled?: AssistantUnsettledChange[];
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
  /** For a new work: who carries it. An existing work keeps its executor. */
  executor?: "assistant" | "coding";
  /** For a new work carried by Coding: the mode of its first round. Later rounds use the session's own setting. */
  mode?: string;
  /** For a new work carried by Coding: continue this existing session (the one open on the Coding page) instead of a new one. */
  coding_session_id?: string;
  /** The Character to carry this and later rounds (null: the Assistant itself); omitted keeps the work's choice. */
  character?: AssistantCharacterRef | null;
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

/**
 * Hand a work to another agent and keep it one work: to Coding (in its project, with a note of what was agreed and
 * produced so far), or back to the Assistant (whose next round reads what Coding did). Only between rounds.
 */
export interface AssistantHandover {
  to: "coding" | "assistant";
  /** For Coding: the mode its first round runs in. */
  mode?: string;
}

export type AssistantControl =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" };

/** What one provider contributes for the Assistant (read from the action directory), and the gaps that limit it. */
export interface AssistantContribution {
  provider_id: string;
  title: string;
  plugin_id?: string;
  /** Actions offered to agents; how many only read; how many change something. */
  actions: number;
  reads: number;
  changes: number;
  /** Object kinds the Assistant can read back from their owner (a subject reader). */
  readable_kinds: string[];
  /** Changes that say which object they produced, so a work can keep a relation to it. */
  linked_changes: number;
  /** Takes part in global search. */
  searchable: boolean;
  gaps: Array<{ area: "context" | "results" | "capabilities"; text: string }>;
}

/**
 * Something about a work worth the person's attention, raised by the Host from what really happened — a round that
 * failed, a decision it waits on, a round that finished while they were elsewhere, a result a plugin handed back. It
 * never starts anything, so a notice cannot cause another notice.
 */
/** Something the person asked the Assistant to keep: personal (all their work) or one project's. */
export interface AssistantMemory {
  memory_id: string;
  scope: "personal" | "project";
  /** For a project memory: which project. */
  project_id?: string;
  text: string;
  /** Where it came from: the work, the date and the person's own words. */
  origin: string;
  /** Kept, but not used in work until switched on again (different from deleting it). */
  disabled: boolean;
}

/** What the Assistant may do with memory, set by the person; applied exactly as written. */
export interface AssistantMemoryPrefs {
  /** May keep what the person explicitly asks it to remember. It never learns from behaviour on its own. */
  form: boolean;
  /** Personal memories are used in work. */
  use_personal: boolean;
  /** A project's memories are used in that project's work. */
  use_project: boolean;
}

/** `material`: new items elsewhere (Feed, Inbox…) that share a Goal with the work — a light notice, merged per work. */
export type AssistantNoticeKind = "failed" | "needs-decision" | "completed" | "result" | "material";
export interface AssistantNotice {
  notice_id: string;
  kind: AssistantNoticeKind;
  work_id: string;
  work_title: string;
  text: string;
  created_at: string;
  /** Held by one of the person's rules while its condition holds (shown once it no longer does). */
  held?: { rule_id: string; reason: string };
}

/**
 * The person's own rules for when the Assistant may draw their attention. Evaluated by the Host exactly as written —
 * never guessed by a model. `quiet` holds notices while one of `surfaces` (plugin rail ids; empty = anywhere) is on
 * show; `pause` holds them until `until`. `except` still comes through (e.g. a failed round).
 */
export interface AssistantRule {
  rule_id: string;
  kind: "quiet" | "pause";
  surfaces: string[];
  except: AssistantNoticeKind[];
  /** When it ends (required for a pause; optional for a quiet rule). */
  until?: string;
  /** How the person put it, shown back to them. */
  label: string;
  enabled: boolean;
  created_at: string;
}
export type AssistantRuleInput = Pick<AssistantRule, "kind" | "surfaces" | "except" | "label"> & { until?: string; enabled?: boolean };

/**
 * A standing request the person gave a work: at a time (once, daily or weekly) the Assistant starts a round of it with
 * these words. It runs only while Molis Work runs on this computer; a time missed while it was not running is
 * reported, never replayed late.
 */
/**
 * A change the round had sent to its owner that had not answered when the round stopped or ran out of time. The Host
 * keeps listening: `pending` until the owner answers, then whether it happened. Never re-sent.
 */
export interface AssistantUnsettledChange {
  change_id: string;
  work_id: string;
  /** The capability as the person reads it: provider · title. */
  title: string;
  started_at: string;
  state: "pending" | "completed" | "failed" | "not-run";
  settled_at?: string;
  /** The owner's words for a failure, bounded. */
  detail?: string;
}

export interface AssistantFollowUp {
  followup_id: string;
  work_id: string;
  label: string;
  text: string;
  repeat: "none" | "daily" | "weekly";
  /** The next time it is due (ISO); absent once a one-time follow-up has run or been missed. */
  next_at?: string;
  time_zone: string;
  enabled: boolean;
  created_at: string;
  last?: { due_at: string; at: string; outcome: "started" | "missed" | "skipped" | "failed"; detail?: string };
}
