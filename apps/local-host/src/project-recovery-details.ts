/** Finite schema identifiers only. Shared with the network client; no storage/runtime imports. */
export const PROJECT_RECOVERY_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  goal_event_requirements: ['source_json', 'human_decision_required', 'current_status', 'revision', 'support_valid_after_seq'],
  goal_event_applied_decisions: ['effects_json', 'commitment_json', 'authorized_change_json'],
  goal_event_closures: ['expected_agreement_version'],
  goal_event_decision_requests: ['purpose', 'proposed_change_json', 'commitment_json'],
  goal_tree_proposals: ['submitted_session_id'],
  goal_event_trusted_decisions: ['change_json'],
};
export interface ProjectRecoveryDetails {
  missing_migration_ids: number[];
  missing_tables: string[];
  missing_columns: Record<string, string[]>;
}

/** Reject extra keys and arbitrary text instead of forwarding remote error payloads. */
export function parseProjectRecoveryDetails(value: unknown): ProjectRecoveryDetails | undefined {
  const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const subset = <T extends string | number>(x: unknown, allowed: readonly T[]): x is T[] => Array.isArray(x) && x.length <= allowed.length && new Set(x).size === x.length && x.every(item => allowed.includes(item));
  if (!object(value) || Object.keys(value).length !== 3 || Object.keys(value).some(key => !['missing_migration_ids', 'missing_tables', 'missing_columns'].includes(key))) return undefined;
  const {missing_migration_ids: ids, missing_tables: tables, missing_columns: columns} = value;
  if (!subset(ids, Array.from({length: 36}, (_, i) => i + 1)) || !subset(tables, ['schema_migrations', ...Object.keys(PROJECT_RECOVERY_COLUMNS)]) || !object(columns)) return undefined;
  const safeColumns: Record<string, string[]> = {};
  for (const [table, names] of Object.entries(columns)) {
    if (!Object.hasOwn(PROJECT_RECOVERY_COLUMNS, table) || !subset(names, PROJECT_RECOVERY_COLUMNS[table]!) || !names.length || tables.includes(table)) return undefined;
    safeColumns[table] = [...names];
  }
  return {missing_migration_ids: [...ids], missing_tables: [...tables], missing_columns: safeColumns};
}
