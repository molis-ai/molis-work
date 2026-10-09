import { createHash } from "node:crypto";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

/** A version of a work's view that changes when anything the page draws from it does. */
export function workViewVersion(view: AssistantWorkView): string {
  return createHash("sha256").update(JSON.stringify(view)).digest("hex").slice(0, 24);
}

/**
 * Wait until a work's view differs from `since`, or the wait runs out (at most 25 s), and return it as it is then. It
 * wakes on what can change the view — the work's stored facts and the live run it waits on — gathers a burst for 40 ms,
 * and reads the view again; nothing is read on a timer (specs/prologue-adoption §4.5, item 12).
 */
export async function waitForWorkChange(input: {
  read(): Promise<AssistantWorkView>;
  /** Subscribe to this work's stored changes; returns the unsubscribe. */
  onStored(listener: () => void): () => void;
  /** Subscribe to the runs the work is waiting on now; returns the unsubscribe. */
  onRuns(listener: () => void): Promise<() => void>;
  since: string | null;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ version: string; view: AssistantWorkView }> {
  let view = await input.read(), version = workViewVersion(view);
  if (version !== input.since) return { version, view };
  const deadline = Date.now() + Math.max(0, Math.min(25_000, input.timeoutMs));
  let wake: (() => void) | undefined, pending = false;
  const poke = () => { pending = true; wake?.(); };
  const stopStored = input.onStored(poke);
  const stopRuns = await input.onRuns(poke).catch(() => () => {});
  try {
    while (Date.now() < deadline && !input.signal?.aborted) {
      const woke = await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => done(false), Math.max(0, deadline - Date.now()));
        const aborted = () => done(false);
        function done(value: boolean) { clearTimeout(timer); input.signal?.removeEventListener("abort", aborted); wake = undefined; resolve(value); }
        input.signal?.addEventListener("abort", aborted, { once: true });
        wake = () => { clearTimeout(timer); setTimeout(() => done(true), 40); };
        if (pending) wake();
      });
      pending = false;
      if (!woke) break;
      view = await input.read(); version = workViewVersion(view);
      if (version !== input.since) return { version, view };
    }
    return { version, view };
  } finally { stopStored(); stopRuns(); }
}

/**
 * Wait on one of the person's works as the page shows it: its own stored facts and those of the sub-tasks it handed out,
 * and the runs they wait on now (each one's latest Assistant round, and the latest round of the Coding session it runs
 * in or handed to).
 */
export function waitForAssistantWork(ports: { store: AssistantStore; actorId: string; host(): Promise<AgentHost>; read(): Promise<AssistantWorkView>;
  codingRun(work: StoredWork): Promise<AgentRunRef | undefined> }, workId: string, since: string | null, timeoutMs: number, signal?: AbortSignal) {
  const watched = () => [workId, ...ports.store.delegatedBy(ports.actorId, workId).map(child => child.work_id)];
  return waitForWorkChange({ read: ports.read, since, timeoutMs, signal,
    onStored: listener => { const ids = new Set(watched()); return ports.store.onChange(id => { if (ids.has(id)) listener(); }); },
    onRuns: async listener => {
      const adapter = (await ports.host()).adapter("prologue");
      const refs = (await Promise.all(watched().map(async id => {
        const work = ports.store.get(ports.actorId, id), own = ports.store.rounds(id).filter(round => round.executor !== "coding").at(-1), coding = await ports.codingRun(work);
        return [...(own && work.session_id ? [{ session_id: work.session_id, run_id: own.run_id }] : []), ...(coding ? [coding] : [])];
      }))).flat();
      // Observing replays the run as it is now; only what happens after wakes the wait.
      let replaying = true;
      const stops = refs.flatMap(ref => { try { return [adapter.observe(ref, () => { if (!replaying) listener(); })]; } catch { return []; } });
      replaying = false;
      return () => stops.forEach(stop => stop());
    } });
}
