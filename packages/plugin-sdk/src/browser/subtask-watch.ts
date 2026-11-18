/** Versioned owner wait: establish a version before the first snapshot, and invalidate after reconnect as well as changes. */
export async function subscribeSubtask<Update extends { version: string }>(
  read: (since: string | null, signal: AbortSignal) => Promise<Update>,
  invalidate: (update?: Update) => void,
  signal: AbortSignal,
  first?: (update: Update) => void,
): Promise<() => void> {
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal.aborted) throw new DOMException("View closed", "AbortError");
  signal.addEventListener("abort", abort, { once: true });
  const close = () => { signal.removeEventListener("abort", abort); controller.abort(); };
  let version: string, reconnect = false;
  try {
    const initial = await read(null, controller.signal);
    controller.signal.throwIfAborted();
    version = initial.version;
    first?.(initial);
  } catch (error) { close(); throw error; }
  const delay = () => new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, 1000); controller.signal.addEventListener("abort", done, { once: true }); if (controller.signal.aborted) done();
  });
  void (async () => {
    while (!controller.signal.aborted) {
      try { const next = await read(version, controller.signal); if (controller.signal.aborted) break; if (reconnect || next.version !== version) invalidate(next); version = next.version; reconnect = false; }
      catch { if (controller.signal.aborted) break; if (!reconnect) invalidate(); reconnect = true; await delay(); }
    }
  })();
  return close;
}
