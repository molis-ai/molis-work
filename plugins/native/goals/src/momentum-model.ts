import type { GoalDisplayStatus } from "./tree-order.js";

export interface GoalMomentumEventInput {
  type: string;
  at: string;
  /** Journal payload; completion is read from it, so a closure that did not apply is not counted. */
  payload?: unknown;
}

export interface GoalMomentumGoalInput {
  goal_id: string;
  title: string;
  status: string;
  work_state: string;
  display_status: GoalDisplayStatus;
  priority: number;
  created_at: string;
  updated_at: string;
  completed: boolean;
  reasons: Array<{ code: string }>;
  events: GoalMomentumEventInput[];
}

export interface GoalMomentumRelationInput {
  relation_id: string;
  from_goal_id: string;
  to_goal_id: string;
  type: string;
  state: string;
  reason: string;
}

export interface GoalMomentumEdge {
  relation_id: string;
  provider_goal_id: string;
  consumer_goal_id: string;
  reason: string;
}

export interface GoalMomentumNode extends GoalMomentumGoalInput {
  level: number;
  row: number;
  group_id: string;
  provider_goal_ids: string[];
  consumer_goal_ids: string[];
  unsatisfied_provider_goal_ids: string[];
  downstream_goal_ids: string[];
  downstream_open_count: number;
  completion_ratio: number;
  blocked: boolean;
  startable: boolean;
  stale: boolean;
  history_sufficient: boolean;
}

export interface GoalMomentumGroup {
  group_id: string;
  title: string;
  root_goal_id: string | null;
  goal_count: number;
  level_start: number;
  level_end: number;
  row_start: number;
  row_end: number;
}

export interface GoalMomentumCadenceBucket {
  date: string;
  started: number;
  completed: number;
}

export interface GoalMomentumCadence {
  days: 7 | 30;
  started: number;
  completed: number;
  stalled: number;
  history_incomplete: number;
  buckets: GoalMomentumCadenceBucket[];
}

export type GoalMomentumActionKind =
  | "decide"
  | "finish"
  | "start_high_impact"
  | "start"
  | "revive"
  | "waiting";

export interface GoalMomentumAction {
  goal_id: string;
  tier: 1 | 2 | 3 | 4 | 5;
  kind: GoalMomentumActionKind;
  downstream_open_count: number;
  unsatisfied_provider_goal_ids: string[];
}

export interface GoalMomentumIntegrity {
  dangling_relation_ids: string[];
  dependency_cycle_goal_ids: string[];
  multi_parent_goal_ids: string[];
  part_of_cycle_goal_ids: string[];
}

export interface GoalMomentumView {
  selected_goal_id: string;
  level_count: number;
  grid_rows: number;
  nodes: GoalMomentumNode[];
  edges: GoalMomentumEdge[];
  groups: GoalMomentumGroup[];
  actions: GoalMomentumAction[];
  cadence: Record<7 | 30, GoalMomentumCadence>;
  integrity: GoalMomentumIntegrity;
}
