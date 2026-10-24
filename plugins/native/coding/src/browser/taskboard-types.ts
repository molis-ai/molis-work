import type { Amendment, PlanEntry, StepNode } from "./shapes.js";
import type { PagePorts, Translate } from "./types.js";

/** A state as the board says it: its word, the mark that draws it, and its tone. */
export type StateMark = readonly [label: string, mark: string, tone: string];

/** The state words of the board's three kinds of row (taskboard-words.ts). */
export interface Words {
  readonly state: Readonly<Record<string, StateMark>>;
  readonly phase: Readonly<Record<string, StateMark>>;
  readonly child: Readonly<Record<string, StateMark>>;
}

export type Board = NonNullable<PlanEntry["board"]>;

/** The plan not yet run, as the session read gives it. */
export interface DraftPlan {
  readonly revision: number;
  readonly confirmed?: unknown;
  readonly content: {
    readonly title: string;
    readonly change_reason?: string;
    readonly blockers?: unknown;
    readonly steps: readonly { readonly title: string; readonly acceptance: string }[];
  };
}

export interface BoardRun {
  readonly ref: { readonly run_id: string };
  readonly phase: string;
  readonly task?: string;
  readonly started_at?: string | number;
  readonly turns?: readonly { readonly kind: string; readonly text: string; readonly steer?: unknown }[];
  readonly frozen?: {
    readonly role_id?: string;
    readonly model_id?: string;
    readonly character?: { readonly title?: string };
    readonly directory?: { readonly canonical_path?: string };
  };
}

export interface BoardChild {
  readonly subagent_id: string;
  readonly role_id?: string;
  readonly role_name?: string;
  readonly task: string;
  readonly state: string;
  readonly error?: string;
  readonly workspace_path?: string;
  readonly verdict?: { readonly status?: string };
  readonly activity?: readonly { readonly at?: string }[];
}

export interface BoardSubagents {
  readonly run_id: string;
  readonly error?: string;
  readonly children: readonly BoardChild[];
}

/** A session read as the board draws it: the loaded rounds with the board's copy of the rest merged in (client.ts). */
export interface BoardData {
  readonly plan?: DraftPlan | null;
  readonly taskboard_plans?: readonly PlanEntry[];
  readonly runs?: readonly BoardRun[];
  readonly subagents?: readonly BoardSubagents[];
  readonly recovery_required?: boolean;
  readonly checkpoint_busy?: boolean;
  readonly error?: string;
}

/** Where a row leads when it is clicked (the page's `navigate`). */
export type BoardTarget =
  | { readonly kind: "recovery" | "reviews" | "plan" }
  | { readonly kind: "run"; readonly run_id: string }
  | { readonly kind: "step"; readonly run_id: string; readonly step_id: string }
  | { readonly kind: "child"; readonly run_id: string; readonly child_id: string };

export interface Executor {
  readonly name: string;
  readonly detail: string;
  readonly none?: boolean;
  readonly person?: boolean;
  readonly expired?: boolean;
}

export interface RowTime { readonly text: string; readonly title: string }

export interface Dependency { readonly title: string; readonly ready: boolean; readonly blocked: boolean }

/** What a step row needs to be changed: the graph it is on, the round that holds it and its place in it. */
export interface RowEdit {
  readonly board: Board;
  readonly runId: string;
  readonly position: number;
  /** The round is still going, so a change reaches it as a steer. */
  readonly live: boolean;
}

export interface BoardRow {
  readonly key: string;
  readonly label?: string;
  readonly title: string;
  readonly hint?: string;
  readonly state: StateMark;
  readonly progress: { readonly done: number; readonly total: number } | null;
  readonly deps?: readonly Dependency[];
  readonly executor: Executor | null;
  readonly time?: RowTime | null;
  readonly target: BoardTarget;
  readonly children: readonly BoardRow[];
  readonly note?: string;
  /** The graph's step the row is, for its receipt link. */
  readonly node?: StepNode;
  /** Set on a step the person may still change. */
  readonly edit?: RowEdit;
}

export interface BoardGroup {
  readonly id: string;
  readonly label: string;
  readonly mark: string;
  readonly count?: string;
  readonly items: readonly BoardRow[];
}

export interface TaskboardPorts extends Pick<PagePorts, "lifetime" | "translate" | "current" | "status"> {
  readonly board: HTMLElement;
  /** The directory column's outline of the same tree. */
  readonly outline?: HTMLElement | null;
  readonly navigate: (owner: string, target: BoardTarget) => Promise<void>;
  /** The person's own task, read out of the text a round was sent. */
  readonly ownTask: (text: string) => string;
  readonly amend: (runId: string, version: number, amendment: Amendment, live: boolean) => Promise<void>;
  readonly roleName: (id: string | undefined) => string;
  /** The receipt link of a step the person's words started, when there is one. */
  readonly from: (node: StepNode) => Node | null;
  /** Receives "done/total" of the latest graph for the main area's view switch. */
  readonly progress?: (text: string) => void;
  /** Whether a session is on show (none chosen, or its tab closed: the outline says so). */
  readonly onShow?: () => boolean;
}

/** What the tree is built from: the read, the page's words and the ports that name things. */
export interface TreeInput {
  readonly data: BoardData;
  readonly translate: Translate;
  readonly words: Words;
  readonly ports: Pick<TaskboardPorts, "roleName" | "ownTask">;
}

/** What the board's rows draw with. */
export interface RowView {
  readonly ports: TaskboardPorts;
  readonly words: Words;
  readonly board: HTMLElement;
  /** The board's rows: an inline form opens in it. */
  readonly list: HTMLElement;
  /** The keys of the rows the person folded. */
  readonly collapsed: Set<string>;
  /** Forgets what was drawn and draws it again. */
  readonly redraw: () => void;
}
