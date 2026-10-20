import type { SpaceSyncPolicy, SyncRoundSummary } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import { syncNamespace, type SyncSelection } from '@molis-ai/molis-work-module-sync-replication';

/** Current wire shape for network substitutes; callers supply their real fixture head, never a guessed high watermark. */
export function syncRoundResponse(policy: SpaceSyncPolicy, revision: number | ((selection: SyncSelection) => number), usedBytes = 0): Response {
  const summary: SyncRoundSummary = { format: 1, policy, quota: { limitBytes: 100000000, usedBytes },
    heads: policy.selections.map(selection => ({ namespace: syncNamespace(selection), revision: typeof revision === 'number' ? revision : revision(selection) })) };
  return Response.json(summary);
}
