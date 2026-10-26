import type { AssistantCard, AssistantPreparedCard } from "./assistant-cards.js";
export type { AssistantCard, AssistantPreparedCard } from "./assistant-cards.js";
import type { AssistantActivity } from "./assistant-activity.js";
export type { AssistantActivity, AssistantActivityFailure } from "./assistant-activity.js";
import type { ContractDescriptor } from "../platform/package.js";
import type { AgentRetryWait, AgentRunPhase, AgentRunUsage, AgentRuntimeDiagnostics, AgentTurnView } from "./agent-host.js";
import type { AgentPendingQuestion, AgentQuestionReask } from "./agent-interaction.js";
import type { AgentInputSend, AgentQueuedInput } from "./agent-inputs.js";
import type { MemoryChange, MemoryScope } from "./memory.js";

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
  ssot: "specs/archive/system-assistant/spec.md",
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
  /** The surface speaking, as the person knows it; the shell writes it, with `plugin_id` from the frame, over a page's own. */
  source: { surface: string; title?: string; plugin_id?: string };
  /** The object it concerns (for change, reply, and what a suggestion or delegation is about). */
  object?: { kind: string; id: string; title?: string; version?: number | string | null };
  /** For suggest/delegate: the request in the person's words. For background: what the page shows now. */
  text?: string;
  /** Text the request brings along (at most 4, each at most 20000 characters). */
  materials?: Array<{ title: string; text: string }>;
  /** For reply (and to continue a work on delegate): the work it belongs to. */
  work_id?: string;
  /** For suggest, after a real user gesture on the page: an action the page already prepared exactly (the capability and
   * its full input), to be shown as a card in a work. It is checked against what the Assistant may use there now and runs
   * only when the person clicks it; no model round starts. Without a gesture it is an ordinary suggestion. */
  card?: AssistantPreparedCard;
  /** Suggest (PG-057): a comment thread under `object` to answer; only the person's press on 「让助理回复」 starts the reply. */
  thread?: { thread_id: string; message_id: string; draft?: { text: string; revision: string } };
}

/**
 * GET /api/assistant/works/:work_id/materials/:material_id — one material a round brought, with its text, for a preview.
 * The work view leaves texts out to stay small. `url`: where it came from, when it was a web page (to open it again).
 */
export interface AssistantMaterialText {
  material_id: string;
  kind: AssistantMaterial["kind"];
  title: string;
  text?: string;
  truncated?: boolean;
  url?: string;
  source?: AssistantSurfaceRef;
  object?: AssistantObjectRef;
  draft?: boolean;
}

/** POST /api/assistant/cards: the card a page prepared, placed in a work (the given one, or a new one in this scope). */
export interface AssistantPageCardInput {
  /** The page message's id: the same message places its card once. */
  message_id: string;
  source: { surface: string; title?: string };
  card: AssistantPreparedCard;
  /** An existing work in this scope; omitted starts a new work named after the card. */
  work_id?: string;
  /** For a new work; defaults to the current project, or personal work outside one. */
  scope?: AssistantScope;
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
  /**
   * Where something would be put in the object open on the left, as its owner page reported it (`SurfaceLanding` in
   * services/contextual), bounded. Sent only while that object goes with the Send and the person kept it on the strip. A
   * claim like the rest: the Host reads the object again from its owner first and drops the landing when it cannot.
   */
  landing?: AssistantLanding;
  captured_at: string;
}

/** The part of a landing a round is told: which object, where in it, and the text around that place. */
export interface AssistantLanding {
  plugin_id: string;
  object: { kind: string; id: string; title?: string };
  position: "cursor" | "selection" | "end" | "object";
  /** The headings above the place, outermost first. */
  heading_path?: string[];
  /** Bounded text just before and after the place; for `selection`, the text that is selected. */
  before?: string;
  after?: string;
  selected?: string;
}

