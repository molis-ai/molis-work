import { agentErrors } from "../errors.js";
import { isTerminalAgentPhase, type AgentActionClient, type AgentRecalledMemory, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_PROVIDER_ID, type MemoryRunReadControl, type MemoryRunReadResult, type MemoryRunReference } from "@molis-ai/molis-work-contracts/services/memory";
import type { PrologueControlPort, PrologueModelConfiguration } from "./prologue.js";
import type { PrologueStreamState } from "./prologue-stream.js";
import { runMemoryContext } from "./prologue-memory-usage.js";

export interface RunRecord {
  /** Live SDK control only; never restored from persisted history. */
  memory?: PrologueRunMemoryPort;
  view: AgentRunView;
  state: PrologueStreamState;
  control: PrologueControlPort;
  /** The model this Run started with (live runs only): what a switch has to stay compatible with. */
  model?: PrologueModelConfiguration;
  unsubscribe: () => void;
  listeners: Set<(view: AgentRunView) => void>;
  timingCommit?: Promise<void>;
  timingReady?: boolean;
  timingError?: string;
  observedEndAt?: string;
  memory_context?: Pick<AgentRecalledMemory, "consumer" | "usage"> & Partial<Pick<AgentRecalledMemory, "class_restrictions" | "current_scene">>;
}

/** Only the Adapter translates this narrow port to SDK memory.expand. */
export interface PrologueRunMemoryPort {
  expand(references: readonly MemoryRunReference[], signal?: AbortSignal): Promise<MemoryRunReadResult>;
}

/** One start's hand-off to its existing RunRecord, not another Run registry or permission cache. */
export function bindRunMemory(recipe: AgentRecalledMemory | undefined, validate: () => void | Promise<void>) {
  let resolve!: (record: RunRecord) => void, reject!: (error: unknown) => void;
  const ready = new Promise<RunRecord>((yes, no) => { resolve = yes; reject = no; });
  void ready.catch(() => undefined);
  const wait = async (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (!signal) return ready;
    let stop!: () => void;
    const cancelled = new Promise<never>((_yes, no) => { stop = () => no(signal.reason); signal.addEventListener("abort", stop, { once: true }); });
    try { return await Promise.race([ready, cancelled]); }
    finally { signal.removeEventListener("abort", stop); }
  };
  const control: MemoryRunReadControl = {
    async read(select, signal) {
      const record = await wait(signal);
      const current = async () => {
        signal?.throwIfAborted();
        await validate();
        signal?.throwIfAborted();
        if (!recipe?.class_restrictions || !recipe.scopes.length || !record.memory
          || isTerminalAgentPhase(record.view.phase) || record.view.phase === "reconcile-required"
          || ["completed", "failed", "stopped", "cancelled"].includes(record.control.state))
          throw agentErrors.capability_unavailable("这一轮已结束或没有可用的记忆读取控制");
      };
      await current();
      const references = await select(structuredClone(recipe!.scopes));
      await current();
      // The SDK checks exact refs/versions against its original scopes, live permission and shared budget.
      return record.memory!.expand(structuredClone(references), signal);
    },
  };
  return {
    /** Build the one live observation record; readiness is still published only after Adapter subscriptions exist. */
    record(input: Pick<RunRecord, "view" | "state" | "control" | "model">, memory?: PrologueRunMemoryPort): RunRecord {
      return { ...input, ...(memory ? { memory } : {}), ...runMemoryContext(recipe), unsubscribe: () => {}, listeners: new Set() };
    },
    ready: resolve,
    failed: reject,
    client(source: AgentActionClient): AgentActionClient {
      return { ...source,
        invoke: (reference, input, signal) => source.invoke(reference, input, signal,
          reference.provider_id === MEMORY_PROVIDER_ID && ["memory.list", "memory.recall"].includes(reference.capability_id) ? control : undefined),
        ...(source.memory ? { memory: { ...source.memory,
          ...(source.memory.list ? { list: call => source.memory!.list!({ ...call, memory_read: control }) } : {}),
        } } : {}),
      };
    },
  };
}
