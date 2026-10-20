import type { SyncDocumentStorage } from '@molis-ai/molis-work-plugin-sdk';
import type { CatalogFile } from './catalog-shape.js';
import { shelfErrors } from './errors.js';

/** Keep device settings at their existing top-level location. Only the logical document is presented to the shared SDK. */
export function shelfDocumentStorage(storage: SyncDocumentStorage, validate: (value: unknown) => CatalogFile, verify?:(next:CatalogFile,previous:CatalogFile|null)=>void): SyncDocumentStorage {
  let observed: { physical: string | null; logical: string | null; data:CatalogFile|null } | undefined;
  return {
    read() {
      observed = undefined;
      const physical = storage.read();
      if (physical === null) { observed = { physical, logical: null,data:null }; return null; }
      let raw: unknown;
      try { raw = JSON.parse(physical); } catch { throw shelfErrors.invalid_file('Shelf 目录格式无效，原文件已保留'); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('replication' in raw)
        || !raw.replication || typeof raw.replication !== 'object' || Array.isArray(raw.replication)
        || Object.hasOwn(raw.replication, 'data')) throw shelfErrors.invalid_file('Shelf 目录不是当前个人空间的同步格式，原文件已保留');
      const { replication, ...data } = raw;
      const logical = JSON.stringify({ ...replication, data: validate(data) });
      observed = { physical, logical,data:validate(data) }; return logical;
    },
    compareAndSet(expected, next) {
      const prior = observed; observed = undefined;
      if (!prior || prior.logical !== expected) throw shelfErrors.conflict('Shelf 目录读取前提已变化，请重新查看');
      const value: unknown = JSON.parse(next);
      if (!value || typeof value !== 'object' || Array.isArray(value) || !('data' in value)) throw shelfErrors.invalid_file('Shelf 条件文档格式无效');
      const { data, ...replication } = value;
      const nextData=validate(data),encoded=JSON.stringify({...nextData,replication});
      return storage.compareAndSetChecked?storage.compareAndSetChecked(prior.physical,encoded,()=>verify?.(nextData,prior.data)):storage.compareAndSet(prior.physical,encoded);
    },
  };
}