/** A material the person put into this message, or one the page offered and they kept. */
export interface AssistantMaterial {
  material_id: string;
  kind: "selection" | "object" | "text" | "file" | "image" | "capability" | "method";
  title: string;
  /** For `capability`: the one the person picked with “/” to be used this round (its exact identity). */
  capability?: { capability_id: string; version: number; provider_id: string; title: string };
  /**
   * For an object the person picked: with “@” from the system search, the hit it came from; from the project knowledge
   * picker (specs/project-knowledge PMAT-17), the piece itself. Either is only a pointer: the Host checks it again with its
   * owner and reads the text itself before the round (a piece through `knowledge.read`, as the person).
   */
  reference?: { hit_id: string } | { subject: { kind: string; id: string } };
  /** For `method`: the method the person chose with “/” for this round; the Host gives its registered body. */
  method?: { method_id: string; version?: number; name?: string; plugin_title?: string };
  /** For `image`: the picture the person added, taken in by the runtime (only a reference; the bytes stay there). */
  image?: { resource_id: string; revision: number; media_type: string; byte_length: number };
  /** In a work's view: an image the runtime no longer holds (the app restarted); it cannot be shown or sent again. */
  expired?: boolean;
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
 * Who carries a work. The Assistant itself, or a plugin's own Agent: then the work is that plugin's session, driven through the
 * six actions of the work-executor protocol it publishes, and its own page shows the same session. The plugin is kept by `plugin_id`
 * and found again in the project's action directory at each call; if it is gone the call is refused, never moved to another.
 */
export type AssistantExecutor =
  | { kind: "assistant" }
  | { kind: "plugin"; plugin_id: string; title: string; session_id: string | null;
      /** The session's own next-round mode, shared with the plugin's page: one of the modes its `state` offers. */
      mode?: string };

/** Who the person picks to carry a new work, or to take over an existing one. */
export type AssistantExecutorChoice = { kind: "assistant" } | { kind: "plugin"; plugin_id: string };

/** A plugin that can carry a work in this project (`GET /api/assistant/executors`): the whole work-executor protocol, open to the local person. */
export interface AssistantExecutorOffer {
  plugin_id: string;
  title: string;
  modes: Array<{ id: string; title: string }>;
  default_mode: string;
  /** The subject kind of the sessions it opens: a page showing such an object can offer to continue it. */
  session_kind: string;
  /** The role actions whose effect the plugin's page hears of after a mode is set or a round starts. */
  capability_ids: { "session.update": string; "run.start": string };
  /** Why it cannot be chosen now, from its own state read; absent when it can. */
  problem?: string;
}

export interface AssistantWork {
  /** This work replies into an owner-held discussion; its scope cannot become global. */
  reply_target?: AssistantReplyTarget;
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
  /** `taken_back_at`: the person took this part back into the work that delegated it (it stopped; what it made stays). */
  delegated_by?: { work_id: string; title: string; acceptance: string; taken_back_at?: string };
  /** The person's cap on this work's tokens (input plus output, its sub-tasks included). Absent means no cap of its own. */
  budget_tokens?: number;
}

/** An exact published Character version, as the person chose it. */
export interface AssistantCharacterRef { artifact_id: string; version: number }
export interface AssistantCharacter extends AssistantCharacterRef { title: string }

/** A Character the person may choose for project work, and whether it can run now (never swapped for another). */
export interface AssistantCharacterChoice { reference: AssistantCharacterRef; title: string; available: boolean; reason?: string }

/** One round the person started, with the run's own facts. */
export interface AssistantRound {
  run_id: string;
  /** Who ran it: the Assistant, or the plugin's Agent the work was handed to. */
  executor?: "assistant" | "plugin";
  /** The Character that really carried this round, frozen at its start; absent when the Assistant itself did. */
  character?: AssistantCharacter;
  /** What the person sent this round. */
  text: string;
  /** Set when the Host wrote `text`, not the person: a timed round, or the round a work goes on in when its sub-tasks came back. */
  written_by?: "host";
  materials: Array<Pick<AssistantMaterial, "material_id" | "kind" | "title" | "explicit" | "draft" | "source" | "object">>;
  context: AssistantContextSnapshot | null;
  started_at: string;
  phase: AgentRunPhase | "unknown";
  turns: AgentTurnView[];
  activity: AssistantActivity[];
  awaiting_input: readonly AgentPendingQuestion[];
  /**
   * The step list the round keeps as it goes (the runtime's update-todo, its latest version): what the Agent means to
   * do, shown as a checklist. It has no authority — what happened is in the activity and the objects.
   */
  steps?: Array<{ id: string; text: string; state: "pending" | "in-progress" | "done" | "abandoned" }>;
  usage?: AgentRunUsage;
  /**
   * The model this round really ran on, as the runtime froze it at its start (`model_id`), the one its calls went to after
   * the person switched (`now`) and the window it was packed against. Absent for
   * a round the runtime has no record of. Choosing another model for the next round never changes this.
   */
  model?: { model_id: string; now?: string; window_tokens?: number };
  stop_reason?: string;
  /** While a model call of this round waits to try again: when and why, as the runtime said (the page counts down to it). */
  retry_wait?: AgentRetryWait;
  ended_at: string | null;
  /** The memories this round was given, and the ones that matched but did not fit (specs/archive/memory-system §7.3). Deleted ones are not listed. */
  memories_used?: { used: AssistantRoundMemory[]; omitted: Array<AssistantRoundMemory & { reason: "budget" | "limit" }> };
}

export interface AssistantRoundMemory { memory_id: string; scope: MemoryScope; text: string; origin: string }

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
   * produced); `missing` — the owner no longer has it; `unavailable` — it cannot be read now (plugin off, no access);
   * `moved` — the person moved it elsewhere (another project or their personal space): named, not read across.
   */
  state: "current" | "changed" | "missing" | "unavailable" | "moved";
  /** For `moved`: where it is now, in words the person reads. */
  moved_to?: { title: string; kind: "personal" | "project" };
  recorded_at: string;
  /** Where the person opens it. */
  open?: { surface: string; id: string };
}

