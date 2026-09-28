export interface ExecutionLifetimeOptions {
  signal?: AbortSignal;
  timeout?: { milliseconds: number; reason: Error };
  /** Synchronous ownership/lease check. Throw to stop the current execution. */
  monitor?: { intervalMs: number; check(): void };
}

export interface ExecutionLifetime {
  readonly signal: AbortSignal;
  assertActive(): void;
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
    dispose(): void { controller.abort(new DOMException("Execution finished", "AbortError")); },
  };
}
