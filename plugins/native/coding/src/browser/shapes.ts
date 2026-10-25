/** The JSON the Coding routes answer, as far as the page reads it (src/routes-*.ts write it). */

export interface StepReport { readonly by?: string; readonly note: string; readonly at_ms?: number; readonly inputs?: readonly { readonly input_id: string }[] }

export interface StepNode {
  readonly id: string;
  readonly title?: string;
  readonly state: string;
  readonly inserted?: boolean;
  readonly owner?: { readonly kind: string; readonly label?: string; readonly expired?: boolean; readonly subagent_id?: string };
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
  readonly board?: { readonly project_id: string; readonly version: number; readonly terminal?: boolean; readonly nodes: readonly StepNode[] };
  readonly plan?: { readonly content: { readonly title?: string; readonly steps: readonly { readonly title: string; readonly acceptance: string }[] } };
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
  | { kind: "insert"; after: string; title: string; acceptance: string; origin?: string; mine?: true }
  | { kind: "move"; node: string; direction: "up" | "down" }
  | { kind: "unblock"; node: string; note: string }
  | { kind: "skip"; node: string; reason: string }
  | { kind: "assign"; node: string; to: "me" | "session" }
  | { kind: "resolve"; node: string; state: "succeeded" | "failed"; note: string };
