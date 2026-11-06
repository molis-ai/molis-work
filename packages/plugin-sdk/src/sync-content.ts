import { createHash } from 'node:crypto';
import type { SyncBlobReference, SyncBlobSource, SyncContentCodec } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { syncError } from './sync-errors.js';

const PART = 1024 * 1024, MAX = 100000000, INLINE = 64 * 1024;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw syncError('invalid', '同步内容格式无效');
  return value as Record<string, unknown>;
}
function reference(value: unknown): SyncBlobReference {
  const ref = object(value);
  if (Object.keys(ref).length !== 2 || typeof ref.digest !== 'string' || !/^[a-f0-9]{64}$/.test(ref.digest) || !Number.isSafeInteger(ref.size) || Number(ref.size) < 1 || Number(ref.size) > MAX) throw syncError('invalid', '同步内容引用无效');
  return { digest: ref.digest, size: Number(ref.size) };
}
export interface SyncJsonContentOptions {
  spaceId: string;
  authorize(): void;
  /** Only an owner's already portable business value, never a database or arbitrary filesystem. */
  project?(key: string, value: unknown, put: (bytes: Uint8Array) => SyncBlobReference): unknown;
  restore?(key: string, value: unknown, read: (reference: SyncBlobReference) => Promise<Uint8Array>): Promise<unknown>;
}

/** Shared content-addressed transport projection; ownership and semantic validation remain with the adapter. */
export function createSyncJsonContent(options: SyncJsonContentOptions): SyncContentCodec {
  const keyCheck = (key: string) => { options.authorize(); if (!key || key.length > 500) throw syncError('invalid', '同步资产标识无效'); };
  return {
    encode(key, input) {
      keyCheck(key); const blobs = new Map<string, SyncBlobSource>();
      const put = (bytes: Uint8Array): SyncBlobReference => {
        options.authorize(); if (!bytes.byteLength || bytes.byteLength > MAX) throw syncError('limit', '同步内容超过账号容量上限');
        const ref = { digest: hash(bytes), size: bytes.byteLength }; blobs.set(ref.digest, { ...ref, bytes }); return ref;
      };
      const value = options.project ? options.project(key, structuredClone(input), put) : input;
      const bytes = Buffer.from(JSON.stringify(value));
      if (bytes.length > MAX) throw syncError('limit', '同步内容超过账号容量上限');
      if (bytes.length <= INLINE && !blobs.size) return { value: input, blobs: [] };
      const parts = [];
      for (let offset = 0; offset < bytes.length; offset += PART) parts.push(put(bytes.subarray(offset, offset + PART)));
      options.authorize();
      return { value: { sync_content: 1, spaceId: options.spaceId, key, size: bytes.length, digest: hash(bytes), parts }, blobs: [...blobs.values()] };
    },
    async decode(key, input, read) {
      keyCheck(key);
      if (!input || typeof input !== 'object' || !Object.hasOwn(input, 'sync_content')) {
        if (Buffer.byteLength(JSON.stringify(input)) > INLINE) throw syncError('limit', '较大同步内容缺少分块清单');
        return input;
      }
      const wire = object(input);
      if (Object.keys(wire).sort().join(',') !== 'digest,key,parts,size,spaceId,sync_content' || wire.sync_content !== 1 || wire.spaceId !== options.spaceId || wire.key !== key) throw syncError('scope', '同步内容与空间或资产不匹配');
      if (!Number.isSafeInteger(wire.size) || Number(wire.size) < 1 || Number(wire.size) > MAX || typeof wire.digest !== 'string' || !/^[a-f0-9]{64}$/.test(wire.digest) || !Array.isArray(wire.parts) || wire.parts.length !== Math.ceil(Number(wire.size) / PART)) throw syncError('invalid', '同步分块清单无效');
      const refs = wire.parts.map((part, index) => {
        const ref = reference(part); if (ref.size !== Math.min(PART, Number(wire.size) - index * PART)) throw syncError('invalid', '同步分块长度无效'); return ref;
      });
      const checked = async (ref: SyncBlobReference) => {
        options.authorize(); const expected = reference(ref), bytes = await read(expected); options.authorize();
        if (bytes.byteLength !== expected.size || hash(bytes) !== expected.digest) throw syncError('invalid', '同步内容完整性校验失败'); return bytes;
      };
      const chunks = []; for (const ref of refs) chunks.push(await checked(ref));
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== wire.size || hash(bytes) !== wire.digest) throw syncError('invalid', '同步内容整体校验失败');
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const restored = options.restore ? await options.restore(key, value, checked) : value;
      options.authorize(); return restored;
    },
  };
}
