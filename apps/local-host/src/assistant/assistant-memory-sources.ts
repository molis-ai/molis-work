import { openReadOnlyHomeSqlite } from "@molis-ai/molis-work-storage";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentRuntimeAdapter, AgentRunView, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isMemoryClassRestrictions } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryLearningRequest } from "../memory/memory-learning.js";
import { ASSISTANT_STORE_NAME, AssistantStore, assistantWorkForSession } from "./assistant-store.js";
import { typedMemorySources, memorySourceIdentity, type AssistantMemorySourceRef } from "./assistant-inputs.js";
import { memoryInputSnapshots, memoryInputSource } from "../memory/memory-source-identity.js";

/** Only references cross the durable learning queue. Their bodies stay with the original owners. */
export interface AssistantMemoryLearningRequest {
  actor_id: string;
  work_id: string;
  session_id: string;
  run_id: string;
  sources: AssistantMemorySourceRef[];
}

type LearningTask = Pick<AgentScheduledTask, "key" | "session_id" | "payload">;
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const identity = memorySourceIdentity;

/** Current work owner of a canonical Session; no display round or recent-work scan can stand in for it. */
export function assistantMemorySourceWork(home: string, actorId: string, sessionId: string, explicit = false): { project_id: string | null } | undefined {
  const db = openReadOnlyHomeSqlite(home, ASSISTANT_STORE_NAME);
  try {
    const work = assistantWorkForSession(db, actorId, sessionId);
    return work && !work.archived && !work.delegated_by && (!work.continuation_hold || explicit && work.continuation_hold === "input")
      ? { project_id: work.project_ref?.project_id ?? null } : undefined;
  } finally { db.close(); }
}

