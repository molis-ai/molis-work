import { memoryErrors, type MemoryBackendPort, type MemoryCaller, type MemoryLearned, type MemoryService } from "@molis-ai/molis-work-service-memory";
import type { AgentMemoryExecutionControl, AgentMemoryFormationResult, AgentMemorySourceSnapshot, AgentRuntimeAdapter, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assistantMemorySources, assistantMemorySourceWork } from "../assistant/assistant-memory-sources.js";
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
  const assertCurrent = () => {
    if (!input.alive() || !input.service.worthLearning(caller, said) || !caller.session_id
      || assistantMemorySourceWork(home, caller.actor_id, caller.session_id)?.project_id !== caller.project_id)
      throw memoryErrors.forbidden("原工作或学习权限已失效");
  };
  const stillWanted = async () => {
    if (!input.alive() || !input.service.worthLearning(caller, said)) return false;
    if (caller.project_id && await input.projectExists?.(caller.project_id).catch(() => null) !== true) return false;
    return await originals.current() && input.alive() && input.service.worthLearning(caller, said);
  };
  if (!await stillWanted()) return { ran: false, reason: "原始输入或学习权限已变化，没有提炼", learned: [] };
  const controlled = controlledMemoryService(input.ports, input.backend, {
    assert_current: assertCurrent,
    beforeEffect: async () => { if (!await stillWanted()) throw memoryErrors.forbidden("原始输入或学习权限已变化，停止记忆写入"); },
  });
  const result = await learnFromWork(controlled, { ...originals.request, caller: { ...originals.request.caller, operation_id: task.key } }, stillWanted);
  if (result.recording_error || result.formation && !["completed", "skipped"].includes(result.formation.outcome))
    throw memoryErrors.conflict("记忆形成尚未全部记账，请携原操作重试", { formation: result.formation, recording_error: result.recording_error });
  return result;
}