/**
 * Where a work runs and what it can reach and call (specs/visual-ui-experience VUX-08/09), for its side groups 工作环境 and
 * 连接与工具: read from each owner when asked (`GET /api/assistant/works/<id>/surroundings`), kept nowhere. A part its owner
 * could not answer says so in its `problem` instead of failing the rest.
 */
export interface AssistantWorkSurroundings {
  environment: {
    scope: { kind: "personal" } | { kind: "project"; project_id: string; title: string | null };
    /** For a work a plugin carries: its session's directory, and that directory's repository as the project's workspace reads it. */
    executor?: { workspace: { name: string; path: string } | null; git: AssistantWorkGit | null; problem?: string };
  };
  /** The person's connections, each as its own status says: set up, signed in, and whether its tools can be called. */
  connections: AssistantWorkConnection[];
  connections_problem?: string;
  /** What this work's executor can call now: the Assistant's actions by provider, and the ones that cannot run with their owner's reason. A plugin that carries the work keeps its own tools. */
  tools: { executor: "assistant" | "plugin"; callable: Array<{ provider: string; count: number }>; unavailable: Array<{ title: string; provider: string; reason: string }>; problem?: string };
  read_at: string;
}
/** A directory's repository: its branch (null on a detached HEAD), how far it is from its upstream, and what is not committed. */
export interface AssistantWorkGit {
  /** The remote's owner/name, without any credentials in its address; null with no remote. */
  repository: string | null;
  branch: string | null;
  ahead: number;
  behind: number;
  changed: number;
  conflicted: number;
}
export interface AssistantWorkConnection {
  connection_id: string;
  title: string;
  account: string | null;
  state: "connected" | "needs-authorization" | "failed" | "disconnected" | "unchecked" | "incomplete" | "off";
  /** Whether its tools can be called now (`none-discovered`: none found yet). */
  tools: "callable" | "partial" | "blocked" | "none-discovered";
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
  delegated?: Array<{ work_id: string; title: string; state: AssistantWorkState; follow_ups: number; taken_back?: boolean }>;
  /** Timed rounds the person asked this work to run. */
  scheduled?: AssistantFollowUp[];
  /** Whether those timed rounds still run with the window closed (the runtime queue's own claim). */
  schedule_survives_close?: boolean;
  /** Changes still running at their owner when a round stopped or ran out of time, and what the owner finally did. */
  unsettled?: AssistantUnsettledChange[];
  /** Changes of this work that say how they are undone: each can be taken back once, by the person. */
  undoable?: AssistantUndoable[];
  /** What this work suggests keeping, waiting for the person. */
  memory_candidates?: AssistantMemoryCandidate[];
  /** What this work kept, replaced or forgot in the platform memory; an automatic one can be undone (`POST /api/memory/changes/<id>/undo`). */
  memory_changes?: MemoryChange[];
  /** Background work this work started in plugins, and how each stands. */
  jobs?: AssistantBackgroundJob[];
  /**
   * What this work used, as the runtime reported its finished rounds (input plus output tokens; its sub-tasks counted
   * with it, and a sub-task shows its delegating work's total), and the cap that applies.
   */
  usage?: { tokens: number; rounds: number; budget_tokens: number | null; budget_of?: { work_id: string; title: string } };
  /** Why the work cannot run now, when it cannot (no model, a busy session…), with one next step. */
  problem?: { message: string; action?: string };
  /**
   * What waits in the work's own session for its next round (specs/ai-input-receipts §4.4, D31), read only while none of its
   * rounds is live. Absent: not read this time (a round is live, or a plugin runs the work); `[]`: read, and nothing waits.
   */
  queued_inputs?: AgentQueuedInput[];
}

