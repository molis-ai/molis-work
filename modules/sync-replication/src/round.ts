import type { SyncRoundSummary } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import { parseSpaceSyncPolicy } from './policy.js';
import { parseSyncQuota } from './quota.js';
import { syncNamespace } from './namespace.js';
import { syncError } from './sync-errors.js';

/** Never interpret a malformed/missing head as a successful empty collection. */
export function parseSyncRound(value: unknown, spaceId: string) {
  const invalid = () => syncError('invalid', 'Invalid sync round summary');
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 4 || !('format' in value) || value.format !== 1
    || !('policy' in value) || !('quota' in value) || !('heads' in value) || !Array.isArray(value.heads)) throw invalid();
  const policy = parseSpaceSyncPolicy(value.policy, spaceId), quota = parseSyncQuota(value.quota);
  const selected = new Set(policy.selections.map(syncNamespace)), heads = new Map<string, number>();
  if (value.heads.length !== selected.size) throw invalid();
  for (const head of value.heads) {
    if (!head || typeof head !== 'object' || Array.isArray(head) || Object.keys(head).length !== 2
      || typeof head.namespace !== 'string' || !selected.has(head.namespace) || heads.has(head.namespace)
      || !Number.isSafeInteger(head.revision) || head.revision < 0) throw invalid();
    heads.set(head.namespace, head.revision);
  }
  const wire: SyncRoundSummary = { format: 1, policy, quota, heads: [...heads].map(([namespace, revision]) => ({ namespace, revision })) };
  return { ...wire, heads };
}
