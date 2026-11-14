import { isDeepStrictEqual } from "node:util";
import { memoryErrors, type MemoryBackendPort, type MemoryCaller, type MemoryLearned, type MemoryService } from "@molis-ai/molis-work-service-memory";
import type { AgentSessionWriteObservation, AgentMemoryExecutionControl, AgentMemorySourceRef, AgentMemoryFormationResult, AgentMemorySourceSnapshot, AgentRuntimeAdapter, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assistantMemorySources, assistantMemorySourceWork } from "../assistant/assistant-memory-sources.js";
import { ASSISTANT_PLUGIN_ID, ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import type { MemoryLearningOwnedSource } from "@molis-ai/molis-work-contracts/services/memory";
import { readMemoryInputSource } from "./memory-source-identity.js";
import { controlledMemoryService } from "./memory-effect.js";

export interface MemoryLearningRequest {
  caller: MemoryCaller;
  said: string[];
  sources?: readonly AgentMemorySourceSnapshot[];
}
export interface MemoryLearningResult {
  ran: boolean;
  reason: string;
  learned: MemoryLearned[];
  formation?: AgentMemoryFormationResult;
  recording_error?: { code: string };
}

/** The queue keeps its current owner checks; all automatic extraction and candidate writes go through SDK form. */
export async function learnFromWork(service: MemoryService, request: MemoryLearningRequest,
  stillWanted: () => Promise<boolean> = async () => true): Promise<MemoryLearningResult> {
  const said = request.said.map(text => text.trim()).filter(Boolean).slice(-6);
  if (said.some(text => text.length > 1500)) return { ran: false, reason: "原始表态超出本轮提炼范围，没有截断后推断", learned: [] };
  if (!await stillWanted()) return { ran: false, reason: "原始输入或学习权限已变化，什么都没有记", learned: [] };
  const result = await service.learnFromWork(request.caller, { said, ...(request.sources ? { sources: request.sources } : {}) });
  return { ran: result.formation.extraction.calls > 0,
    reason: result.formation.outcome === "completed" ? "已完成本轮提炼" : result.formation.outcome === "skipped" ? "本轮没有形成信号" : "本轮形成未全部完成，请按逐项结果对账",
    learned: result.learned, formation: result.formation, ...(result.recording_error ? { recording_error: result.recording_error } : {}) };
}

/** The existing queue's one learning invocation, with fresh owner checks through each actual SDK write. */
export async function learnFromQueuedWork(home: string, task: Pick<AgentScheduledTask, "key" | "session_id" | "payload">, input: {
  adapter: AgentRuntimeAdapter;
  service: MemoryService;
  ports: ConstructorParameters<typeof MemoryService>[0];
  backend(control: AgentMemoryExecutionControl): MemoryBackendPort;
  alive(): boolean;
  projectExists?(id: string): Promise<boolean | null>;
}): Promise<MemoryLearningResult> {
  const originals = await assistantMemorySources(home, input.adapter, task);
  if (!originals) return { ran: false, reason: "原始输入已失效或无法核验，没有提炼", learned: [] };
  const { caller, said } = originals.request;
  const binding = formationSourceBinding(home, input.adapter, caller);
  const assertCurrent = () => {
    binding.assert_current();
    if (!input.alive() || !input.service.worthLearning(caller, said) || !caller.session_id
      || assistantMemorySourceWork(home, caller.actor_id, caller.session_id)?.project_id !== caller.project_id)
      throw memoryErrors.forbidden("原工作或学习权限已失效");
  };
  const stillWanted = async () => {
    if (!input.alive() || !input.service.worthLearning(caller, said)) return false;
    if (caller.project_id && await input.projectExists?.(caller.project_id).catch(() => null) !== true) return false;
    return await originals.current() && input.alive() && input.service.worthLearning(caller, said);
  };
  try {
    if (!await stillWanted()) return { ran: false, reason: "原始输入或学习权限已变化，没有提炼", learned: [] };
    const controlled = controlledMemoryService({ ...input.ports, bindFormationSources: binding.bind }, input.backend, {
      assert_current: assertCurrent,
      beforeEffect: async () => { if (!await stillWanted()) throw memoryErrors.forbidden("原始输入或学习权限已变化，停止记忆写入"); },
    });
    const result = await learnFromWork(controlled, { ...originals.request, caller: { ...originals.request.caller, operation_id: task.key } }, stillWanted);
    if (result.recording_error || result.formation && !["completed", "skipped"].includes(result.formation.outcome))
      throw memoryErrors.conflict("记忆形成尚未全部记账，请携原操作重试", { formation: result.formation, recording_error: result.recording_error });
    return result;
  } finally { binding.dispose(); }
}

/** Bind only the union selected by Memory; this is identity preparation, never an authorization snapshot. */
export function formationSourceBinding(home: string, adapter: AgentRuntimeAdapter, caller: MemoryCaller,
  codingCheck?: (sources: readonly MemoryLearningOwnedSource[]) => void) {
  let coding: readonly MemoryLearningOwnedSource[] = [], assistant: readonly { session_id: string; project_id: string | null }[] = [];
  const observations: AgentSessionWriteObservation[] = [], observed = new Set<string>();
  let closed = false;
  const assert_current = () => {
    if (closed) throw memoryErrors.forbidden("原形成调用已结束");
    for (const observation of observations) observation.assert_current();
    if (coding.length) {
      if (!codingCheck) throw memoryErrors.forbidden("这次来源调用不拥有 Coding 业务检查");
      codingCheck(coding);
    }
    for (const source of assistant) if (assistantMemorySourceWork(home, caller.actor_id, source.session_id)?.project_id !== source.project_id)
      throw memoryErrors.forbidden("实际参与形成的助理来源已失效");
  };
  const bind = async (refs: readonly AgentMemorySourceRef[]) => {
    assert_current();
    const identities = refs.map(ref => readMemoryInputSource(ref));
    if (identities.some(identity => !identity || identity.actor_id !== caller.actor_id)) throw memoryErrors.forbidden("实际形成来源身份无效");
    const lifecycle = adapter.sessionLifecycle;
    if (!lifecycle?.observeWrites || !adapter.withEffect) throw memoryErrors.unavailable("实际来源会话写观察不可用");
    const added = [...new Set(identities.map(identity => identity!.session_id))].filter(id => !observed.has(id));
    if (added.length) {
      observations.push(lifecycle.observeWrites(added.map(session_id => ({ session_id, runtime_id: adapter.descriptor.runtime_id }))));
      for (const id of added) observed.add(id);
    }
    const nextCoding: MemoryLearningOwnedSource[] = [], nextAssistant: Array<{ session_id: string; project_id: string | null }> = [];
    for (const [position, ref] of refs.entries()) {
      const identity = identities[position]!;
      const canonical = await lifecycle.read({ session_id: identity.session_id, runtime_id: adapter.descriptor.runtime_id });
      assert_current();
      if (canonical.view.state !== "active") throw memoryErrors.forbidden("实际形成来源执行会话已归档");
      const session = await adapter.readSessionStatus?.({ session_id: identity.session_id, runtime_id: adapter.descriptor.runtime_id });
      if (!session || !isDeepStrictEqual(session.owner, canonical.owner) || session.owner.actor_id !== caller.actor_id || session.status.recovery) throw memoryErrors.forbidden("实际形成来源的主人不可核验");
      if (session.owner.plugin_id === ASSISTANT_PLUGIN_ID) nextAssistant.push({ session_id: identity.session_id,
        project_id: session.owner.project_id === ASSISTANT_PERSONAL_OWNER ? null : session.owner.project_id });
      else if (session.owner.plugin_id === "io.molis.work.coding") nextCoding.push(Object.freeze({ ...ref, session_id: identity.session_id }));
      else throw memoryErrors.forbidden("实际形成来源不属于可用的来源主人");
    }
    coding = Object.freeze([...coding, ...nextCoding.filter(next => !coding.some(old => old.event_id === next.event_id && old.version === next.version && old.session_id === next.session_id))]);
    assistant = Object.freeze([...assistant, ...nextAssistant.filter(next => !assistant.some(old => old.session_id === next.session_id && old.project_id === next.project_id))]);
    assert_current();
  };
  return { bind, assert_current, dispose() { closed = true; for (const observation of observations) observation.dispose(); observations.length = 0; observed.clear(); } };
}
