/**
 * One synchronous directory: every action's availability is asked within it, so what those checks read (a provider's own state,
 * the configured model) is read once and shared. Nothing is kept outside a pass, so a call, or the next directory, reads afresh.
 */
let current: WeakMap<object, Map<unknown, unknown>> | undefined;

/** Runs `run` as one pass; a nested directory joins the pass it is in. */
export function inDirectoryPass<T>(run: () => T): T {
  if (current) return run();
  current = new WeakMap();
  try { return run(); } finally { current = undefined; }
}

/** `read()` once per pass for `scope` and `key`; outside a pass, every time. A read that throws is not kept. */
export function rememberInDirectoryPass<T>(scope: object, key: unknown, read: () => T): T {
  if (!current) return read();
  const answers = current.get(scope) ?? current.set(scope, new Map()).get(scope)!;
  if (answers.has(key)) return answers.get(key) as T;
  const value = read();
  answers.set(key, value);
  return value;
}

/** A write within a pass: the next read of `scope` and `key` in it reads afresh. */
export function forgetInDirectoryPass(scope: object, key: unknown): void {
  current?.get(scope)?.delete(key);
}
