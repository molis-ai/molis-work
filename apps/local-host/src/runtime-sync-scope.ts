import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SyncMutation, SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';

export interface RuntimeSyncScope { spaceId: string; projectId: string | null }
const invalid = () => new ActionError('actions.input_invalid', '同步插件内容与当前空间或项目不匹配');
export function runtimeSyncKey(key: string): { projectId: string | null; key: string } {
  let value: unknown;
  try { value = JSON.parse(key); } catch { throw invalid(); }
  if (!Array.isArray(value) || value.length !== 2 || (value[0] !== null && (typeof value[0] !== 'string' || !value[0] || value[0].length > 80))
    || typeof value[1] !== 'string' || !value[1] || key.length > 500 || JSON.stringify(value) !== key) throw invalid();
  return { projectId: value[0], key: value[1] };
}
export function runtimeSyncValue(scope: RuntimeSyncScope, value: unknown): unknown {
  if (value === null) return null;
  return { sync_runtime: 1, spaceId: scope.spaceId, projectId: scope.projectId, value };
}
export function readRuntimeSyncValue(scope: RuntimeSyncScope, value: unknown): unknown {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'projectId,spaceId,sync_runtime,value'
    || !('sync_runtime' in value) || value.sync_runtime !== 1 || !('spaceId' in value) || value.spaceId !== scope.spaceId
    || !('projectId' in value) || value.projectId !== scope.projectId || !('value' in value) || value.value === null) throw invalid();
  return value.value;
}

/** Host-only namespacing. The owner receives its original key/value and never a request-selected project identity. */
export function scopeRuntimeReplica(source: SyncReplicaAdapter, scope: RuntimeSyncScope): SyncReplicaAdapter {
  const wrapKey = (key: string) => { const wire = JSON.stringify([scope.projectId, key]); runtimeSyncKey(wire); return wire; };
  const localKey = (key: string) => { const parsed = runtimeSyncKey(key); if (parsed.projectId !== scope.projectId) throw invalid(); return parsed.key; };
  const mutation = (value: SyncMutation) => ({ ...value, key: wrapKey(value.key), value: runtimeSyncValue(scope, value.value) });
  return {
    next(options) {
      const excludeKeys = options?.excludeKeys?.flatMap(key => { const parsed = runtimeSyncKey(key); return parsed.projectId === scope.projectId ? [parsed.key] : []; });
      const next = source.next({ ...options, excludeKeys }); return next ? mutation(next) : null;
    },
    ...(source.maintain?{maintain:()=>source.maintain!()}:{}),
    ...(source.locate?{locate:(key:string)=>source.locate!(localKey(key))}:{}),
    acknowledge: (key, id, revision) => source.acknowledge(localKey(key), id, revision),
    receive: (event, options) => source.receive({ ...event, key: localKey(event.key), value: readRuntimeSyncValue(scope, event.value) }, options),
    cursor: () => source.cursor(), counts: () => source.counts(), conflicts: () => source.conflicts().map(row => ({ ...row, key: wrapKey(row.key) })),
    resolve: (key, choice, revision, state) => source.resolve(localKey(key), choice, revision, state),
    ...(source.retryWaiting ? { retryWaiting: () => source.retryWaiting!() } : {}),
    ...(source.inspectConflict ? { inspectConflict(key: string) { const value = source.inspectConflict!(localKey(key)); return value ? { ...value, key, local:runtimeSyncValue(scope,value.local),remote:runtimeSyncValue(scope,value.remote) } : null; } } : {}),
    ...(source.recoveries ? { recoveries: () => source.recoveries!().map(row => ({ ...row, key: wrapKey(row.key) })) } : {}),
    ...(source.inspectRecovery ? { inspectRecovery(id: string) { const value = source.inspectRecovery!(id); return value ? { ...value, key: wrapKey(value.key),local:runtimeSyncValue(scope,value.local),remote:runtimeSyncValue(scope,value.remote) } : null; } } : {}),
    ...(source.restoreRecovery ? { restoreRecovery: (id: string, choice: 'local' | 'remote', revision: number) => source.restoreRecovery!(id, choice, revision) } : {}),
  };
}
