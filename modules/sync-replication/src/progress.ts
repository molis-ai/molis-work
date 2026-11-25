import { createHash } from "node:crypto";
import type { SpaceSyncPolicy, SpaceSyncProgress } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import { syncNamespace } from './namespace.js';

type Conflict = { key: string; reason: string; waiting?: boolean };

export type ConflictCursor = { key: string; waiting: boolean; snapshot: string };

export function conflictPage(conflicts: Conflict[], after?: ConflictCursor) {
  const ordered = [...conflicts].sort((a, b) => Number(!!a.waiting) - Number(!!b.waiting) || (a.key < b.key ? -1 : Number(a.key > b.key)));
  const waitingCount = ordered.filter(item => item.waiting).length;
  // A waiting item may become actionable and move before the cursor, even if the counts stay the same.
  const snapshot = after || ordered.length > 100 ? createHash('sha256').update(JSON.stringify(ordered.map(row => [row.key, !!row.waiting]))).digest('base64url') : '';
  const restarted = !!after && snapshot !== after.snapshot;
  const remaining = after && !restarted ? ordered.filter(item => Number(!!item.waiting) > Number(after.waiting)
    || (!!item.waiting === after.waiting && item.key > after.key)) : ordered;
  const items = remaining.slice(0, 100);
  const last = items.at(-1);
  return { conflicts: items, waitingCount, restarted, decisionCount: ordered.length - waitingCount,
    nextConflict: remaining.length > items.length && last ? { key: last.key, waiting: !!last.waiting, snapshot } : null };
}

/** Presentation only; this never acknowledges an owner or changes policy/cursors. */
export function syncProgress(input: {
  policy: SpaceSyncPolicy;
  collections: readonly { selection: SpaceSyncPolicy['selections'][number]; pending: number; waitingCount: number; decisionCount: number; failures: readonly unknown[] }[];
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
    waiting += item.waitingCount;
    conflicts += item.decisionCount;
    failures += item.failures.length;
  }
  return { selected: selected.size, pending, conflicts, waiting, failures, unavailable,
    complete: selected.size > 0 && !input.running && !input.error && input.lastSuccess !== null
      && pending + conflicts + waiting + failures + unavailable === 0 };
}
