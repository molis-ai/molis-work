import { agentErrors } from "./errors.js";

/** Captures only the original affected Runs. Retrying never discovers or cancels their replacements. */
export interface WorkDelegationCancellation { settle(): Promise<void> }

export class DelegationCancellations {
  readonly #pending = new Map<string, Set<WorkDelegationCancellation>>();
  readonly #tasks = new Map<string, Promise<void>>();
  add(key: string, receipt: WorkDelegationCancellation): void {
    const pending = this.#pending.get(key) ?? new Set(); pending.add(receipt); this.#pending.set(key, pending);
  }
  pending(key: string): boolean { return Boolean(this.#pending.get(key)?.size); }
  settle(key: string): Promise<void> {
    const running = this.#tasks.get(key); if (running) return running;
    const settle = async () => {
      const pending = this.#pending.get(key);
      while (pending?.size) {
        const batch = [...pending], results = await Promise.allSettled(batch.map(async receipt => receipt.settle()));
        results.forEach((result, index) => { if (result.status === "fulfilled") pending.delete(batch[index]!); });
        if (results.some(result => result.status === "rejected")) throw agentErrors.delegation_cancellation_pending("授权已失效，原轮停止回执待核对；请重试收口");
      }
      this.#pending.delete(key);
    };
    const task = settle(); this.#tasks.set(key, task);
    void task.finally(() => { if (this.#tasks.get(key) === task) this.#tasks.delete(key); }).catch(() => undefined);
    return task;
  }
  async close(): Promise<void> { await Promise.allSettled([...this.#tasks.values()]); this.#pending.clear(); this.#tasks.clear(); }
}
