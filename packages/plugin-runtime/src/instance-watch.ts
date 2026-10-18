import type { PluginActiveInstance } from "./lifecycle.js";

/** How often a watched instance is asked whether it is still the one running. */
export const INSTANCE_WATCH_INTERVAL_MS = 100;

/** The timer a watch runs on; the router takes the real one unless it is given another. */
export interface InstanceWatchTimers {
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(timer: unknown): void;
}

const realTimers: InstanceWatchTimers = {
  setInterval: (run, ms) => {
    const timer = setInterval(run, ms);
    timer.unref?.();
    return timer;
  },
  clearInterval: (timer) => clearInterval(timer as ReturnType<typeof setInterval>),
};

/**
 * Tell `stopped` once, when `instance` is no longer active: the plugin was disabled, revoked, stopped, quarantined, failed, or
 * replaced by an upgrade, a reinstall or a rollback. `active()` is the one place that decides all of these, so the watch asks it
 * instead of listening to each. It only ends the connection in time: what the call may still write is refused where it writes.
 * The returned function ends the watch; calling it again does nothing.
 */
export function watchInstance(instance: Pick<PluginActiveInstance, "active">, stopped: () => void, timers: InstanceWatchTimers = realTimers): () => void {
  let open = true;
  const timer = timers.setInterval(() => {
    if (instance.active()) return;
    end();
    stopped();
  }, INSTANCE_WATCH_INTERVAL_MS);
  function end(): void {
    if (!open) return;
    open = false;
    timers.clearInterval(timer);
  }
  return end;
}
