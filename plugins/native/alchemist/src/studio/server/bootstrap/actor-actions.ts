import type { AsyncLocalStorage } from "node:async_hooks";
import type { Clock } from "../../domain/kernel/identity.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { AlchemistActionInvoker } from "../services/action-operations.js";

/** Tracks actual executors, including work that ignores cancellation, until they settle. */
export function actionsInFlight() {
  const active = new Set<Promise<unknown>>();
  const stop = new AbortController();
  return {
    none: () => active.size === 0,
    revoke: () => stop.abort(new Error("alchemist.alchemist_closed")),
    whenIdle: () => Promise.allSettled([...active]),
    track(invoker: AlchemistActionInvoker): AlchemistActionInvoker {
      return { invoke: async (definition, input, callerSignal, control) => {
        const signal = AbortSignal.any([stop.signal, ...(callerSignal ? [callerSignal] : [])]);
        const assertCurrent = () => { signal.throwIfAborted(); control?.assert_authority_current?.(); };
        assertCurrent();
        const work = Promise.resolve().then(() => {
          assertCurrent();
          return invoker.invoke(definition, input, signal, {
            assert_authority_current: assertCurrent,
            beforeEffect: async () => { assertCurrent(); await control?.beforeEffect(); assertCurrent(); },
          });
        });
        active.add(work);
        try { return await work; } finally { active.delete(work); }
      } };
    },
  };
}

/** Bind one trusted actor without writing before the invocation's effect check. */
export function bindAlchemistActor(owner: string, d: { database: SqliteDatabase; actors: AsyncLocalStorage<string>;
  clock: Clock; actions: AlchemistActionInvoker; closed(): boolean }): AlchemistActionInvoker {
  if (!owner.trim()) throw new Error("alchemist.alchemist_actor_required");
  if (d.closed()) throw new Error("alchemist.alchemist_closed");
  return { invoke: async (definition, input, signal, control) => {
    signal?.throwIfAborted(); await control?.beforeEffect(); control?.assert_authority_current?.(); signal?.throwIfAborted();
    if (d.closed()) throw new Error("alchemist.alchemist_closed");
    d.database.prepare("INSERT OR IGNORE INTO workspace_actors (id, workspace_id, kind, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(owner, "workspace-local", "local_user", owner, d.clock.now());
    return d.actors.run(owner, () => d.actions.invoke(definition, input, signal, control));
  } };
}
