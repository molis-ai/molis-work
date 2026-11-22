import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";

/**
 * Types the Goals page client shares (specs/page-client-lifecycle). The page runs in the workbench the shell draws; what the
 * shell gives is `PageHost` (page.ts), and the globals below are the ones the workbench page installs before any client runs.
 */
declare global {
  /** The page's one request helper (packages/ui-host). */
  var molisWorkRequest: UiRequest;
  /** Turns an address inside the project into the one the page navigates to (the desktop shell adds its own marks). */
  var molisWorkNavigationUrl: (url: string) => string;
}

/** A Goal as the page's data lists it. */
export interface GoalListItem {
  readonly goal: { readonly goal_id: string; readonly title: string };
  readonly status?: string;
  readonly status_label?: string;
  readonly status_meaning?: string;
  readonly status_icon?: string;
  readonly terminal_read_only?: unknown;
}

/** The Goals lists of the page data, and the Goal the project has as current. */
export interface GoalNavigation {
  readonly goals: readonly GoalListItem[];
  readonly archived_goals: readonly GoalListItem[];
  readonly trashed_goals: readonly GoalListItem[];
  readonly active_goal_id?: string | null;
}

/** The page data Goals draws into `#molis-work-data`. */
export interface GoalsPageData extends GoalNavigation {
  readonly project?: { readonly project_id: string; readonly display_name?: string } | null;
  readonly snapshot: { readonly board: { readonly project_id: string } };
}

/** The view of the Goals collection a page shows. */
export type GoalCollection = "current" | "archive" | "trash";

/** Turns a project path into the page's address. */
export type Route = (path: string) => string;
/** A toast the shell shows; `error` marks it as a failure. */
export type ShowToast = (message: string, error?: boolean) => void;
/** The shell's own translator for a stable key. */
export type Translate = (key: string, values?: Readonly<Record<string, unknown>>) => string;
/** The mode of the Goals work area. */
export type WorkspaceMode = "graph" | "focus" | "runtime" | string;
export type SetWorkspaceMode = (mode: WorkspaceMode, persist?: boolean, preserveMobile?: boolean) => void;
