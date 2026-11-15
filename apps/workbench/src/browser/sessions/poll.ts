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

export function createDiscoveryPoller(options: DiscoveryPollerOptions): DiscoveryPoller {
  let timer = 0;
  let step = 0;
  let running = false;

  const clear = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  };

  const canPoll = () => document.visibilityState === "visible" && options.isActive();

  const schedule = () => {
    clear();
    if (!canPoll()) return;
    const delay = DELAYS_MS[Math.min(step, DELAYS_MS.length - 1)]!;
    timer = window.setTimeout(async () => {
      timer = 0;
      if (!canPoll() || running) return;
      running = true;
      try {
        const stillReading = await options.onTick();
        step = Math.min(step + 1, DELAYS_MS.length - 1);
        if (stillReading && canPoll()) schedule();
      } catch {
        step = Math.min(step + 1, DELAYS_MS.length - 1);
        if (canPoll()) schedule();
      } finally {
        running = false;
      }
    }, delay);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") clear();
    else if (options.isActive()) schedule();
  });

  return {
    kick(resetStep = false) {
      if (resetStep) step = 0;
      if (canPoll()) schedule();
      else clear();
    },
    stop: clear,
  };
}
