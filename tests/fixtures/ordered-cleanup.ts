/**
 * Releasing what one test started, when something already went wrong (BL-1017). Every step runs in order even after an earlier one
 * throws, so a failed Host close still removes the test's temporary directory. The first error is the one reported: alone it is
 * rethrown as is; with later ones it leads an AggregateError and is its cause.
 */
export type CleanupStep = readonly [name: string, release: () => unknown];

/** Runs `steps` in order and reports the first failure; `first` is an error that came before cleanup started, such as the test's own. */
export async function closeInOrder(label: string, steps: readonly CleanupStep[], first?: { error: unknown }): Promise<void> {
  const failures: { name: string; error: unknown }[] = first ? [{ name: "test", error: first.error }] : [];
  for (const [name, release] of steps) {
    try { await release(); } catch (error) { failures.push({ name, error }); }
  }
  if (failures.length === 1) throw failures[0]!.error;
  if (failures.length > 1) {
    throw new AggregateError(failures.map(failure => failure.error),
      `${label}: ${failures.map(failure => failure.name).join(", ")} failed; the first is the cause`, { cause: failures[0]!.error });
  }
}

/** Runs `body`, then `close` whatever happened; an error from `body` stays the first one even when `close` fails too. */
export async function closeAfter<T>(close: (first?: { error: unknown }) => Promise<void>, body: () => Promise<T>): Promise<T> {
  let result: T;
  try { result = await body(); } catch (error) { await close({ error }); throw error; }
  await close();
  return result;
}
