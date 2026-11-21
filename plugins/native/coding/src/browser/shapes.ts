/** The JSON the Coding routes answer, as far as the page reads it (src/routes-*.ts write it). */
import type { AgentStepBoard, AgentStepProgressSummary, AgentStepReportAuthor } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Who the Host says made a report: a kind the page words itself, the Host's own label, and a subtask's title. */
export type StepReportAuthor = AgentStepReportAuthor;

export interface StepReport { readonly by?: StepReportAuthor; readonly note: string; readonly at_ms?: number; readonly inputs?: readonly { readonly input_id: string }[] }

export type BoardProgressSummary = AgentStepProgressSummary;

export interface StepNode {
  readonly id: string;
  readonly title?: string;
  readonly state: string;
  readonly inserted?: boolean;
  readonly parent_id?: string;
  readonly story_points?: number | null;
  readonly estimate_source?: "agent" | "human";
  readonly estimate_reason?: string;
  readonly progress?: number;
  readonly progress_basis?: string;
  readonly skipped?: boolean;
  readonly scope_removed?: boolean;
  readonly unknown_outcome?: boolean;
  readonly owner?: AgentStepBoard["nodes"][number]["owner"];
  readonly depends_on?: readonly string[];
  /** The supplements that asked for the step. */
  readonly origins?: readonly { readonly input_id: string }[];
  readonly reports: readonly StepReport[];
}

export interface StepVerdict { readonly status: string; readonly notes: string; readonly revision: number; readonly project_id: string; readonly board_version: number }

export interface PlanEntry {
  readonly run_id: string;
  readonly revision: number;
  readonly board_error?: unknown;
  readonly error?: string;
  readonly board?: { readonly project_id: string; readonly version: number; readonly terminal?: boolean; readonly nodes: readonly StepNode[]; readonly progress_summary?: BoardProgressSummary };
  readonly plan?: { readonly content: { readonly title?: string; readonly steps: readonly { readonly title: string; readonly acceptance: string; readonly parent?: number; readonly story_points?: number; readonly estimate_source?: "agent" | "human"; readonly estimate_reason?: string }[] } };
  readonly verdicts?: Readonly<Record<string, StepVerdict>>;
}

export interface RunView { readonly ref: { readonly run_id: string }; readonly phase: string }

/** `GET /sessions/<id>`: the part of a session's read the step reports use. */
export interface SessionRead {
  readonly runs: readonly RunView[];
  readonly taskboard_plans?: readonly PlanEntry[];
  readonly recovery_required?: boolean;
  readonly checkpoint_busy?: boolean;
}

/** What a person may change on a round's step graph; the Host checks each against the graph's version. */
export type Amendment =
  | { kind: "insert"; after: string; title: string; acceptance: string; origin?: string; mine?: true; parent_id?: string; story_points?: number; estimate_reason?: string }
  | { kind: "move"; node: string; direction: "up" | "down" }
  | { kind: "unblock"; node: string; note: string }
  | { kind: "skip"; node: string; reason: string }
  | { kind: "remove-scope"; node: string; reason: string }
  | { kind: "estimate"; node: string; story_points: number | null; reason?: string }
  | { kind: "progress"; node: string; progress: number; basis: string }
  | { kind: "assign"; node: string; to: "me" | "session" }
  | { kind: "resolve"; node: string; state: "succeeded" | "failed"; note: string }
  | { kind: "reconcile"; node: string; action: "confirm-done" | "rerun"; note: string };