export type { AssistantRecovery } from "./assistant-recovery.js";

export interface AssistantSendInput extends Pick<AgentInputSend, "about"> {
  /** Omitted starts a new work. */
  work_id?: string;
  /** For a new work: who carries it. An existing work keeps its executor. */
  executor?: AssistantExecutorChoice;
  /** For a new work carried by a plugin: the mode of its first round. Later rounds use the session's own setting. */
  mode?: string;
  /** For a new work carried by a plugin: continue this existing session (the one open on the plugin's page) instead of a new one. */
  executor_session_id?: string;
  /** The Character to carry this and later rounds (null: the Assistant itself); omitted keeps the work's choice. */
  character?: AssistantCharacterRef | null;
  /** Required for a new work; ignored for an existing one, whose scope never changes. */
  scope?: AssistantScope;
  text: string;
  context?: AssistantContextSnapshot;
  materials?: AssistantMaterial[];
  /**
   * The page sets this on words it wrote itself rather than the person: a canned note, or a request a plugin's page sends for them without showing it first.
   * The Host then does not count the round as something the person said (memory's 「你说过」, what learning draws on). Over HTTP only "page" is accepted: the
   * rounds the Host writes (a timed one) and the Assistant writes (a sub-task's brief) are marked by Host code, never claimed from outside.
   */
  written_by?: "page";
  /**
   * While the round under way waits on a question, the person chooses (specs/ai-input-receipts D14): `answer` answers its
   * one free-text question, `steer` adds the words to the round. Absent is `steer`: the Host never decides it is an answer.
   */
  target?: "answer" | "steer";
  reask?: AgentQuestionReask;
  /** One per press of Send. A repeat returns the first outcome and starts nothing. */
  request_id: string;
}

