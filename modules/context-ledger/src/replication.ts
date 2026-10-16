import type { ProjectReplicaDefinition, ProjectReplicaRows } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { ObjectRef } from '@molis-ai/molis-work-contracts/modules/context-ledger';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';

const errors = defineErrorCodes('context_ledger', { replica_invalid: 'invalid' });

/** Only Goal-associated edges; unrelated plugin/private execution context stays on its owner. */
export function goalContextReplicationDefinition(): ProjectReplicaDefinition {
  return {
    id: 'goal_context',
    tables: [{ name: 'context_edges', columns: ['scope_kind', 'scope_id', 'edge_key', 'revision', 'relation_type', 'source_json', 'target_json', 'actor_id', 'cause', 'recorded_at', 'state'],
      keys: ['scope_kind', 'scope_id', 'edge_key', 'revision'], projectColumn: 'scope_id',
      journalCondition: "$row.scope_kind='personal' AND (json_extract($row.source_json,'$.module')='goals' OR json_extract($row.target_json,'$.module')='goals')",
      where: "scope_kind='personal' AND scope_id=? AND (json_extract(source_json,'$.module')='goals' OR json_extract(target_json,'$.module')='goals')" }],
    journalTypes: [], receiptOperations: [], sequenceFields: [], validate: validateEdges,
  };
}
function validateEdges(rows: ProjectReplicaRows, projectId: string): void {
  const revisions = new Map<string, number>();
  for (const row of rows.context_edges!) {
    if (row.scope_kind !== 'personal' || row.scope_id !== projectId || !row.edge_key || !row.relation_type || !row.actor_id || !row.cause) invalid();
    const refs = [JSON.parse(String(row.source_json)), JSON.parse(String(row.target_json))] as ObjectRef[];
    if (!refs.some(ref => ref.module === 'goals')) invalid();
    for (const ref of refs) {
      if (!ref || !['goals', 'artifacts', 'feed', 'private-work-context', 'projects', 'assistant', 'plugins'].includes(ref.module)
        || typeof ref.id !== 'string' || !ref.id.trim() || ref.scope?.kind !== 'personal' || ref.scope.id !== projectId
        || (ref.project_id != null && ref.project_id !== projectId)
        || (ref.version !== null && (!Number.isSafeInteger(ref.version) || ref.version < 1))
        || (ref.module === 'artifacts' && ref.version === null)) invalid();
    }
    const last = revisions.get(String(row.edge_key)) ?? 0;
    if (!Number.isSafeInteger(row.revision) || row.revision !== last + 1) invalid();
    revisions.set(String(row.edge_key), Number(row.revision));
  }
}
function invalid(): never { throw errors.replica_invalid('Goal 同步引用的归属或版本无效'); }
