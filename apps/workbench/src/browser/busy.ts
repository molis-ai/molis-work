type BusyRunner = <R>(el: HTMLElement, fn: () => Promise<R>) => Promise<R>;

/** Runs an async action through the workbench's shared `molisBusy` button guard when available. */
export function runBusy<T>(btn: HTMLElement | null | undefined, work: () => Promise<T>): Promise<T> {
  const busy = (globalThis as typeof globalThis & { molisBusy?: BusyRunner }).molisBusy;
  return btn && busy ? busy(btn, work) : work();
}
