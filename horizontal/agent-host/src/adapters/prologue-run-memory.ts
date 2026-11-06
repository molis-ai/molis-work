import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryControl, MemoryRecallReference } from "@prologue/sdk";
import { ActionError, requireSynchronous, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionClient, AgentFrozenRole, AgentRecalledMemory, AgentStartExecution } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_PROVIDER_ID, memoryActions, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { isEnded, type RunRecord } from "./prologue-run-store.js";

type Identity = { memory_id: string; version: number; scope: MemoryScope };
/** A single live Run's selection bridge. It owns no memory contents, permissions, budget or model loop. */
export class RunMemoryBinding {
  #resolve!: (held: { record: RunRecord; memory: AgentMemoryControl } | undefined) => void;
  readonly #ready = new Promise<{ record: RunRecord; memory: AgentMemoryControl } | undefined>(resolve => { this.#resolve = resolve; });
  #held: { record: RunRecord; memory: AgentMemoryControl } | undefined;
  #closed = false;
  constructor(private readonly recipe: AgentRecalledMemory | undefined, private readonly beforeDispatch?: AgentStartExecution["beforeDispatch"]) {}

  bind(record: RunRecord, memory: AgentMemoryControl | undefined): void {
    if (this.#closed || !memory) { this.close(); return; }
    this.#held = { record, memory };
    this.#resolve(this.#held);
  }
  close(): void { this.#closed = true; this.#held = undefined; this.#resolve(undefined); }
  assertCurrent = (): void => {
    const record = this.#held?.record;
    if (this.#closed || !record || isEnded(record.view.phase) || isEnded(record.control.state))
      throw new ActionError("actions.unavailable", "原 Run 已结束或未接通记忆展开");
  };
  async #wait<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (!signal) return work;
    let cancel: (() => void) | undefined;
    try { return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      cancel = () => reject(signal.reason); signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
    })]); } finally { if (cancel) signal.removeEventListener("abort", cancel); }
  }
  async #current(signal?: AbortSignal) {
    const held = await this.#wait(this.#ready, signal);
    if (!held) throw new ActionError("actions.unavailable", "本轮没有可用的记忆展开");
    const fence = await this.#wait(Promise.resolve().then(() => this.beforeDispatch?.()), signal);
    requireSynchronous(fence?.(), "最终派发检查必须同步完成");
    signal?.throwIfAborted(); this.assertCurrent(); return held;
  }
  async #expand(items: readonly Identity[], signal?: AbortSignal) {
    const { memory } = await this.#current(signal);
    const references: MemoryRecallReference[] = items.map(item => {
      const scope = item.scope === "personal" ? "user" : item.scope;
      const slots = this.recipe?.scopes.filter(one => one.scope === scope) ?? [];
      if (slots.length !== 1) throw new ActionError("actions.unavailable", "记忆身份不属于本轮的授权范围");
      return { scope, owner: slots[0]!.owner, ref: { kind: "memory", id: item.memory_id, revision: 1 }, version: item.version };
    });
    this.assertCurrent();
    const receipt = await memory.expand({ references, ...(signal ? { signal } : {}) });
    signal?.throwIfAborted(); this.assertCurrent();
    return { receiptId: receipt.receiptId, outcome: receipt.outcome, tokens: receipt.tokens, basis: receipt.basis, remainingTokens: receipt.remainingTokens,
      ...(receipt.errorCode ? { errorCode: receipt.errorCode } : {}) };
  }
  client(client: AgentActionClient, frozen?: readonly ActionView[]): AgentActionClient {
    const memory = client.memory;
    return { ...client,
      invoke: async (reference, input, signal) => {
        const definition = reference.provider_id === MEMORY_PROVIDER_ID
          ? [memoryActions.list, memoryActions.recall].find(one => one.capability_id === reference.capability_id && one.version === reference.version) : undefined;
        if (!definition) return client.invoke(reference, input, signal);
        await this.#current(signal);
        const current = (await client.discover()).find(view => sameIdentity(view, reference));
        const original = frozen?.find(view => sameIdentity(view, reference)) ?? current;
        if (!current || !original || !current.availability.available || current.operation !== "query"
          || !isDeepStrictEqual(current.action, definition.action) || !isDeepStrictEqual(current.action, original.action))
          throw new ActionError("actions.unavailable", "原记忆能力已不可用或合同已改变");
        this.assertCurrent();
        // The ActionService still validates its original body-bearing output before this tool-only projection.
        const result = await client.invoke(reference, input, signal, { assert_current: this.assertCurrent }) as { items: Identity[] };
        return this.#expand(result.items, signal);
      },
      ...(memory ? { memory: { ...memory,
        // Only the protected Host list supplies these canonical identities, never tool arguments.
        expandList: async control => { await this.#current(control.signal); return this.#expand(await memory.list(control), control.signal); },
      } } : {}),
    };
  }
  role(role: AgentFrozenRole): AgentFrozenRole {
    return { ...role, ...(role.actions ? { actions: { ...role.actions, client: this.client(role.actions.client, role.actions.tools) } } : {}),
      ...(role.action_gateway ? { action_gateway: { ...role.action_gateway, client: this.client(role.action_gateway.client) } } : {}) };
  }
}
function sameIdentity(view: ActionView, reference: ExactActionReference): boolean {
  return view.provider.provider_id === reference.provider_id && view.capability_id === reference.capability_id && view.version === reference.version;
}
