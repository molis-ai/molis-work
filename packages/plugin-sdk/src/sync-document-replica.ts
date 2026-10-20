import type { SyncEvent, SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { DocumentAccess } from './sync-document.js';
import type { DocumentState } from './sync-document-state.js';
import { canonicalDocumentValue, documentEvent, documentKey } from './sync-document-state.js';
import { documentHead, documentRead, documentSetHead } from './sync-document.js';
import { documentRecovery } from './sync-document-recovery.js';
import { syncError } from './sync-errors.js';

export function documentReplica<T>(access: DocumentAccess<T>): SyncReplicaAdapter {
  const { owner, transaction, inspect } = access;
  return {
    ...documentRecovery(access),
    cursor: () => inspect(state => state.cursor),
    ...(owner.locate?{locate:(key:string)=>inspect(state=>{documentKey(key);return owner.locate!(state.data,key);})}:{}),
    hasProjectChanges: projectId => inspect(state => {
      if(typeof projectId!=='string'||!projectId||projectId.length>500)throw syncError('invalid','项目同步范围无效');
      if(!owner.belongsToProject)throw syncError('unsupported','此文档尚未声明项目归属，原件已保留');
      const keys=new Set([...state.changes.map(row=>row.key),...state.outbox.map(row=>row.operation.key),...state.conflicts.map(row=>row.event.key)]);
      return [...keys].some(key=>{
        const retained=[...state.outbox.filter(row=>row.operation.key===key).map(row=>row.operation),...state.conflicts.filter(row=>row.event.key===key).map(row=>row.event)];
        const result=owner.belongsToProject!(state.data,key,projectId,retained);if(typeof result!=='boolean')throw syncError('invalid','文档项目归属无效');return result;
      });
    }),
    counts: () => inspect(state => ({ pending: new Set([...state.changes.map(row => row.key),...state.outbox.map(row=>row.operation.key)]).size, conflicts: state.conflicts.length })),
    conflicts: () => inspect(state => state.conflicts.slice(0, 100).map(row => ({ key: row.event.key, reason: row.reason, waiting: row.waiting }))),
    next: options => transaction(state => {
      const eligible = (key: string) => !options?.excludeKeys?.includes(key) && !state.conflicts.some(row => row.event.key === key) && owner.canUpload?.(state.data, key) !== false;
      const frozen = state.outbox.find(row => eligible(row.operation.key) && (!options?.deletionsOnly || row.operation.value === null));
      if (frozen) return structuredClone(frozen.operation);
      const candidates = [...state.changes].sort((a, b) => a.seq - b.seq).filter(row => eligible(row.key) && !state.outbox.some(out => out.operation.key === row.key));
      for (const { key } of candidates) {
        const value = documentRead(access, state, key);
        if (options?.deletionsOnly && value !== null) continue;
        const through = state.changes.reduce((max, row) => row.key === key ? Math.max(max, row.seq) : max, 0);
        const operation = { operationId: state.device + ':' + through, key, base: documentHead(state, key), value };
        state.outbox.push({ through, operation }); return structuredClone(operation);
      }
      return null;
    }),
    acknowledge: (key, operationId, revision) => transaction(state => {
      documentKey(key);
      if (!Number.isSafeInteger(revision) || revision < 1) throw syncError('invalid', '同步回执修订无效');
      const out = state.outbox.find(row => row.operation.key === key);
      if (!out) { if (documentHead(state, key) >= revision) return; throw syncError('conflict', '没有匹配的冻结上传'); }
      if (out.operation.operationId !== operationId || revision <= out.operation.base) throw syncError('invalid', '同步回执与冻结上传不一致');
      settle(state, key, out.through, revision);
    }),
    receive: (input, options) => transaction(state => {
      const event = documentEvent(input), head = documentHead(state, event.key);
      if (state.conflicts.some(row => row.event.key === event.key && row.event.revision > event.revision)) return;
      if (event.revision <= state.cursor && (!options?.retry || event.revision <= head)) return;
      if (event.revision > head) {
        const out = state.outbox.find(row => row.operation.key === event.key);
        if (out?.operation.operationId === event.operationId) {
          const { revision, ...mutation } = event;
          if (canonicalDocumentValue(out.operation) !== canonicalDocumentValue(mutation)) throw syncError('invalid', '同步回执内容与冻结上传不一致');
          settle(state, event.key, out.through, revision);
        } else applyIncoming(access, state, event);
      }
      state.cursor = Math.max(state.cursor, event.revision);
    }),
    retryWaiting: () => transaction(state => {
      // Bounded. A later cycle can retry the remaining records without dropping any.
      for (const row of state.conflicts.filter(conflict => conflict.waiting).slice(0, 20)) applyIncoming(access, state, row.event);
    }),
  };
}
function settle<T>(state: DocumentState<T>, key: string, through: number, revision: number): void {
  state.changes = state.changes.filter(row => row.key !== key || row.seq > through);
  state.outbox = state.outbox.filter(row => row.operation.key !== key);
  documentSetHead(state, key, revision);
}
function applyIncoming<T>(access: DocumentAccess<T>, state: DocumentState<T>, event: SyncEvent): void {
  const prior = state.conflicts.find(row => row.event.key === event.key);
  if (state.changes.some(row => row.key === event.key) || (prior && !prior.waiting)) {
    conflict(state, event, '两台设备修改了同一项，双方内容均已保留', false); return;
  }
  const data = structuredClone(state.data);
  try {
    access.owner.apply(data, event.key, structuredClone(event.value)); access.owner.validate(data); access.owner.authorize();
    state.data = data; documentSetHead(state, event.key, event.revision);
    state.conflicts = state.conflicts.filter(row => row.event.key !== event.key);
  } catch (error) {
    access.owner.authorize();
    const waiting = !!error && typeof error === 'object' && 'details' in error && !!error.details && typeof error.details === 'object' && 'sync_waiting' in error.details && error.details.sync_waiting === true;
    conflict(state, event, waiting ? '关联资产尚未就绪，原内容已保留' : '同步内容未能通过所有者校验，原内容已保留', waiting);
  }
}
function conflict<T>(state: DocumentState<T>, event: SyncEvent, reason: string, waiting: boolean): void {
  state.conflicts = state.conflicts.filter(row => row.event.key !== event.key);
  state.conflicts.push({ event: structuredClone(event), reason, waiting });
}
