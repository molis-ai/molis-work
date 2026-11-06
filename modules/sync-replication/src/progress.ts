import type { SpaceSyncPolicy, SpaceSyncProgress } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import { syncNamespace } from './namespace.js';

/** Presentation only; this never acknowledges an owner or changes policy/cursors. */
export function syncProgress(input: {
  policy: SpaceSyncPolicy;
  collections: readonly { selection: SpaceSyncPolicy['selections'][number]; pending: number; conflicts: readonly { waiting?: boolean }[]; failures: readonly unknown[] }[];
  running: boolean;
  error: string | null;
  lastSuccess: string | null;
}): SpaceSyncProgress {
  const selected = new Set(input.policy.selections.map(syncNamespace));
  const known = new Set(input.collections.map(item => syncNamespace(item.selection)));
  const unavailable = [...selected].filter(namespace => !known.has(namespace)).length;
  let pending = 0, conflicts = 0, waiting = 0, failures = 0;
  for (const item of input.collections) {
    if (!selected.has(syncNamespace(item.selection))) continue;
    pending += item.pending;
    waiting += item.conflicts.filter(conflict => conflict.waiting).length;
    conflicts += item.conflicts.filter(conflict => !conflict.waiting).length;
    failures += item.failures.length;
  }
  return { selected: selected.size, pending, conflicts, waiting, failures, unavailable,
    complete: selected.size > 0 && !input.running && !input.error && input.lastSuccess !== null
      && pending + conflicts + waiting + failures + unavailable === 0 };
}
