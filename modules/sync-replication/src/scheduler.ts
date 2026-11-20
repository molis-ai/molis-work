const IDLE_INTERVALS = [15_000, 30_000, 60_000, 120_000] as const;

/** Opt-in scheduling only. Explicit runs can execute without creating an automatic timer. */
export function syncScheduler(run: () => void, inflight: () => boolean, retryDelay: () => number, revoked: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let enabled = false;
  let emptyRounds = 0;
  let wakeAt = 0;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    if (!enabled || revoked() || timer || inflight()) return;
    const retryAfter = retryDelay();
    const next = wakeAt ? Math.max(0, wakeAt - Date.now()) : IDLE_INTERVALS[emptyRounds]!;
    timer = setTimeout(() => {
      timer = null;
      if (retryDelay() > 0) schedule();
      else if (!revoked()) run();
    }, retryAfter > 0 ? Math.min(2_147_483_647, retryAfter) : next);
    timer.unref();
  };
  return {
    start() {
      if (enabled) return;
      enabled = true;
      emptyRounds = 0;
      if (retryDelay() > 0) schedule();
      else run();
    },
    stop() {
      enabled = false;
      wakeAt = 0;
      clear();
    },
    notifyLocalChange() {
      if (!enabled || wakeAt) return;
      emptyRounds = 0;
      wakeAt = Date.now() + 1500;
      clear();
      schedule();
    },
    running() {
      wakeAt = 0;
      clear();
    },
    completed(active: boolean) {
      emptyRounds = active ? 0 : Math.min(emptyRounds + 1, IDLE_INTERVALS.length - 1);
    },
    resume: schedule,
  };
}
