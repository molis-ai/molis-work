/** The agent-host contract (`services/agent-host`): the project work a run sees, session messages, background tasks and the step board. */
import type { AgentSessionRef } from "./agent-host-runtime.js";

/** Original SDK facts. A reported success is never a user acceptance. */
/**
 * One piece of work in a project: a round under way or ended, or a round waiting for another to finish. Items live on
 * the project's SDK task graph; `paths` is what the work named or wrote, used to find overlaps.
 */
export interface AgentProjectWork {
  work_id: string;
  /** The runtime session doing it. */
  session_id: string;
  run_id?: string;
  /** The session's title. */
  title: string;
  /** The round's task, bounded. */
  task: string;
  state: "waiting" | "running" | "done" | "failed" | "stopped";
  directory: string;
  paths: string[];
  /** Work items this one waits for. */
  waits_for?: string[];
  updated_at_ms: number;
  /** For a waiting item: the session's wait that starts it (agent-collaboration). */
  wait_id?: string;
}

/** Other work under way in the same directory whose files overlap a scope. */
export interface AgentProjectWorkOverlap {
  work: AgentProjectWork;
  paths: string[];
}

export interface AgentProjectWorkCapability {
  /** `probe`: a round about to start (its directory and task or plan text); overlaps are found against it. */
  read(project: string, probe?: { session_id?: string; directory: string; text: string }): Promise<{ items: AgentProjectWork[]; overlaps: AgentProjectWorkOverlap[] }>;
  /**
   * Hold a round until another piece of work finishes; the person decided. The session's step waits on that work (a
   * wait by "app"); the round itself is kept by whoever starts it once the step may go on.
   */
  queue(project: string, input: { session: AgentSessionRef; directory: string; task: string; after: string; title?: string }, actorId: string): Promise<AgentProjectWork>;
  /** Give up a waiting item; `note` says why. */
  release(project: string, workId: string, actorId: string, note: string): Promise<void>;
}

/** A message one session of a project sent another (the SDK's envelope). Data for its recipient, never an approval. */
export interface AgentSessionMessage {
  message_id: string;
  from_session: string;
  to_session: string;
  from_title: string;
  to_title: string;
  kind: "request" | "notice" | "reply" | "handoff";
  body: string;
  state: "queued" | "delivered" | "accepted" | "rejected" | "completed" | "expired" | "cancelled";
  sent_at_ms: number;
  in_reply_to?: string;
  /** The sender waits for the answer before going on. */
  await_reply?: true;
  /** For the people working the sessions (a delegation), never handed to a model. */
  audience?: "people";
  /** The App's own references it carries (fixed outputs, materials). */
  attachments?: AgentMessageAttachment[];
  /** Every step it went through, oldest first. */
  history?: Array<{ event: string; state: AgentSessionMessage["state"]; at_ms: number; by?: string; note?: string; attachments?: AgentMessageAttachment[]; late?: true }>;
  /** How many times the work has been passed on. */
  hops?: number;
}

export interface AgentMessageAttachment { kind: string; id: string; version?: number; title?: string }

/** A message the App sends for a person, to the people working another session. */
export interface AgentPeopleMessageInput {
  from_session: string;
  to_session: string;
  kind: "request" | "reply";
  body: string;
  in_reply_to?: string;
  attachments?: AgentMessageAttachment[];
  ttl_ms?: number;
  hops?: number;
}

/** What a person does with a message for people; `event` names it in the App's words, `note` says why. */
export type AgentPeopleMessageAction = "deliver" | "accept" | "reject" | "complete" | "cancel" | "record";

export interface AgentSessionMessagesCapability {
  read(project: string, sessionId?: string): Promise<AgentSessionMessage[]>;
  cancel(project: string, messageId: string): Promise<void>;
  /**
   * The person made a session the priority: the sessions whose work under way overlaps its own (at most five) are
   * told, on its behalf, to make way for those files. Nothing is paused; who stops is still the person's call.
   */
  prioritize?(project: string, sessionId: string, actorId: string): Promise<{ notified: string[]; paths: string[] }>;
  /** Send a message for people (a delegation, a delivery) on a person's behalf. */
  sendForPeople?(project: string, input: AgentPeopleMessageInput, actorId: string): Promise<AgentSessionMessage>;
  /** Move a message for people on: delivered, accepted or rejected (with why), completed, cancelled, or a note. */
  act?(project: string, messageId: string, action: AgentPeopleMessageAction, detail: { event?: string; note?: string; attachments?: AgentMessageAttachment[] }, actorId: string): Promise<AgentSessionMessage>;
}

/** A background command of a session: it keeps running after the round that started it, until it ends or is stopped. */
export interface AgentBackgroundTask {
  task_id: string;
  session_id: string;
  run_id?: string;
  summary: string;
  state: "running" | "succeeded" | "failed" | "stopped" | "interrupted";
  exit_code?: number;
  started_at_ms: number;
  ended_at_ms?: number;
}

export interface AgentBackgroundCapability {
  read(project: string, sessionId?: string): Promise<AgentBackgroundTask[]>;
  /** The person stops a running command. */
  stop(project: string, taskId: string): Promise<boolean>;
}

