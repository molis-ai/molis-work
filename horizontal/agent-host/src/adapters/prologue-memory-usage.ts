import type { AgentMemoryUseReceipt, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { RunRecord } from "./prologue-run-store.js";

/** Deliver body-free Run observations; a failed projection never replays model execution. */
export class PrologueMemoryUsage {
  readonly #pending = new Map<string, Promise<boolean>>();
  constructor(private readonly sink?: (receipt: AgentMemoryUseReceipt) => void | Promise<void>) {}

  async record(record: RunRecord, owner: AgentSessionView["owner"]): Promise<void> {
    const fact = record.state.memory_recalled, context = record.memory_context;
    if (!fact?.contexts || !context || !this.sink || !fact.contexts.some(item => item.status !== "prepared" && item.references.length)) return;
    const receipt: AgentMemoryUseReceipt = { run: record.view.ref, owner, started_at: record.view.started_at,
      consumer: context.consumer, ...(context.usage ? { usage: context.usage } : {}), contexts: fact.contexts };
    const copy = structuredClone(receipt), previous = this.#pending.get(copy.run.run_id);
    const task = Promise.resolve(previous).then(async () => {
      try { await this.sink!(copy); return true; } catch { return false; }
    });
    this.#pending.set(copy.run.run_id, task);
    void task.then(() => { if (this.#pending.get(copy.run.run_id) === task) this.#pending.delete(copy.run.run_id); });
    if (await task) delete fact.recording_error;
    else fact.recording_error = "memory.receipt_unrecorded";
    if (record.state.memory_recalled === fact && record.view.memory_recalled) record.view.memory_recalled = structuredClone(fact);
  }

  async flush(): Promise<void> { await Promise.all(this.#pending.values()); }
}
