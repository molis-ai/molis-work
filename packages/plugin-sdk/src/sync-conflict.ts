import { createHash } from 'node:crypto';
import type { SyncEvent } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { canonicalDocumentValue } from './sync-document-state.js';
import { syncError } from './sync-errors.js';

/** A comparison CAS token, not an authorization credential. Bind both contents and the local edit generation. */
export function createSyncConflictState(event: SyncEvent, local: unknown, localRevision: number): string {
  if (!Number.isSafeInteger(localRevision) || localRevision < 0) throw syncError('invalid', '本机比较修订无效');
  const digest = (value: unknown) => createHash('sha256').update(canonicalDocumentValue(value)).digest('hex');
  return createHash('sha256').update(JSON.stringify([event.operationId, event.key, event.base, event.revision, localRevision,
    digest(event.value), digest(local)])).digest('hex');
}
