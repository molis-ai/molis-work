import type { Server } from 'node:http';

/** All scoped owners finish releasing resources before a new account can reopen this Home. */
export function spaceDisposal(server: Server, timers: readonly ReturnType<typeof setInterval>[], release: readonly (() => unknown | Promise<unknown>)[]): Promise<void> {
  return new Promise(resolve => server.once('close', () => {
    for (const timer of timers) clearInterval(timer);
    void Promise.allSettled(release.map(dispose => Promise.resolve().then(dispose))).then(() => resolve());
  }));
}
