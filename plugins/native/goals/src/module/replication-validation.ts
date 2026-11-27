import type { ProjectReplicaRows, ProjectReplicaRow } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { goalRelationTypes, type GoalRelationRecord } from '../contract/goals.js';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import { validatePlanningGraph } from './planning/goal-graph.js';
import { GOAL_CONCERN_CITED_SUBJECT_LIMIT } from '../contract/goal-event-state.js';

const errors = defineErrorCodes('goals', { replica_invalid: 'invalid' });

export function validateGoalReplication(rows: ProjectReplicaRows, _projectId: string): void {
  // The board is its library's one row (`id` 1, batch 109-1): the library is one project's, so the row names no project to check.
  const roots = rows.boards!;
  if (roots.length !== 1 || roots[0]!.id !== 1) invalid();
  const goals = new Map(rows.goals!.map(row => [row.goal_id, row]));
  if (roots[0]!.active_goal_id !== null && !goals.has(roots[0]!.active_goal_id)) invalid();
  const events = new Map(rows.goal_work_events!.map(row => [row.event_id, row]));
  // Requirements live on the platform's acceptance now, so a Goal may bind or scope one added there (or an original
  // acceptance criterion) without a row in `goal_requirement_links`, and two Goals may share the same custom `requirement_id`.
  const requirementLinks = new Set<string>();
  for (const row of rows.goal_requirement_links!) {
    if (typeof row.goal_id !== 'string' || !goals.has(row.goal_id)) invalid();
    if (typeof row.requirement_id !== 'string' || !row.requirement_id.trim()) invalid();
    const key = `${row.goal_id}\u0000${row.requirement_id}`;
    if (requirementLinks.has(key)) invalid();
    requirementLinks.add(key);
  }
  for (const [table, list] of Object.entries(rows)) for (const row of list) {
    if (table !== 'goals' && row.goal_id !== undefined && row.goal_id !== null && !goals.has(row.goal_id)) invalid();
    if (row.requirement_id !== undefined && (typeof row.requirement_id !== 'string' || !row.requirement_id.trim())) invalid();
    if (table.startsWith('goal_event_') && row.event_id && !events.has(row.event_id)) invalid();
    if (row.resolution_event_id && !events.has(row.resolution_event_id)) invalid();
    if (table === 'goal_event_closures' && row.acceptance_round != null && !(Number.isSafeInteger(row.acceptance_round) && Number(row.acceptance_round) >= 0)) invalid();
    if (row.scope_json) validateScope(row, parseJson(row.scope_json), events);
    if (table === 'goal_event_concerns') validateCitedSubjects(row.cited_subjects_json);
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

function parseJson(value: ProjectReplicaRow[string]): unknown {
  try { return JSON.parse(String(value)); } catch { invalid(); }
}

function validateScope(row: ProjectReplicaRow, value: unknown, events: Map<ProjectReplicaRow[string], ProjectReplicaRow>): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const scope = value as Record<string, unknown>;
  if (scope.requirement_ids !== undefined) {
    if (!Array.isArray(scope.requirement_ids) || (scope.requirement_ids as unknown[]).some(id => typeof id !== 'string' || !id.trim())) invalid();
  }
  if (scope.event_ids !== undefined) {
    if (!Array.isArray(scope.event_ids) || (scope.event_ids as unknown[]).some(id => typeof id !== 'string' || !events.has(id) || events.get(id)!.goal_id !== row.goal_id)) invalid();
  }
}

/** A concern's cited objects as Goals writes them (event-state-concerns.ts `citedSubjectsOf`): a JSON list of at most
 * GOAL_CONCERN_CITED_SUBJECT_LIMIT distinct `{kind, id}`, both nonempty text with no space around it. */
function validateCitedSubjects(value: ProjectReplicaRow[string]): void {
  let list: unknown;
  try { list = JSON.parse(String(value)); } catch { invalid(); }
  if (!Array.isArray(list) || list.length > GOAL_CONCERN_CITED_SUBJECT_LIMIT) invalid();
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => key !== 'kind' && key !== 'id')) invalid();
    const { kind, id } = item as Record<string, unknown>;
    if (typeof kind !== 'string' || !kind || kind.trim() !== kind || typeof id !== 'string' || !id || id.trim() !== id) invalid();
    const key = JSON.stringify([kind, id]);
    if (seen.has(key)) invalid();
    seen.add(key);
  }
}

function invalid(): never { throw errors.replica_invalid('Goal 同步记录的关联无效'); }

