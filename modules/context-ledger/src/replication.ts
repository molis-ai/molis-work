import type { ProjectReplicaDefinition, ProjectReplicaRows } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { RELATION_EDGES_REPLICA_ID, type ObjectRef } from '@molis-ai/molis-work-contracts/modules/context-ledger';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import { sameRef } from './service.js';

const errors = defineErrorCodes('context_ledger', { replica_invalid: 'invalid' });
const VALID_MODULES = new Set(['artifacts', 'private-work-context', 'projects', 'assistant', 'plugins', 'agent-host']);
const VALID_STATES = new Set(['active', 'removed']);

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validTimestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));

function parseRef(raw: unknown): ObjectRef {
  if (typeof raw !== 'string') invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { invalid(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid();
  return parsed as ObjectRef;
}

const quoted = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const ownedBy = (row: string, column: "source_json" | "target_json", pluginId: string) =>
  `(json_extract(${row}${column},'$.module')='plugins' AND json_extract(${row}${column},'$.plugin_id')=${quoted(pluginId)})`;

/**
 * The relations that touch one plugin's own objects (`relation-edges` in that plugin's sync sections, batch 44 C6): an edge either end of
 * which is an object of `pluginId`, carried by its collection `kind`. Relations among other plugins' objects, or of private execution
 * context, stay with their owners.
 */
export function relationEdgesReplicationDefinition(kind: string, pluginId: string): ProjectReplicaDefinition {
  const touches = (row: string) => `(${ownedBy(row, 'source_json', pluginId)} OR ${ownedBy(row, 'target_json', pluginId)})`;
  return {
    id: RELATION_EDGES_REPLICA_ID,
    assetKind: kind,
    tables: [{ name: 'context_edges', columns: ['scope_kind', 'scope_id', 'edge_key', 'revision', 'relation_type', 'source_json', 'target_json', 'actor_id', 'cause', 'recorded_at', 'state'],
      keys: ['scope_kind', 'scope_id', 'edge_key', 'revision'], projectColumn: 'scope_id',
      journalCondition: `$row.scope_kind='personal' AND ${touches('$row.')}`,
      where: `scope_kind='personal' AND scope_id=? AND ${touches('')}` }],
    journalTypes: [], receiptOperations: [], sequenceFields: [], validate: (rows, projectId) => validateEdges(rows, projectId, pluginId),
  };
}

/** A trigger condition on `context_edges` (`NEW` or `OLD`) for the same edges, as a plugin's sync baseline marks them. */
export function relationEdgesTriggerCondition(row: 'NEW' | 'OLD', pluginId: string): string {
  return `${row}.scope_kind='personal' AND (${ownedBy(row + '.', 'source_json', pluginId)} OR ${ownedBy(row + '.', 'target_json', pluginId)})`;
}

function validateEdges(rows: ProjectReplicaRows, projectId: string, pluginId: string): void {
  const seen = new Map<string, { revision: number; relationType: string; source: ObjectRef }>();
  for (const row of rows.context_edges!) {
    if (row.scope_kind !== 'personal' || row.scope_id !== projectId
      || !nonEmpty(row.edge_key) || !nonEmpty(row.relation_type) || !nonEmpty(row.actor_id) || !nonEmpty(row.cause)
      || typeof row.state !== 'string' || !VALID_STATES.has(row.state) || !validTimestamp(row.recorded_at)) invalid();
    const source = parseRef(row.source_json);
    const target = parseRef(row.target_json);
    const refs = [source, target];
    if (!refs.some(ref => ref.module === 'plugins' && ref.plugin_id === pluginId)) invalid();
    for (const ref of refs) {
      if (!VALID_MODULES.has(ref.module)
        || typeof ref.id !== 'string' || !ref.id.trim() || ref.scope?.kind !== 'personal' || ref.scope.id !== projectId
        || (ref.project_id != null && ref.project_id !== projectId)
        || (ref.plugin_id !== undefined && (ref.module !== 'plugins' || typeof ref.plugin_id !== 'string' || !ref.plugin_id.trim()))
        || (ref.version !== null && (!Number.isSafeInteger(ref.version) || ref.version < 1))
        || (ref.module === 'artifacts' && ref.version === null)) invalid();
    }
    const edgeKey = row.edge_key;
    const previous = seen.get(edgeKey);
    const last = previous?.revision ?? 0;
    if (!Number.isSafeInteger(row.revision) || row.revision !== last + 1) invalid();
    if (previous && (row.relation_type !== previous.relationType || !sameRef(source, previous.source))) invalid();
    seen.set(edgeKey, { revision: Number(row.revision), relationType: row.relation_type, source });
  }
}
function invalid(): never { throw errors.replica_invalid('同步的关联边引用的归属或版本无效'); }
