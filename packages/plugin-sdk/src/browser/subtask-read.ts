import type { SubtaskConversationRead, SubtaskConversationSource } from "./subtask-contract.js";

interface Reading {
  readonly target: string;
  readonly life: AbortController;
  ready: boolean;
  dirty: boolean;
  cleanup?: () => void;
  pending?: Promise<void>;
}

/** One visible subscription and a coalesced read, guarded by the lifetime rather than by target equality. */
export function subtaskReader(source: SubtaskConversationSource, accept: (result: SubtaskConversationRead) => void, failed: () => void) {
  let current: Reading | undefined;
  const alive = (reading: Reading) => current === reading && !reading.life.signal.aborted;
  function stop() {
    const old = current; current = undefined;
    if (old) { old.life.abort(); old.cleanup?.(); }
  }
  async function drain(reading: Reading): Promise<void> {
    if (!alive(reading) || !reading.ready) return;
    if (reading.pending) return reading.pending;
    reading.pending = (async () => {
      while (reading.dirty && alive(reading)) {
        reading.dirty = false;
        try {
          const result = await source.read(reading.target, reading.life.signal);
          if (!alive(reading)) return;
          // An adapter returning another task is a failed read, never content or a write binding for this target.
          if (result.state === "available" && result.view.target !== reading.target) failed(); else accept(result);
        } catch { if (alive(reading)) failed(); }
      }
    })();
    try { await reading.pending; } finally {
      reading.pending = undefined;
      if (reading.dirty && alive(reading)) await drain(reading);
    }
  }
  async function open(target: string) {
    stop();
    const reading: Reading = { target, life: new AbortController(), ready: false, dirty: true }; current = reading;
    const invalidate = () => { if (alive(reading)) { reading.dirty = true; void drain(reading).catch(() => { if (alive(reading)) failed(); }); } };
    try {
      const cleanup = await source.subscribe?.(target, invalidate, reading.life.signal);
      if (!alive(reading)) { cleanup?.(); return; }
      reading.cleanup = cleanup; reading.ready = true;
      await drain(reading);
    } catch { if (alive(reading)) failed(); }
  }
  return {
    open, stop,
    signal: () => current?.life.signal,
    async refresh() {
      const reading = current; if (!reading) return;
      if (!reading.ready) return open(reading.target);
      reading.dirty = true; await drain(reading);
    },
  };
}
