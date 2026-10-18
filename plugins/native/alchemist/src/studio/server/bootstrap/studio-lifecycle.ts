import type { actionsInFlight } from "./actor-actions.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { LocalWorker } from "../jobs/local-worker.js";
import type { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";

/** The studio remains revoked after a failed close; only resource cleanup may be retried. */
export function studioLifecycle(d: { database: SqliteDatabase; worker: LocalWorker; jobs: SqliteJobRunner;
  actions: ReturnType<typeof actionsInFlight>; intervalMs?: number }) {
  let interval: NodeJS.Timeout | undefined, draining: Promise<void> | undefined, closing: Promise<void> | undefined, closed = false;
  const runPending = (): Promise<void> => {
    if (draining) return draining;
    if (closed) return Promise.resolve();
    draining = (async () => {
      while (!closed && await d.worker.runNext()) { /* drain sequentially */ }
    })().finally(() => { draining = undefined; });
    return draining;
  };
  return {
    closed: () => closed,
    runPending,
    idle: () => !closed && !draining && d.actions.none() && !d.worker.hasAccepted(),
    start() {
      if (interval || closed) return;
      void runPending();
      interval = setInterval(() => void runPending(), d.intervalMs ?? 250);
      interval.unref();
    },
    close() {
      if (closing) return closing;
      closed = true;
      if (interval) clearInterval(interval);
      d.actions.revoke(); d.worker.stop();
      closing = Promise.allSettled([draining, d.worker.whenIdle(), d.actions.whenIdle()])
        .then(() => { d.database.close(); }).catch(error => { closing = undefined; throw error; });
      return closing;
    },
  };
}
