import type { ProjectReplicaRows, ProjectReplicaRow } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { goalRelationTypes, type GoalRelationRecord } from '@molis-ai/molis-work-contracts/modules/goals';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import { validatePlanningGraph } from './planning/goal-graph.js';

const errors = defineErrorCodes('goals', { replica_invalid: 'invalid' });

export function validateGoalReplication(rows: ProjectReplicaRows, projectId: string): void {
  const roots = rows.boards!;
  if (roots.length !== 1 || roots[0]!.project_id !== projectId) invalid();
  const goals = new Map(rows.goals!.map(row => [row.goal_id, row]));
  if (roots[0]!.active_goal_id !== null && !goals.has(roots[0]!.active_goal_id)) invalid();
  const events = new Map(rows.goal_work_events!.map(row => [row.event_id, row]));
  const requirements = new Map(rows.goal_event_requirements!.map(row => [row.requirement_id, row]));
  const decisions = new Map(rows.goal_event_applied_decisions!.map(row => [row.decision_id, row]));
  for (const [table, list] of Object.entries(rows)) for (const row of list) {
    if (table !== 'goals' && row.goal_id !== undefined && row.goal_id !== null && !goals.has(row.goal_id)) invalid();
    if (row.requirement_id !== undefined && !requirements.has(row.requirement_id)) invalid();
    if (table.startsWith('goal_event_') && row.event_id && !events.has(row.event_id)) invalid();
    if (row.resolution_event_id && !events.has(row.resolution_event_id)) invalid();
    if (table === 'goal_work_event_judgments' && (!events.has(row.event_id) || events.get(row.event_id)!.goal_id !== requirements.get(row.requirement_id)!.goal_id)) invalid();
    if (table === 'goal_event_requirement_conclusions' && (!decisions.has(row.decision_id) || decisions.get(row.decision_id)!.goal_id !== row.goal_id)) invalid();
    if (row.scope_json) validateScope(row, JSON.parse(String(row.scope_json)), requirements, events);
  }
  for (const row of rows.goal_event_configs!) {
    if (!rows.goal_event_config_versions!.some(v => v.goal_id === row.goal_id && v.version === row.current_version)) invalid();
  }
  for (const row of rows.goal_event_config_versions!) if (!events.has(row.config_event_id)) invalid();
  for (const row of rows.goal_relations!) {
    if (!goals.has(row.from_goal_id) || !goals.has(row.to_goal_id) || row.from_goal_id === row.to_goal_id) invalid();
    if (!(goalRelationTypes as readonly string[]).includes(String(row.type))) invalid();
  }
  const graphGoals = rows.goals!.map(r => ({ goal_id: String(r.goal_id), trashed_at: r.trashed_at == null ? null : String(r.trashed_at) }));
  const graphRelations = rows.goal_relations!.map(r => ({ relation_id: String(r.relation_id), from_goal_id: String(r.from_goal_id), to_goal_id: String(r.to_goal_id), type: r.type as GoalRelationRecord['type'], state: r.state as GoalRelationRecord['state'] }));
  if (validatePlanningGraph(graphGoals, graphRelations).length) invalid();
  for (const row of rows.goal_event_work_status!) {
    if (!rows.goal_event_state_owners!.some(o => o.goal_id === row.goal_id)) invalid();
    if (row.work_status === 'completed' && !rows.goal_event_closures!.some(c => c.goal_id === row.goal_id && c.completion_applied === 1 && c.kind === 'complete' && c.superseded === 0)) invalid();
  }
}

function validateScope(row: ProjectReplicaRow, value: unknown, requirements: Map<ProjectReplicaRow[string], ProjectReplicaRow>, events: Map<ProjectReplicaRow[string], ProjectReplicaRow>): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const scope = value as Record<string, unknown>;
  for (const [field, map] of [['requirement_ids', requirements], ['event_ids', events]] as const) {
    if (scope[field] === undefined) continue;
    if (!Array.isArray(scope[field]) || (scope[field] as unknown[]).some(id => typeof id !== 'string' || !map.has(id) || map.get(id)!.goal_id !== row.goal_id)) invalid();
  }
}

function invalid(): never { throw errors.replica_invalid('Goal 同步记录的关联无效'); }
