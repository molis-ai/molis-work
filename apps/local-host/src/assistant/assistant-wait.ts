import { createHash } from "node:crypto";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

/** A version of a work's view that changes when anything the page draws from it does. */
function workViewVersion(view: unknown): string {
  return createHash("sha256").update(JSON.stringify(view)).digest("hex").slice(0, 24);
}

/**
 * Wait until a work's view differs from `since`, or the wait runs out (at most 25 s), and return it as it is then. It
 * wakes on what can change the view — the work's stored facts and the live run it waits on — gathers a burst for 40 ms,
 * and reads the view again; nothing is read on a timer (specs/prologue-adoption §4.5, item 12).
 */
async function waitForWorkChange<View = AssistantWorkView>(input: {
  read(): Promise<View>;
  /** Subscribe to this work's stored changes; returns the unsubscribe. */
  onStored(listener: () => void): () => void;
  /** Subscribe to the runs the work is waiting on now; returns the unsubscribe. */
  onRuns(listener: () => void): Promise<() => void>;
  since: string | null;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ version: string; view: View }> {
  // Nothing to compare with: the view as it is now.
  if (input.since === null) { const view = await input.read(); return { version: workViewVersion(view), view }; }
  const deadline = Date.now() + Math.max(0, Math.min(25_000, input.timeoutMs));
  let wake: (() => void) | undefined, pending = false;
  const poke = () => { pending = true; wake?.(); };
  // Listening starts before the first read, so a change between the two is not lost.
  const stopStored = input.onStored(poke);
  const stopRuns = await input.onRuns(poke).catch(() => () => {});
  try {
    let view = await input.read(), version = workViewVersion(view);
    if (version !== input.since) return { version, view };
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
 * What wakes a wait on some of the person's works: their own stored facts, the runs they wait on now (each one's
 * latest Assistant round, and the latest round of the executor's session it runs in or handed to, when `executorRun` says),
 * and their graphs (a background job they follow ends there).
 */
function watchWorks(ports: { store: AssistantStore; actorId: string; host(): Promise<AgentHost>; executorRun?(work: StoredWork): Promise<AgentRunRef | undefined> }, workIds: readonly string[]) {
  return {
    onStored: (listener: () => void) => { const ids = new Set(workIds); return ports.store.onChange(id => { if (ids.has(id)) listener(); }); },
    onRuns: async (listener: () => void) => {
      const adapter = (await ports.host()).adapter("prologue");
      const refs = (await Promise.all(workIds.map(async id => {
        const work = ports.store.get(ports.actorId, id), own = ports.store.rounds(id).filter(round => round.executor !== "plugin").at(-1), carried = await ports.executorRun?.(work);
        return [...(own && work.session_id ? [{ session_id: work.session_id, run_id: own.run_id }] : []), ...(carried ? [carried] : [])];
      }))).flat();
      // Observing replays the run as it is now; only what happens after wakes the wait.
      let replaying = true;
      const stops = refs.flatMap(ref => { try { return [adapter.observe(ref, () => { if (!replaying) listener(); })]; } catch { return []; } });
      replaying = false;
      const graphs = new Set(workIds.flatMap(id => { const work = ports.store.get(ports.actorId, id), graph = work.delegated_by?.graph_id ?? work.graph_id; return graph ? [graph] : []; }));
      for (const graph of graphs) { try { stops.push(adapter.collaboration?.works?.watch(graph, listener) ?? (() => undefined)); } catch { /* no graph to hear */ } }
      return () => stops.forEach(stop => stop());
    },
  };
}

/** Wait on one of the person's works as the page shows it, with the sub-tasks it handed out. */
export function waitForAssistantWork(ports: Parameters<typeof watchWorks>[0] & { read(): Promise<AssistantWorkView> }, workId: string, since: string | null, timeoutMs: number, signal?: AbortSignal) {
  const ids = [workId, ...ports.store.delegatedBy(ports.actorId, ports.store.get(ports.actorId, workId)).map(child => child.work_id)];
  return waitForWorkChange({ read: ports.read, since, timeoutMs, signal, ...watchWorks(ports, ids) });
}