/** What one Send did: started a round, reached a running one, waits for the next (its round had just ended), or answered its question. */
export interface AssistantSendResult {
  work: AssistantWork;
  outcome: "started" | "steered" | "queued" | "answered" | "repeated";
  run_id?: string;
}

/**
 * Hand a work to another agent and keep it one work: to a plugin's Agent (in its project, with a note of what was agreed and
 * produced so far), or back to the Assistant (whose next round reads what the plugin did). Only between rounds.
 */
export interface AssistantHandover {
  to: AssistantExecutorChoice;
  /** For a plugin: the mode its first round runs in. */
  mode?: string;
}

/** What the page asks of a work's latest round: pause, resume or stop it, or take back a supplement no model has seen (§4.3). */
export type AssistantControl =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop"; keep_connections?: boolean }
  | { kind: "withdraw"; run_id: string; input_id: string };

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
  /** Changes that say which object they produced, of a kind that can be read back, so a work can keep a relation to it. */
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
/** Background work a round or a card started in a plugin (a research run…), followed until it ends. */
export interface AssistantBackgroundJob {
  job_id: string;
  work_id: string;
  /** The capability that started it, as the person reads it. */
  title: string;
  state: "running" | "completed" | "failed" | "unknown";
  started_at: string;
  ended_at?: string;
  /** Set when a suggestion card started it. */
  card_id?: string;
}

/** What the Assistant's own rounds used today (as the runtime reported them), and the person's daily cap. */
export interface AssistantUsage {
  /** Today in the person's time zone: finished rounds' reported tokens. Cached input is shown apart and not counted. */
  today: { input: number; output: number; cached_input: number; rounds: number };
  /** Input plus output tokens per day, or null for no cap. */
  daily_tokens: number | null;
}

/** Something the person asked the Assistant to keep: personal (all their work) or one project's. */
export interface AssistantMemory {
  memory_id: string;
  scope: "personal" | "project" | "character";
  /** For a project memory: which project. */
  project_id?: string;
  text: string;
  /** Where it came from: the work, the date and the person's own words. */
  origin: string;
  /** Kept, but not used in work until switched on again (different from deleting it). */
  disabled: boolean;
}

/** What the Assistant may do with memory, set by the person; applied exactly as written. */
/** A method a Plugin offers for business work that a work in this scope can use (registered with the Host). */
export interface AssistantMethod {
  /** `<plugin_id>/<skill_id>`. */
  method_id: string;
  plugin_id: string;
  plugin_title: string;
  version: number;
  name: string;
  summary: string;
}

export interface AssistantMemoryPrefs {
  /** May keep what the person explicitly asks it to remember. It never keeps anything the person did not ask for or accept. */
  form: boolean;
  /** Personal memories are used in work. */
  use_personal: boolean;
  /** A project's memories are used in that project's work. */
  use_project: boolean;
  /** May propose, from work, a personal preference or lesson worth keeping — only as a candidate the person accepts. */
  learn_personal: boolean;
  /** May propose, from a project's work, a convention or lesson for that project — only as a candidate. */
  learn_project: boolean;
}

/**
 * Something a work suggests keeping (a preference seen more than once, a lesson from how a work went). It takes effect
 * only when the person accepts it; declined or left alone for 14 days, it goes.
 */
export interface AssistantMemoryCandidate {
  candidate_id: string;
  work_id: string;
  work_title: string;
  scope: "personal" | "project" | "character";
  project_id?: string;
  text: string;
  /** What in the work it rests on. */
  why: string;
  /** When it applies. */
  applies: string;
  state: "pending" | "accepted" | "discarded" | "expired";
  created_at: string;
  memory_id?: string;
  /** Why the write gate held back what the person asked to keep, in the memory service's words; absent for the work's own suggestions. */ held?: string;
}

/**
 * `material`: new items elsewhere (Feed, Inbox…) that share a Goal with the work — a light notice, merged per work.
 * `reminder`: a reminder the person set in a Plugin came due (a time on a to-do); it belongs to no work.
 * `directory-read`: a Plugin read a local directory the person authorized (PG-049; every read is told, whoever started it). */
