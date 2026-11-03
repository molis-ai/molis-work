import { feedErrors } from "./contract/feed.js";

/**
 * Who is pulling which source right now, for one Feed instance. One Home has one executing process and a project has one Feed instance,
 * so the claim is a map in the instance: a second pull of a source that is already being pulled is refused (the person or the clock
 * tries again), and a source of another project with the same id is a different claim. A process that dies takes its claims with it;
 * what it left half-done is in the runs it recorded (the Listener's `recoverInterruptedRuns` marks those interrupted), not here.
 */
export type FeedSourceSyncLease = (projectId: string, sourceId: string) => () => void;

export function createFeedSourceSyncLease(): FeedSourceSyncLease {
  const active = new Map<string, symbol>();
  return (projectId, sourceId) => {
    const key = JSON.stringify([projectId, sourceId]);
    if (active.has(key)) throw feedErrors.source_sync_interrupted("该来源正在拉取，请稍后重试");
    const claim = Symbol(key);
    active.set(key, claim);
    // Only the claim that made the entry removes it: a release that runs twice cannot free the next pull's claim.
    return () => { if (active.get(key) === claim) active.delete(key); };
  };
}
