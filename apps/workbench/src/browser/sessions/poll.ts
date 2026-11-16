/**
 * Progressive discovery poll (`contract-design.md` §10.2 D5):
 * runs `2s -> 4s -> 8s -> 15s` only while at least one source is `"reading"`, the document is visible,
 * and the surface is on screen. Stops immediately when hidden or when all sources settle.
 */
const DELAYS_MS = [2000, 4000, 8000, 15000] as const;

export interface DiscoveryPollerOptions {
  readonly isActive: () => boolean;
  readonly onTick: () => Promise<boolean>;
}

export interface DiscoveryPoller {
  kick(resetStep?: boolean): void;
  stop(): void;
}

export function nextRovingTab(tabs: readonly HTMLButtonElement[], cur: HTMLButtonElement, key: string): HTMLButtonElement | undefined {
  if (key === "Home") return tabs[0];
  if (key === "End") return tabs.at(-1);
  if (key === "ArrowLeft" || key === "ArrowRight") return tabs[(tabs.indexOf(cur) + (key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
  return undefined;
}

export function createDiscoveryPoller(options: DiscoveryPollerOptions): DiscoveryPoller {
  let timer = 0;
  let step = 0;
  let running = false;
  const clear = () => { if (timer) { clearTimeout(timer); timer = 0; } };
  const canPoll = () => document.visibilityState === "visible" && options.isActive();
  const schedule = () => {
    clear();
    if (!canPoll()) return;
    timer = window.setTimeout(async () => {
      timer = 0;
      if (!canPoll() || running) return;
      running = true;
      let again = true;
      try { again = await options.onTick(); } catch { /* retry on next backoff */ }
      running = false;
      step = Math.min(step + 1, 3);
      if (again && canPoll()) schedule();
    }, DELAYS_MS[step]!);
  };
  document.addEventListener("visibilitychange", () => { if (canPoll()) schedule(); else clear(); });
  return {
    kick(resetStep = false) { if (resetStep) step = 0; if (canPoll()) schedule(); else clear(); },
    stop: clear,
  };
}
