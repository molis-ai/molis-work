import type { WebPeriodicTask as PeriodicTaskView } from "@molis-ai/molis-work-app-workbench";

interface PeriodicTask {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly intervalMs: number;
  run(): unknown;
  /** Called with a failed run's error, after it is recorded; the next run is tried at the next interval as usual. */
  onError?(error: unknown): void;
}

/**
 * The Host's periodic tasks, registered in one place (W4-09) instead of each owner holding its own `setInterval`. A run that
 * is still going when the next one is due is skipped, so a slow round never piles up behind itself. `stop()` clears every
 * timer and waits for the runs in flight; nothing is started after it.
 */
export interface PeriodicTasks {
  /** Starts the task; the returned function stops it alone. */
  every(task: PeriodicTask): () => void;
  list(): PeriodicTaskView[];
  stop(): Promise<void>;
}

export function createPeriodicTasks(): PeriodicTasks {
  const tasks = new Map<string, { task: PeriodicTask; timer: NodeJS.Timeout; view: Omit<PeriodicTaskView, "id" | "title" | "owner" | "interval_ms">; current?: Promise<void> }>();
  let stopped = false;
  let stopping: Promise<void> | undefined;
  const tick = (id: string) => {
    const entry = tasks.get(id);
    if (!entry || entry.current || stopped) return;
    entry.view = { ...entry.view, running: true };
    entry.current = (async () => {
      let failure: unknown, failed = false;
      try { await entry.task.run(); } catch (error) { failure = error; failed = true; }
      entry.view = { runs: entry.view.runs + 1, running: false, last_finished_at: new Date().toISOString(),
        last_error: failed ? (failure instanceof Error ? failure.message : String(failure)) : null };
      if (failed) entry.task.onError?.(failure);
    })().finally(() => { entry.current = undefined; });
  };
  const remove = (id: string) => { const entry = tasks.get(id); if (entry) { clearInterval(entry.timer); tasks.delete(id); } return entry; };
  return {
    every(task) {
      if (stopped) throw new Error("The Host's periodic tasks are stopped: " + task.id);
      if (tasks.has(task.id)) throw new Error("Periodic task registered twice: " + task.id);
      const timer = setInterval(() => tick(task.id), task.intervalMs);
      timer.unref();
      tasks.set(task.id, { task, timer, view: { runs: 0, running: false, last_finished_at: null, last_error: null } });
      return () => { remove(task.id); };
    },
    list: () => [...tasks.values()].map(({ task, view }) => ({ id: task.id, title: task.title, owner: task.owner, interval_ms: task.intervalMs, ...view })),
    stop() {
      stopped = true;
      return stopping ??= (async () => {
        const running = [...tasks.keys()].map(remove).map(entry => entry?.current);
        await Promise.all(running);
      })().catch(error => { stopping = undefined; throw error; });
    },
  };
}
