import type { AgentMemoryCandidateEntry, AgentMemoryCapability, AgentMemoryEntry, AgentMemoryExecutionControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors, type MemoryBackendPort, type MemoryCaller } from "@molis-ai/molis-work-service-memory";

/** Prologue Memory of the runtime as the memory service's store: personal memories are its `user` scope. */
export function prologueMemoryBackend(source: () => Promise<AgentMemoryCapability>, control?: AgentMemoryExecutionControl, caller?: MemoryCaller): MemoryBackendPort {
  const store = async () => {
    if (!caller) throw memoryErrors.off("记忆后端缺少可信调用者");
    const memory = (await source()).withCaller({ actor_id: caller.actor_id, project_id: caller.project_id, consumer: caller.consumer,
      ...(caller.plugin_id ? { plugin_id: caller.plugin_id } : {}), ...(caller.person !== undefined ? { person: caller.person } : {}),
      ...(caller.session_id ? { session_id: caller.session_id } : {}),
      ...(caller.class_restrictions ? { class_restrictions: structuredClone(caller.class_restrictions) } : {}),
      ...(caller.run_explicit ? { run_explicit: true as const } : {}),
      ...(caller.source_use ? { source_use: caller.source_use } : {}),
      ...(caller.character ? { character_id: caller.character.id } : {}),
      current_scene: caller.current_scene ?? (caller.plugin_id === "io.molis.work.coding" ? "coding" : caller.consumer === "assistant" ? "assistant" : "common"), purpose: caller.purpose ?? "management" });
    if (!control) return memory;
    if (!memory.withExecution) throw memoryErrors.off("当前运行时不能保留记忆调用的执行控制");
    return memory.withExecution(control);
  };
  const prologueScope = (scope: MemoryScope) => scope === "personal" ? "user" as const : scope === "character" ? "character" as const : "project" as const;
  const view = ({ scope: _scope, owner: _owner, ...entry }: AgentMemoryEntry) => entry;
  const candidateView = ({ scope: _scope, owner: _owner, ...entry }: AgentMemoryCandidateEntry) => entry;
  return {
    withCaller: next => prologueMemoryBackend(source, control, Object.freeze(structuredClone(next))),
    list: async (scope, owner) => (await (await store()).list(prologueScope(scope), owner)).map(view),
    page: async input => {
      const page = await (await store()).page({ ...input, scope: prologueScope(input.scope) });
      return { ...page, items: page.items.map(view) };
    },
    verifyPurgeCoverage: async input => (await store()).verifyPurgeCoverage(input),
    previewPurge: async input => (await store()).previewPurge({ ...input, scope: prologueScope(input.scope) }),
    write: async input => view(await (await store()).write({ ...input, scope: prologueScope(input.scope) })),
    update: async input => view(await (await store()).update({ ...input, scope: prologueScope(input.scope) })),
    setMeta: async input => view(await (await store()).setMeta({ ...input, scope: prologueScope(input.scope) })),
    pause: async input => view(await (await store()).pause({ ...input, scope: prologueScope(input.scope) })),
    disable: async input => view(await (await store()).disable({ ...input, scope: prologueScope(input.scope) })),
    resume: async input => view(await (await store()).resume({ ...input, scope: prologueScope(input.scope) })),
    renew: async input => view(await (await store()).renew({ ...input, scope: prologueScope(input.scope) })),
    previewMutation: async input => (await store()).previewMutation({ ...input, scope: prologueScope(input.scope) }),
    tombstone: async input => view(await (await store()).tombstone({ ...input, scope: prologueScope(input.scope) })),
    remove: async input => (await store()).remove({ ...input, scope: prologueScope(input.scope) }),
    screen: async text => { const memory = await source(); if (!memory.screen) throw memoryErrors.off("当前运行时不能筛查"); return memory.screen(text); },
    previewScope: async (scope, owner) => (await store()).previewScope(prologueScope(scope), owner),
    clearScope: async input => (await store()).clearScope({ ...input, scope: prologueScope(input.scope) }),
    candidates: {
      form: async ({ slots, context, ...input }) => (await store()).candidates.form({ ...input,
        ...(slots ? { slots: slots.map(slot => ({ ...slot, scope: prologueScope(slot.scope) })) } : {}),
        ...(context ? { context: { ...context,
          existing: context.existing.map(entry => ({ ...entry, scope: prologueScope(entry.scope) })),
          pending: context.pending.map(entry => ({ ...entry, scope: prologueScope(entry.scope) })),
        } } : {}),
      }),
      propose: async input => candidateView(await (await store()).candidates.propose({ ...input, scope: prologueScope(input.scope) })),
      list: async (scope, owner) => (await (await store()).candidates.list(prologueScope(scope), owner)).map(candidateView),
      get: async input => {
        const found = await (await store()).candidates.get({ ...input, scope: prologueScope(input.scope) });
        return found && candidateView(found);
      },
      accept: async input => view(await (await store()).candidates.accept({ ...input, scope: prologueScope(input.scope) })),
      promote: async input => view(await (await store()).candidates.promote({ ...input, scope: prologueScope(input.scope) })),
      settleInto: async input => view(await (await store()).candidates.settleInto({ ...input, scope: prologueScope(input.scope) })),
      discard: async input => candidateView(await (await store()).candidates.discard({ ...input, scope: prologueScope(input.scope) })),
      expire: async input => candidateView(await (await store()).candidates.expire({ ...input, scope: prologueScope(input.scope) })),
      reconcileDecision: async input => (await store()).candidates.reconcileDecision({ ...input, scope: prologueScope(input.scope) }),
      purge: async input => (await store()).candidates.purge({ ...input, scope: prologueScope(input.scope) }),
    },
  };
}
