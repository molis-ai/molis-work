import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { RuntimeSyncCollection } from '@molis-ai/molis-work-plugin-runtime';
import { partitionedReplica, syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { readRuntimeSyncValue, runtimeSyncKey, runtimeSyncValue, scopeRuntimeReplica } from './runtime-sync-scope.js';

export interface RuntimeSyncOwner { projectId: string | null; binding: RuntimeSyncCollection }

/** A shared collection namespace with independent owner journals in each already installed scope. */
export function runtimeSyncRegistration(home: string, spaceId: string, owners: readonly RuntimeSyncOwner[], authorize: () => void): SyncRegistration {
  const first = owners[0]; if (!first) throw new ActionError('actions.input_invalid', '同步集合缺少运行实例');
  const identity = first.binding;
  const selection = { plugin_id: identity.plugin_id, publisher_id: identity.publisher_id, publisher_signature: identity.publisher_signature,
    collection_id: identity.collection.id, schema_version: identity.collection.schema_version };
  const byScope = new Map<string, RuntimeSyncOwner>();
  for (const owner of owners) {
    const key = JSON.stringify(owner.projectId), binding = owner.binding;
    if (byScope.has(key) || binding.plugin_id !== selection.plugin_id || binding.publisher_id !== selection.publisher_id
      || binding.publisher_signature !== selection.publisher_signature || binding.collection.id !== selection.collection_id
      || binding.collection.schema_version !== selection.schema_version || dependencies(binding) !== dependencies(identity)) throw new ActionError('actions.input_invalid', '同步运行实例的集合身份不一致');
    byScope.set(key, owner);
  }
  const owner = (partition: string) => {
    authorize(); const value = byScope.get(partition);
    if (!value?.binding.available()) throw new ActionError('actions.plugin_unavailable', '当前项目的同步插件尚未安装、启用或已停止');
    return value;
  };
  const scope = (key: string) => { const parsed = runtimeSyncKey(key), current = owner(JSON.stringify(parsed.projectId)); return { ...parsed, binding: current.binding, spaceId }; };
  return {
    selection, title: identity.collection.title,
    dependencies: identity.dependencies.map(collection => ({ ...selection, collection_id: collection.id, schema_version: collection.schema_version })),
    available: () => owners.some(row => row.binding.available()), refresh: async () => authorize(),
    withReplica(run) { authorize(); if(!owners.some(row=>row.binding.available()))throw new ActionError('actions.plugin_unavailable','同步插件实例已停止'); return run({...partitionedReplica({ home, namespace: syncNamespace(selection), authorize,
      partitions: () => { authorize(); return [...byScope].filter(([, row]) => row.binding.available()).map(([id]) => id); },
      partition: key => JSON.stringify(runtimeSyncKey(key).projectId), projectPartition:id=>JSON.stringify(id),
      withPartition(id, operation) { const current = owner(id); return operation(scopeRuntimeReplica(current.binding.replica, { spaceId, projectId: current.projectId })); },
    }),hasProjectChanges(projectId){
      authorize();const target=JSON.stringify(projectId),home=byScope.get('null');
      if(byScope.has(target)){const counts=owner(target).binding.replica.counts();if(counts.pending||counts.conflicts){authorize();return true;}}
      else if(!home)throw new ActionError('actions.plugin_unavailable','项目插件的被动检查尚不可用');
      if(home){const replica=owner('null').binding.replica;if(!replica.hasProjectChanges)throw new ActionError('actions.plugin_unavailable','Home 插件尚未声明项目归属');const dirty=replica.hasProjectChanges(projectId);authorize();return dirty;}
      authorize();return false;
    }}); },
    content: {
      encode(key, input) {
        const current = scope(key), value = readRuntimeSyncValue(current, input);
        const encoded = current.binding.content?.encode(current.key, value) ?? { value, blobs: [] };
        authorize(); return { value: runtimeSyncValue(current, encoded.value), blobs: encoded.blobs };
      },
      async decode(key, input, read) {
        const current = scope(key), value = readRuntimeSyncValue(current, input);
        const decoded = current.binding.content ? await current.binding.content.decode(current.key, value, read) : value;
        authorize(); if (!current.binding.available()) throw new ActionError('actions.plugin_unavailable', '同步插件实例已停止');
        return runtimeSyncValue(current, decoded);
      },
    },
    async prepare(event) { const current = scope(event.key); readRuntimeSyncValue(current, event.value); authorize(); },
  };
}
function dependencies(binding: RuntimeSyncCollection): string {
  return JSON.stringify(binding.dependencies.map(row => [row.id, row.schema_version]).sort(([a], [b]) => String(a).localeCompare(String(b))));
}
