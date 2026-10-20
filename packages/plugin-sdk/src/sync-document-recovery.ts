import { randomUUID } from 'node:crypto';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { syncError } from './sync-errors.js';
import { documentHead, documentRead, documentSetHead, type DocumentAccess } from './sync-document.js';
import type { DocumentState } from './sync-document-state.js';
import { createSyncConflictState } from './sync-conflict.js';

export function documentRecovery<T>(access: DocumentAccess<T>): Pick<SyncReplicaAdapter, 'resolve' | 'inspectConflict' | 'recoveries' | 'inspectRecovery' | 'restoreRecovery'> {
  const { inspect, transaction, owner } = access;
  const comparison=(state:DocumentState<T>,key:string,event:import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncEvent,local:unknown)=>createSyncConflictState(event,local,state.changes.reduce((seq,row)=>row.key===key?Math.max(seq,row.seq):seq,0));
  return {
    inspectConflict: key => inspect(state => {
      const row = state.conflicts.find(conflict => conflict.event.key === key);
      if(!row)return null;const local=documentRead(access,state,key);
      return { key, revision: row.event.revision, state:comparison(state,key,row.event,local),reason: row.reason, local, remote: structuredClone(row.event.value) };
    }),
    resolve: (key, choice, expectedRevision, expectedState) => transaction(state => {
      const row = state.conflicts.find(conflict => conflict.event.key === key);
      if (!row || row.waiting || !['local', 'remote'].includes(choice) || row.event.revision !== expectedRevision) throw syncError('conflict', '冲突版本已变化或尚待关联资产，请重新查看');
      if(expectedState!==undefined&&comparison(state,key,row.event,documentRead(access,state,key))!==expectedState)throw syncError('conflict','比较内容已变化，请重新查看');
      preserve(access, state, key, choice, row.event.value);
      if (choice === 'remote') owner.apply(state.data, key, structuredClone(row.event.value));
      state.changes = state.changes.filter(change => change.key !== key);
      state.outbox = state.outbox.filter(out => out.operation.key !== key);
      state.conflicts = state.conflicts.filter(conflict => conflict.event.key !== key);
      documentSetHead(state, key, row.event.revision);
      if (choice === 'local') access.mark(state, key);
    }),
    recoveries: () => inspect(state => state.history.slice(-50).reverse().map(row => ({ id: row.id, key: row.key, choice: row.choice, revision: documentHead(state, row.key) }))),
    inspectRecovery: id => inspect(state => {
      const row = state.history.find(history => history.id === id);
      return row ? { ...structuredClone(row), revision: documentHead(state, row.key) } : null;
    }),
    restoreRecovery: (id, choice, expectedRevision) => transaction(state => {
      const row = state.history.find(history => history.id === id);
      if (!row || !['local', 'remote'].includes(choice) || !Number.isSafeInteger(expectedRevision)) throw syncError('invalid', '恢复记录或选择无效');
      const key = row.key;
      const localUndo=row.choice==='local_delete'&&choice==='local'&&documentRead(access,state,key)===null;
      if (documentHead(state, key) !== expectedRevision || !localUndo&&state.changes.some(change => change.key === key) || state.outbox.some(out => out.operation.key === key) || state.conflicts.some(conflict => conflict.event.key === key)) throw syncError('conflict', '此资产已有新修改或待处理内容，请重新查看');
      preserve(access, state, key, 'restore_' + choice, row.remote);
      owner.apply(state.data, key, structuredClone(choice === 'local' ? row.local : row.remote));
      access.mark(state, key);
    }),
  };
}
function preserve<T>(access: DocumentAccess<T>, state: DocumentState<T>, key: string, choice: string, remote: unknown): void {
  state.history.push({ id: randomUUID(), key, choice, local: documentRead(access, state, key), remote: structuredClone(remote) });
}
