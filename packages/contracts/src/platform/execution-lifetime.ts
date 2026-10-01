/**
 * In-process cancellation, time limit and ownership monitoring for one execution. It has no dependencies, so the Kernel
 * and the public Plugin SDK both hand out this one implementation without the SDK depending on the private Kernel.
 */
export interface ExecutionLifetimeOptions {
  signal?: AbortSignal;
  timeout?: { milliseconds: number; reason: Error };
  /** Synchronous ownership/lease check. Throw to stop the current execution. */
  monitor?: { intervalMs: number; check(): void };
}

export interface ExecutionLifetime {
  readonly signal: AbortSignal;
  assertActive(): void;
  /** Stops this wait on cancellation; the supplied operation must cooperate with signal for its own cleanup. */
  wait<T>(work: PromiseLike<T>): Promise<T>;
  dispose(): void;
}

/** In-process cancellation and monitoring only. Persistence, authorization and recovery stay with the caller. */
export function createExecutionLifetime(options: ExecutionLifetimeOptions = {}): ExecutionLifetime {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let monitor: ReturnType<typeof setInterval> | undefined;
  const forwardAbort = () => controller.abort(options.signal!.reason);
  const cleanup = () => {
    clearTimeout(timeout);
    clearInterval(monitor);
    options.signal?.removeEventListener("abort", forwardAbort);
  };
  controller.signal.addEventListener("abort", cleanup, { once: true });
  if (options.signal?.aborted) forwardAbort();
  else {
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
    if (options.timeout) {
      timeout = setTimeout(() => controller.abort(options.timeout!.reason), options.timeout.milliseconds);
      timeout.unref();
    }
    if (options.monitor) {
      monitor = setInterval(() => {
        try { options.monitor!.check(); }
        catch (error) { controller.abort(error); }
      }, options.monitor.intervalMs);
      monitor.unref();
    }
  }
  return {
    signal: controller.signal,
    /** Call after an asynchronous wait, before the caller's transactional write fence. */
    assertActive(): void { controller.signal.throwIfAborted(); },
    wait<T>(work: PromiseLike<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const abort = () => { controller.signal.removeEventListener("abort", abort); reject(controller.signal.reason); };
        controller.signal.addEventListener("abort", abort, { once: true });
        // Attach both continuations even when already aborted: a late rejection stays observed.
        Promise.resolve(work).then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", abort));
        if (controller.signal.aborted) abort();
      });
    },
    dispose(): void { controller.abort(new DOMException("Execution finished", "AbortError")); },
  };
}
