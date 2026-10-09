import type { WebProjectNavigation } from "./settings-navigation.js";

export type CapsuleStateKind =
  | "working"
  | "checking"
  | "needs_you"
  | "blocked"
  | "complete"
  | "ready"
  | "waiting"
  | "empty";

export interface CapsuleState {
  kind: CapsuleStateKind;
  label: string;
  goal_id: string | null;
  goal_title: string;
  goal_path: string;
  action_label: string;
  action_path: string;
  status_since: string | null;
  why: string;
  current: string;
  blocker: string;
  next: string;
  running_count: number;
  additional_running: number;
  menu_bar_title: string;
  menu_bar_tooltip: string;
}

export type CapsuleTabKind =
  | "waiting_user"
  | "in_progress"
  | "continue"
  | "waiting"
  | "blocked"
  | "completed";

export interface CapsuleGoalItem {
  goal_id: string;
  goal_title: string;
  goal_path: string;
  tab_kind: CapsuleTabKind;
  kind: CapsuleStateKind;
  status_label: string;
  status_since: string | null;
  why: string;
  current: string;
  blocker: string | null;
  next_step: string;
  next: string;
  action_label: string;
  action_path: string;
}

export interface CapsuleTab {
  kind: CapsuleTabKind;
  label: string;
  tone: CapsuleStateKind;
  items: CapsuleGoalItem[];
}

export interface CapsuleSnapshot {
  observed_event_cursor: number;
  project: WebProjectNavigation;
  state: CapsuleState;
  tabs: CapsuleTab[];
  default_tab: CapsuleTabKind | null;
  default_goal_id: string | null;
}