export type AssistantNoticeKind = "failed" | "needs-decision" | "completed" | "result" | "material" | "reminder" | "directory-read";
export interface AssistantNotice {
  notice_id: string;
  kind: AssistantNoticeKind;
  /** The work it is about; empty for a reminder. */
  work_id: string;
  /** The work's title, or for a reminder the Plugin that holds it. */
  work_title: string;
  text: string;
  created_at: string;
  /** For a reminder: where the person opens the item (its project, or null for the personal space). */
  open?: { surface: string; id: string; title: string; project_id: string | null };
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
/** A change the person can take back: its owner said how (the action's `undo`), and the Host kept the exact input. */
export interface AssistantUndoable {
  undo_id: string;
  /** The change as the person reads it: provider · title. */
  title: string;
  state: "available" | "undone" | "failed";
  created_at: string;
  undone_at?: string;
  /** Why taking it back did not work, in the owner's words. */
  detail?: string;
  /** The owner's capability that takes it back: once it has, the owner's page rereads, as after the change itself. */
  capability_id?: string;
}

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

/**
 * The developer diagnostics page: the execution runtime's own account, and the Assistant's latest rounds with the exact
 * identities and versions they ran with. Identifiers live here so the conversation never has to show them.
 */
export interface AssistantDiagnostics {
  runtime: AgentRuntimeDiagnostics | null;
  rounds: AssistantRoundDiagnostics[];
}

/** One round as a developer traces it: what it froze at its start, what it was given and why, and where it stopped. */
export interface AssistantRoundDiagnostics {
  work_id: string;
  work_title: string;
  project_id: string | null;
  session_id: string | null;
  run_id: string;
  started_at: string;
  ended_at: string | null;
  phase: AgentRunPhase | "unknown";
  /** The runtime's own reason, not rewritten for the person. */
  stop_reason: string | null;
  /** Frozen at the start; null when the runtime no longer has the run. */
  frozen: {
    model_id: string;
    role: { id: string; version: number };
    execution: string;
    character: { artifact_id: string; version: number; title: string } | null;
    prompts: Array<{ prompt_id: string; version: number; layer: string; user_revision?: number }>;
    history?: "digest";
    thinking?: "adaptive";
  } | null;
  /** What the round was given, and whether the person added it or it came from the page. */
  materials: Array<{ kind: AssistantMaterial["kind"]; title: string; explicit: boolean; draft?: boolean; object?: AssistantObjectRef;
    capability?: { capability_id: string; version: number; provider_id: string }; method?: { method_id: string; version?: number } }>;
  usage: { input: number; output: number; cached_input: number } | null;
  /** Calls that failed or whose outcome is not known, with the tool's own name and summary. */
  failures: Array<{ tool: string; target: string; state: "failed" | "unknown"; summary: string;
    /** The runtime's own words for the failure, bounded; when a summary only names a generic code, the rule that refused the call and its reason are here. */
    detail?: string }>;
}

/** Immutable destination of a discussion work. The owner provides context and stores the final reply. */
export interface AssistantReplyTarget {
  provider_id: string;
  subject_kind: string;
  subject_id: string;
  thread_id: string;
  title: string;
}
/** A person explicitly includes an unsaved object draft; the owner validates its base revision. */
export interface AssistantThreadDraft {
  text: string;
  revision: string;
}

export interface AssistantThreadContext {
  title: string;
  revision: string;
  text: string;
  truncated: boolean;
  message: { message_id: string; body: string; request_id: string };
}
/** Set only by the Host after reading this work's completed run; not an action input. */
export interface AssistantReplyDelivery {
  target: AssistantReplyTarget;
  message_id: string;
  request_id: string;
  work_id: string;
  run_id: string;
  body: string;
}
