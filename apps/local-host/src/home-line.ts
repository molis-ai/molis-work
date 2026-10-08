import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The Home's one operation line, as a project has its own in LocalHost. A serial call waits for the calls ahead of it. A concurrent
 * call (one that waits for a model or the network) runs beside the line and holds nothing, so whatever serial call it makes
 * waits its turn like any other. A call made inside one that does hold the line runs on it, because waiting behind its own
 * parent would deadlock; a `step` (a scene run) takes the place of the call that triggered it either way.
 */
export class HomeLine {
  private readonly scope = new AsyncLocalStorage<{ active: boolean; holdsQueue: boolean }>();
  private tail: Promise<void> = Promise.resolve();
  private readonly concurrent = new Set<Promise<unknown>>();

  run<Result>(operation: () => Promise<Result>, mode: "serial" | "concurrent" | "step" = "serial"): Promise<Result> {
    const run = (holdsQueue: boolean) => this.scope.run({ active: true, holdsQueue }, async () => {
      const scope = this.scope.getStore()!;
      try { return await operation(); } finally { scope.active = false; }
    });
    const parent = this.scope.getStore();
    if (parent?.active && (parent.holdsQueue || mode === "step")) return run(parent.holdsQueue);
    if (mode === "concurrent") {
      const pending = run(false);
      this.concurrent.add(pending);
      void pending.then(() => this.concurrent.delete(pending), () => this.concurrent.delete(pending));
      return pending;
    }
    const pending = this.tail.then(() => run(true));
    this.tail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  /** Settles once the calls started so far have, however they ended. */
  settled(): Promise<unknown> {
    return Promise.all([this.tail, ...[...this.concurrent].map(call => call.then(() => undefined, () => undefined))]);
  }
}
