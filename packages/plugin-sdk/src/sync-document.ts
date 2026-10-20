import {randomUUID} from 'node:crypto';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { platformErrorKind } from '@molis-ai/molis-work-contracts/platform/actions';
import { syncError } from './sync-errors.js';
import { canonicalDocumentValue, documentKey, newDocumentState, parseDocumentState, type DocumentState } from './sync-document-state.js';
import { documentReplica } from './sync-document-replica.js';

/** One conditional replacement must include business content and its journal, never get + unconditional set. */
export interface SyncDocumentStorage {
  read(): string | null;
  compareAndSet(expected: string | null, value: string): boolean;
  /** Optional file-owner capabilities. Checked replacement and read lock must share the same cross-process mutex. */
  compareAndSetChecked?(expected:string|null,value:string,validate:()=>void):boolean;
  withReadLock?<R>(read:(current:string|null)=>R):R;
}
export interface SyncDocumentOwner<T> {
  spaceId: string;
  storage: SyncDocumentStorage;
  authorize(): void;
  initial(): T;
  validate(value: unknown): T;
  /** Stable object keys and content revision tokens, not previews or device paths. */
  observe(data: T): ReadonlyMap<string, string>;
  /** Portable, self-contained value; immutable bytes must be frozen before returning. */
  read(data: T, key: string): unknown | null;
  /** Only this owner interprets incoming facts. Stage immutable files, then change the document. Never execute. */
  apply(data: T, key: string, value: unknown | null): void;
  canUpload?(data: T, key: string): boolean;
  locate?(data:T,key:string):string|null;
  belongsToProject?(data:T,key:string,projectId:string,retained:readonly import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncMutation[]):boolean;
}
export interface SyncDocument<T> {
  read(): T;
  /** The synchronous callback is run once. A CAS failure rejects, never replays side effects. */
  update<R>(mutate: (data: T) => R): R;
  replica: SyncReplicaAdapter;
}
export interface DocumentAccess<T> {
  owner: SyncDocumentOwner<T>;
  inspect<R>(read: (state: DocumentState<T>) => R): R;
  transaction<R>(write: (state: DocumentState<T>) => R): R;
  mark(state: DocumentState<T>, key: string): void;
}

/** Same atomic document primitive for author private-KV stores and owner JSON files. No private platform dependency. */
export function createSyncDocument<T>(owner: SyncDocumentOwner<T>): SyncDocument<T> {
  documentKey(owner.spaceId);
  if (typeof owner.storage.compareAndSet !== 'function') throw syncError('unsupported', '当前存储没有原子条件写入，未启用同步');
  const load = () => {
    owner.authorize(); const source = owner.storage.read();
    const state = source === null ? newDocumentState(owner.spaceId, owner.validate(owner.initial())) : parseDocumentState(source, owner.spaceId, owner.validate);
    return { source, state };
  };
  const access: DocumentAccess<T> = {
    owner,
    inspect(read) { const { state } = load(), result = read(state); owner.authorize(); return result; },
    transaction(write) {
      const { source, state } = load(), result = write(state);
      state.data = owner.validate(state.data); owner.authorize();
      const value = JSON.stringify(state);
      if (Buffer.byteLength(value) > 500000000) throw syncError('limit', '本机同步目录超过容量保护上限，原内容已保留');
      parseDocumentState(value, owner.spaceId, owner.validate);
      if (!owner.storage.compareAndSet(source, value)) throw syncError('conflict', '本机内容已变化，未提交旧修改');
      return result;
    },
    mark(state, key) {
      documentKey(key);
      if (!Number.isSafeInteger(state.seq + 1)) throw syncError('limit', '同步本机修订超出范围');
      state.changes.push({ key, seq: ++state.seq });
    },
  };
  return {
    read: () => access.inspect(state => structuredClone(state.data)),
    update: mutate => access.transaction(state => {
      const previous=structuredClone(state.data),before = observed(owner.observe(state.data)), result = mutate(state.data);
      if (result && (typeof result === 'object' || typeof result === 'function') && 'then' in result) throw syncError('invalid', '同步目录提交不能异步执行');
      const after = observed(owner.observe(state.data));
      for (const key of new Set([...before.keys(), ...after.keys()])) if (before.get(key) !== after.get(key)) {
        if(before.has(key)&&!after.has(key)){
          const local=documentRead(access,{...state,data:previous},key);
          if(local!==null)state.history.push({id:randomUUID(),key,choice:'local_delete',local,remote:null});
        }
        access.mark(state, key);
      }
      return result;
    }),
    replica: documentReplica(access),
  };
}
function observed(values: ReadonlyMap<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of values) {
    documentKey(key);
    if (typeof value !== 'string' || !value || value.length > 1000) throw syncError('invalid', '资产内容版本无效');
    result.set(key, value);
  }
  return result;
}
export function documentRead<T>(access: DocumentAccess<T>, state: DocumentState<T>, key: string): unknown | null {
  try { const value = access.owner.read(state.data, key); canonicalDocumentValue(value); return structuredClone(value); }
  catch (error) {
    access.owner.authorize();
    const kind=error&&typeof error==='object'?(('kind' in error?error.kind:undefined)??('code' in error&&typeof error.code==='string'?platformErrorKind(error.code):undefined)):undefined;
    if(kind==='unavailable')throw syncError('unavailable','完整同步内容暂时不可用，原内容已保留',{sync_key:key});
    throw syncError('invalid', error instanceof SyntaxError ? '同步内容格式无效，原内容已保留' : '无法读取完整同步内容，原内容已保留', { sync_key: key });
  }
}
export function documentHead<T>(state: DocumentState<T>, key: string): number { return state.heads.find(row => row.key === key)?.revision ?? 0; }
export function documentSetHead<T>(state: DocumentState<T>, key: string, revision: number): void {
  const head = state.heads.find(row => row.key === key);
  if (head) head.revision = Math.max(head.revision, revision); else state.heads.push({ key, revision });
}
