import { AsyncLocalStorage } from "node:async_hooks";
import type { ObservationSourceClass } from "@molis-ai/molis-work-contracts/services/observation";

/** The classes a Host entry may set for the work it runs (contract-design §5). `real` is the default; `demo` comes from the project. */
export type ObservationScopeClass = Exclude<ObservationSourceClass, "real" | "demo">;

interface SourceScope { readonly kind: ObservationScopeClass; readonly replay?: { readonly id: string; open: boolean }; open: boolean }
const sources = new AsyncLocalStorage<SourceScope>();

/**
 * Run the Host's own work as one class of source: a first read of a new connection, a catch-up after a break, an import, a platform
 * self-check, an evaluation replay. Everything recorded inside, the exit's action-call records included, carries it. Only the Host's entries
 * call this; a caller, a plugin or a model cannot name the class of what it does. The scope closes when `run` settles, so a timer, a
 * subscription or a poll it started and left behind is not of that class later on; an inner scope wins over an outer one.
 */
export async function withObservationSource<T>(kind: ObservationScopeClass, run: () => Promise<T> | T, replayId?: string): Promise<T> {
  const ownReplay = kind === "replay" && replayId ? { id: replayId, open: true } : undefined;
  const parent = sources.getStore();
  const scope: SourceScope = { kind, replay: ownReplay ?? (parent?.open ? parent.replay : undefined), open: true };
  try { return await sources.run(scope, run); }
  finally {
    scope.open = false;
    if (ownReplay) ownReplay.open = false;
  }
}

/** The class of the innermost open source scope, if any. */
export function currentObservationSource(): ObservationScopeClass | undefined {
  const scope = sources.getStore();
  return scope?.open ? scope.kind : undefined;
}

/** One Host-issued run identity, independent of any work/run identifiers reported by the scenario. */
export function currentEvaluationReplayId(): string | undefined {
  const scope = sources.getStore();
  return scope?.open && scope.replay?.open ? scope.replay.id : undefined;
}