/** Who holds a step: only its holder reports on it. */
export interface AgentStepOwner {
  kind: "session" | "subtask" | "person" | "none" | "other";
  /** How the holder reads in the Host's words, for the round's model: 本会话, 子任务「…」, 用户, 没人认领. A page says `kind` in its own words. */
  label: string;
  /** A subtask's title: the key the coordinator gave it when dispatching it. */
  title?: string;
  /** The subtask holding it, as listed in the round's subagents. */
  subagent_id?: string;
  /** The person holding it. */
  actor_id?: string;
  /** A session holds it but has no round running and has not moved it for two hours: the person may reassign it. */
  expired?: true;
}

/** Who wrote a step's report. */
export interface AgentStepReportAuthor {
  /** `handover`: the report records the step passing from one holder to another. */
  kind: "session" | "subtask" | "person" | "handover" | "other";
  /** In the Host's words, for the round's model: 本会话, 子任务「…」, 用户, 改派. A page says `kind` in its own words. */
  label: string;
  /** A subtask's title: the key the coordinator gave it when dispatching it. */
  title?: string;
}

export interface AgentStepProgressSummary {
  /** Weighted completion percentage (0..100), clamped below 100 while any in-scope leaf is incomplete (CHO-33). Null when zero in-scope leaves carry story points. */
  weighted_percent: number | null;
  completed_points: number;
  total_points: number;
  estimated_leaves: number;
  unestimated_leaves: number;
  completed_unestimated_leaves: number;
  removed_scope_leaves: number;
  removed_scope_points: number;
}

export interface AgentStepBoard {
  project_id: string;
  version: number;
  terminal: boolean;
  progress_summary?: AgentStepProgressSummary;
  /** In execution order: dependencies first, the original plan order breaking ties. */
  nodes: Array<{
    id: string;
    state: "not-started" | "ready" | "running" | "waiting" | "succeeded" | "failed" | "cancelled" | "blocked" | "needs-reconciliation";
    /** Who reported; a handover says so. */
    reports: Array<{ note: string; at_ms: number; by?: AgentStepReportAuthor; handover?: true; /** Inputs the report is about. */ inputs?: import("./agent-inputs.js").AgentInputRef[] }>;
    owner?: AgentStepOwner;
    /** The SDK node title; a person's inserted step carries its own. */
    title?: string;
    depends_on?: string[];
    parent_id?: string;
    /** Added by a person during the run, not part of the confirmed plan. */
    inserted?: boolean;
    /** The inputs this step was added for, as the runtime's board records them (pointers only; the session owns the inputs). Absent: none. */
    origins?: import("./agent-inputs.js").AgentInputRef[];
    /** Positive Fibonacci story points (1, 2, 3, 5, 8, 13, 21, 34, ...) or null when unestimated (CHO-29). */
    story_points?: import("./agent-host-start.js").AgentStoryPoints | null;
    estimate_source?: import("./agent-host-start.js").AgentEstimateSource;
    estimate_reason?: string;
    /** Leaf completion fraction 0..1; succeeded is 1, running/stopped preserve reported progress < 1 (CHO-31..33). */
    progress?: number;
    progress_basis?: string;
    /** Explicitly skipped by a person (remains in active denominator, unlike scope_removed) (CHO-32). */
    skipped?: true;
    /** Explicitly removed from scope (excluded from denominator, unlike unfinished stopped steps) (CHO-32). */
    scope_removed?: true;
    /** A command in this step ended with an unknown outcome; excluded from completion until a person checks it (BL-222). */
    unknown_outcome?: true;
  }>;
}

/**
 * A person's change to a running plan. Each one is an SDK board operation recorded as a report on the
 * board itself; the confirmed plan Artifact is never rewritten.
 */
export type AgentStepAmendment =
  | { kind: "skip"; node: string; reason: string }
  /**
   * `mine`: the person takes the new step on themselves. `origin`: the supplement the step is for, one input of this round
   * (the AI said it is a new task, and the person added it); the Host checks it is this round's and not taken back.
   */
  | { kind: "insert"; after: string; title: string; acceptance: string; mine?: true; origin?: string; parent_id?: string; story_points?: import("./agent-host-start.js").AgentStoryPoints | null; estimate_source?: import("./agent-host-start.js").AgentEstimateSource; estimate_reason?: string }
  | { kind: "unblock"; node: string; note: string }
  | { kind: "move"; node: string; direction: "up" | "down" }
  /** Hand an unfinished step to the person themselves, or back to the round's session. */
  | { kind: "assign"; node: string; to: "me" | "session" }
  /** The person's own result on a step they hold. */
  | { kind: "resolve"; node: string; state: "succeeded" | "failed"; note: string }
  /** Set or clear Fibonacci story points on a step (CHO-29, CHO-35). */
  | { kind: "estimate"; node: string; story_points: import("./agent-host-start.js").AgentStoryPoints | null; reason?: string }
  /** Record partial progress (0..1) and its factual basis on a step (CHO-32). */
  | { kind: "progress"; node: string; progress: number; basis: string }
  /** Explicitly move a step out of scope so it leaves the weighted denominator with a recorded reason (CHO-32). */
  | { kind: "remove-scope"; node: string; reason: string }
  /** Reconcile a step whose command outcome was unknown: either confirm it completed or reset it to run again (BL-222). */
  | { kind: "reconcile"; node: string; action: "confirm-done" | "rerun"; note: string };