/** Re-read one work's originals, including current withdrawal receipts; absence never authorizes learning. */
async function readSources(home: string, adapter: AgentRuntimeAdapter, task: LearningTask): Promise<{ source: AssistantMemoryLearningRequest; request: MemoryLearningRequest } | null> {
  const body = object(task.payload);
  if (!body) return null;
  const caller = object(body.caller), callerWork = object(caller?.work);
  const actor = body.actor_id ?? caller?.actor_id, workId = body.work_id ?? callerWork?.work_id;
  if (!nonempty(actor) || !nonempty(workId) || !nonempty(task.session_id)) return null;
  const db = openReadOnlyHomeSqlite(home, ASSISTANT_STORE_NAME);
  try {
    const store = new AssistantStore(db), work = store.get(actor, workId), rounds = store.rounds(workId);
    if (work.archived || work.delegated_by || work.continuation_hold || work.session_id !== task.session_id) return null;
    const trigger = rounds.find(round => task.key === `memory-learn:${workId}:${round.run_id}`);
    if (!trigger || (body.run_id !== undefined && body.run_id !== trigger.run_id)
      || (body.session_id !== undefined && body.session_id !== task.session_id)) return null;
    const projectId = work.project_ref?.project_id ?? null;
    if (caller && caller.project_id !== projectId) return null;
    const session = await adapter.readSession({ session_id: task.session_id, runtime_id: adapter.descriptor.runtime_id });
    if (session.owner.actor_id !== actor || session.owner.plugin_id !== ASSISTANT_PLUGIN_ID
      || session.owner.project_id !== (projectId ?? ASSISTANT_PERSONAL_OWNER) || session.recovery?.required) return null;
    const views = new Map<string, AgentRunView>();
    const readRun = async (id: string): Promise<AgentRunView | null> => {
      if (views.has(id)) return views.get(id)!;
      const stored = rounds.find(round => round.run_id === id);
      // The executor plugin owns its own session. An Assistant session reference cannot stand in for it.
      if (!stored || stored.executor === "plugin") return null;
      const run = await adapter.read({ session_id: task.session_id, run_id: id });
      if (run.ref.session_id !== task.session_id || run.ref.run_id !== id || run.phase !== "completed") return null;
      views.set(id, run); return run;
    };
    const policy = (await readRun(trigger.run_id))?.class_restrictions;
    if (!policy || policy.policy_version !== 2 || policy.taxonomy_version !== 1
      || !isMemoryClassRestrictions(policy.personal) || !isMemoryClassRestrictions(policy.project)) return null;
    let refs: AssistantMemorySourceRef[];
    if (body.sources !== undefined) {
      if (!Array.isArray(body.sources) || !body.sources.length || body.sources.length > 6) return null;
      refs = [];
      for (const raw of body.sources) {
        const ref = object(raw);
        if (!ref || Object.keys(ref).some(key => !["run_id", "input_id", "version", "original"].includes(key)) || !nonempty(ref.run_id)
          || (ref.input_id !== null && !nonempty(ref.input_id)) || ref.version !== "1") return null;
        const original = ref.original === undefined ? null : object(ref.original);
        if (ref.input_id === null ? !original || Object.keys(original).some(key => !["session_id", "input_id", "version"].includes(key))
          || original.session_id !== task.session_id || !nonempty(original.input_id) || original.version !== 1 : ref.original !== undefined) return null;
        refs.push({ run_id: ref.run_id, input_id: ref.input_id, version: "1", ...(original ? { original: { session_id: original.session_id as string, input_id: original.input_id as string, version: 1 as const } } : {}) });
      }
      if (new Set(refs.map(identity)).size !== refs.length) return null;
    } else {
      // An old queued snapshot is usable only when the original owners still prove every complete message.
      if (!Array.isArray(body.said) || !body.said.length || body.said.length > 6 || !body.said.every(nonempty)) return null;
      for (const round of rounds.slice(-30)) await readRun(round.run_id);
      const available = typedMemorySources([...views.values()]);
      refs = [];
      for (const text of body.said) {
        const index = available.findIndex(source => source.text.trim() === text);
        if (index < 0) return null;
        const [source] = available.splice(index, 1);
        const { text: _text, ...ref } = source!; refs.push(ref);
      }
    }
    const said: string[] = [], snapshots = [];
    for (const ref of refs) {
      const run = await readRun(ref.run_id);
      if (!run) return null;
      const source = typedMemorySources([run]).find(one => identity(one) === identity(ref));
      if (!source || !source.text.trim()) return null;
      const event = memoryInputSource({ actor_id: actor, session_id: task.session_id, kind: ref.original ? "original" : "supplement", input_id: ref.original?.input_id ?? ref.input_id! });
      const snapshot = memoryInputSnapshots(actor, [run]).find(item => item.event_id === event.event_id);
      if (!snapshot) return null;
      said.push(source.text); snapshots.push(snapshot);
    }
    const current = store.get(actor, workId);
    if (current.archived || current.delegated_by || current.continuation_hold || current.session_id !== task.session_id
      || (current.project_ref?.project_id ?? null) !== projectId) return null;
    return { source: { actor_id: actor, work_id: workId, session_id: task.session_id, run_id: trigger.run_id, sources: refs },
      request: { caller: { class_restrictions: structuredClone(policy), actor_id: actor, project_id: projectId, consumer: "assistant", session_id: task.session_id, operation_id: task.key,
        work: { work_id: workId, title: current.title } }, said, sources: snapshots } };
  } finally { db.close(); }
}

/** The queue and its final write guard share this same owner lookup, including after a restart. */
export async function assistantMemorySources(home: string, adapter: AgentRuntimeAdapter, task: LearningTask): Promise<{
  source: AssistantMemoryLearningRequest; request: MemoryLearningRequest; current(): Promise<boolean>;
} | null> {
  const first = await readSources(home, adapter, task).catch(() => null);
  if (!first) return null;
  const fixed = { ...task, payload: { ...first.source } };
  return { ...first, current: async () => {
    const now = await readSources(home, adapter, fixed).catch(() => null);
    return now !== null && now.request.caller.project_id === first.request.caller.project_id
      && now.request.said.length === first.request.said.length && now.request.said.every((text, index) => text === first.request.said[index])
      && JSON.stringify(now.request.sources) === JSON.stringify(first.request.sources)
      && JSON.stringify(now.request.caller.class_restrictions) === JSON.stringify(first.request.caller.class_restrictions);
  } };
}
