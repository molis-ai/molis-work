import { createHash } from 'node:crypto';
import type { SyncBlobReference, SyncBlobSource, SyncContentCodec } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { replicaError } from './project-replication-errors.js';

const PART_BYTES = 1024 * 1024;
const MAX_BYTES = 100000000;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw replicaError('replica_invalid');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw replicaError('replica_invalid');
}

/** Goal owner composition: project identity stays visible; the complete fact unit is restored before applying. */
export function createProjectGoalContent(spaceId: string, projectId: (key: string) => string, check: () => void): SyncContentCodec {
  const envelope = (key: string, input: unknown) => {
    check();
    const value = record(input), project = record(value.project);
    exact(project, ['id', 'title']);
    if (value.spaceId !== spaceId || project.id !== projectId(key) || typeof project.title !== 'string' || !project.title.trim() || project.title.length > 120) throw replicaError('replica_scope_mismatch');
    return { value, project };
  };
  return {
    encode(key, input) {
      const { value, project } = envelope(key, input);
      exact(value, ['format', 'spaceId', 'project', 'facts', 'journal']);
      if (value.format !== 1) throw replicaError('replica_invalid');
      const bytes = Buffer.from(JSON.stringify(value));
      if (bytes.length > MAX_BYTES) throw replicaError('replica_limit');
      if (bytes.length <= 64 * 1024) return { value: input, blobs: [] };
      const parts: SyncBlobReference[] = [], blobs = new Map<string, SyncBlobSource>();
      for (let offset = 0; offset < bytes.length; offset += PART_BYTES) {
        const chunk = bytes.subarray(offset, offset + PART_BYTES), ref = { digest: hash(chunk), size: chunk.length };
        parts.push(ref); blobs.set(ref.digest, { ...ref, bytes: chunk });
      }
      check();
      return { value: { format: 2, spaceId, project, content: { size: bytes.length, digest: hash(bytes), parts } }, blobs: [...blobs.values()] };
    },
    async decode(key, input, read) {
      const { value, project } = envelope(key, input);
      if (value.format === 1) {
        exact(value, ['format', 'spaceId', 'project', 'facts', 'journal']);
        if (Buffer.byteLength(JSON.stringify(value)) > 64 * 1024) throw replicaError('replica_limit');
        return input;
      }
      exact(value, ['format', 'spaceId', 'project', 'content']);
      if (value.format !== 2) throw replicaError('replica_invalid');
      const content = record(value.content);
      exact(content, ['size', 'digest', 'parts']);
      if (!Number.isSafeInteger(content.size) || Number(content.size) <= 64 * 1024 || Number(content.size) > MAX_BYTES || typeof content.digest !== 'string' || !/^[a-f0-9]{64}$/.test(content.digest) || !Array.isArray(content.parts) || content.parts.length !== Math.ceil(Number(content.size) / PART_BYTES)) throw replicaError('replica_invalid');
      // Validate the entire manifest before reading even its first part.
      const parts = content.parts.map((part: unknown, index: number): SyncBlobReference => {
        const ref = record(part); exact(ref, ['digest', 'size']);
        const size = Math.min(PART_BYTES, Number(content.size) - index * PART_BYTES);
        if (typeof ref.digest !== 'string' || !/^[a-f0-9]{64}$/.test(ref.digest) || ref.size !== size) throw replicaError('replica_invalid');
        return { digest: ref.digest, size };
      });
      const chunks: Uint8Array[] = [];
      for (const ref of parts) {
        check(); const bytes = await read(ref); check();
        if (bytes.byteLength !== ref.size || hash(bytes) !== ref.digest) throw replicaError('replica_invalid');
        chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== content.size || hash(bytes) !== content.digest) throw replicaError('replica_invalid');
      const restored: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const decoded = envelope(key, restored);
      exact(decoded.value, ['format', 'spaceId', 'project', 'facts', 'journal']);
      if (decoded.value.format !== 1 || decoded.project.title !== project.title) throw replicaError('replica_invalid');
      check(); return restored;
    },
  };
}
