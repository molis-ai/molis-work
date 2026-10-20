import { randomUUID } from 'node:crypto';
import type { SyncEvent, SyncMutation } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { syncError } from './sync-errors.js';

export interface DocumentConflict { event: SyncEvent; reason: string; waiting: boolean }
export interface DocumentRecovery { id: string; key: string; choice: string; local: unknown; remote: unknown }
export interface DocumentState<T> {
  version: 2; spaceId: string; device: string; seq: number; cursor: number; data: T;
  changes: { key: string; seq: number }[];
  heads: { key: string; revision: number }[];
  outbox: { through: number; operation: SyncMutation }[];
  conflicts: DocumentConflict[];
  history: DocumentRecovery[];
}
export function canonicalDocumentValue(value: unknown): string {
  const ancestors = new Set<object>(); let count = 0;
  const sort = (input: unknown, depth = 0): unknown => {
    if (++count > 1000000 || depth > 100) throw syncError('limit', '同步内容结构超过保护范围');
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (!input || typeof input !== 'object' || ancestors.has(input)
      || (!Array.isArray(input) && ![Object.prototype, null].includes(Object.getPrototypeOf(input)))) throw syncError('invalid', '同步内容须为完整 JSON 值');
    ancestors.add(input);
    const result: unknown = Array.isArray(input) ? Array.from(input, item => sort(item, depth + 1))
      : Object.fromEntries(Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, sort(item, depth + 1)]));
    ancestors.delete(input); return result;
  };
  const encoded = JSON.stringify(sort(value));
  if (encoded === undefined || Buffer.byteLength(encoded) > 100000000) throw syncError('limit', '同步资产超过内容上限');
  return encoded;
}
export function documentKey(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 500) throw syncError('invalid', '同步资产标识无效');
}
export function documentEvent(value: unknown): SyncEvent {
  const row = record(value);
  if (Object.keys(row).sort().join(',') !== 'base,key,operationId,revision,value') throw syncError('invalid', '同步事件格式无效');
  mutation(row);
  if (!integer(row.revision, 1) || Number(row.revision) <= Number(row.base)) throw syncError('invalid', '同步事件修订无效');
  return { operationId: String(row.operationId), key: String(row.key), base: Number(row.base), revision: Number(row.revision), value: structuredClone(row.value) };
}
export function newDocumentState<T>(spaceId: string, data: T): DocumentState<T> {
  return { version: 2, spaceId, device: randomUUID(), seq: 0, cursor: 0, data,
    changes: [], heads: [], outbox: [], conflicts: [], history: [] };
}

/** Strict current local format. Malformed input is never rewritten as an empty document. */
export function parseDocumentState<T>(source: string, spaceId: string, validate: (value: unknown) => T): DocumentState<T> {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw syncError('invalid', '同步目录格式无效，原文件已保留'); }
  const row = record(value);
  if (Object.keys(row).sort().join(',') !== 'changes,conflicts,cursor,data,device,heads,history,outbox,seq,spaceId,version'
    || row.version !== 2 || typeof row.device !== 'string' || !row.device || !integer(row.seq) || !integer(row.cursor)) throw syncError('invalid', '同步目录格式版本无效');
  if (row.spaceId !== spaceId) throw syncError('scope', '同步目录不属于当前空间');
  const changes = rows(row.changes), heads = rows(row.heads), outbox = rows(row.outbox), conflicts = rows(row.conflicts), history = rows(row.history);
  const seen = new Set<number>();
  for (const entry of changes) {
    exact(entry, ['key', 'seq']); documentKey(entry.key);
    if (!integer(entry.seq, 1) || Number(entry.seq) > Number(row.seq) || seen.has(Number(entry.seq))) throw syncError('invalid', '同步变更序号无效');
    seen.add(Number(entry.seq));
  }
  unique(heads, entry => { exact(entry, ['key', 'revision']); documentKey(entry.key); if (!integer(entry.revision, 1)) throw syncError('invalid', '同步资产修订无效'); return entry.key; });
  unique(outbox, entry => {
    exact(entry, ['operation', 'through']); const operation = record(entry.operation); exact(operation, ['operationId', 'key', 'base', 'value']); mutation(operation);
    if (!integer(entry.through, 1) || Number(entry.through) > Number(row.seq) || !changes.some(change => change.key === operation.key && Number(change.seq) <= Number(entry.through))) throw syncError('invalid', '同步冻结前缀无效');
    return String(operation.key);
  });
  unique(conflicts, entry => {
    exact(entry, ['event', 'reason', 'waiting']); const event = documentEvent(entry.event);
    if (typeof entry.reason !== 'string' || entry.reason.length > 1000 || typeof entry.waiting !== 'boolean') throw syncError('invalid', '同步冲突格式无效');
    return event.key;
  });
  unique(history, entry => { exact(entry, ['id', 'key', 'choice', 'local', 'remote']); documentKey(entry.key);
    if (typeof entry.id !== 'string' || !entry.id || !['local', 'remote', 'restore_local', 'restore_remote', 'local_delete'].includes(String(entry.choice))) throw syncError('invalid', '同步恢复记录无效'); return entry.id; });
  const data = validate(structuredClone(row.data));
  return { ...row, data } as DocumentState<T>;
}
function mutation(row: Record<string, unknown>): void {
  documentKey(row.key);
  if (typeof row.operationId !== 'string' || !row.operationId || row.operationId.length > 200 || !integer(row.base)
    || !Object.hasOwn(row, 'value')) throw syncError('invalid', '同步操作格式无效');
  canonicalDocumentValue(row.value);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw syncError('invalid', '同步目录格式无效');
  return value as Record<string, unknown>;
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 100000) throw syncError('limit', '同步目录记录超出范围');
  return value.map(record);
}
function integer(value: unknown, minimum = 0): boolean { return Number.isSafeInteger(value) && Number(value) >= minimum; }
function exact(row: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(row).sort().join(',') !== [...keys].sort().join(',')) throw syncError('invalid', '同步目录包含未知字段');
}
function unique(input: Record<string, unknown>[], key: (row: Record<string, unknown>) => string): void {
  const seen = new Set<string>();
  for (const row of input) { const id = key(row); if (seen.has(id)) throw syncError('invalid', '同步目录包含重复记录'); seen.add(id); }
}
