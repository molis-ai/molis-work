import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { MEMORY_KINDS } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors, type MemoryBackendPort, type MemoryCaller, type MemoryLearned, type MemoryProposal, type MemoryService } from "@molis-ai/molis-work-service-memory";
import type { AgentMemoryExecutionControl, AgentRuntimeAdapter, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assistantMemorySources } from "../assistant/assistant-memory-sources.js";
import { controlledMemoryService } from "./memory-effect.js";
import { MEMORY_EXTRACT } from "../agent-definitions/system-prompts.js";
import { resolveModelPrompt } from "../agent-definitions/instructions.js";
import { hostTextGeneration, type HostTextGeneration } from "../host-complete-text.js";

/**
 * Drawing memories out of a finished work (specs/archive/memory-system §6.1 item 2). The model reads the person's own words and
 * proposes; the memory service's write gate decides. A malformed or failed answer leaves nothing behind.
 */
export interface MemoryLearningRequest {
  caller: MemoryCaller;
  /** The person's own messages in this work, newest last (bounded). */
  said: string[];
}

const PROPOSALS_SCHEMA = {
  type: "object",
  properties: {
    candidates: { type: "array", maxItems: 3, items: { type: "object", properties: {
      text: { type: "string", minLength: 1, maxLength: 200 },
      kind: { type: "string", enum: [...MEMORY_KINDS] },
      scope: { type: "string", enum: ["personal", "project"] },
      applies_when: { type: ["string", "null"], maxLength: 100 },
      basis: { type: "string", enum: ["explicit", "inferred"] },
      quote: { type: "string", maxLength: 200 },
      same_as: { type: ["string", "null"], maxLength: 200 },
      supersedes: { type: ["string", "null"], maxLength: 200 },
    }, required: ["text", "kind", "scope", "basis", "quote"], additionalProperties: false } },
  },
  required: ["candidates"],
  additionalProperties: false,
} as const;

/**
 * `stillWanted` rechecks the work's current source and permission to learn. The Host also binds the actual SDK and
 * ledger writes to that invocation; checking here alone cannot protect a later asynchronous write.
 */
export async function learnFromWork(service: MemoryService, homeDirectory: string, request: MemoryLearningRequest,
  generate: HostTextGeneration | undefined = hostTextGeneration({ homeDirectory }),
  stillWanted: () => Promise<boolean> = async () => true): Promise<{ ran: boolean; reason: string; learned: MemoryLearned[] }> {
  const said = request.said.map(text => text.trim()).filter(Boolean).slice(-6).map(text => text.slice(0, 1500));
  if (!service.worthLearning(request.caller, said)) return { ran: false, reason: "这一轮没有值得学习的表态，或没有允许从工作里学习", learned: [] };
  if (!generate) return { ran: false, reason: "没有可用的文字模型", learned: [] };
  if (!await stillWanted()) return { ran: false, reason: "原始输入或学习权限已变化，什么都没有记", learned: [] };
  const context = await service.learningContext(request.caller);
  if (!await stillWanted()) return { ran: false, reason: "原始输入或学习权限已变化，什么都没有记", learned: [] };
  const data = JSON.stringify({
    有项目: Boolean(request.caller.project_id),
    工作: request.caller.work?.title ?? null,
    用户说的话: said,
    已有的记忆: context.existing,
    等待认可的建议: context.pending,
  });
  const result = await generate(resolveModelPrompt(homeDirectory, instructed(MEMORY_EXTRACT, data), "memory.extract"), {
    structured: { mode: "local", name: "memory_proposals", schema: PROPOSALS_SCHEMA as never }, timeoutMs: 120_000, maxOutputTokens: 1500,
    beforeDispatch: async () => { if (!await stillWanted()) throw memoryErrors.forbidden("原始输入或学习权限已变化，停止提炼"); },
  });
  const proposals = (result.structured as { candidates?: MemoryProposal[] } | undefined)?.candidates;
  if (!Array.isArray(proposals)) return { ran: true, reason: "模型没有给出合格式的提议，什么都没有记", learned: [] };
  if (!await stillWanted()) return { ran: true, reason: "原始输入或学习权限已变化，什么都没有记", learned: [] };
  return { ran: true, reason: "已提炼", learned: await service.learnFromWork(request.caller, { said, proposals }) };
}

/** The existing queue's one learning invocation, with fresh owner checks through each actual SDK write. */
export async function learnFromQueuedWork(home: string, task: Pick<AgentScheduledTask, "key" | "session_id" | "payload">, input: {
  adapter: AgentRuntimeAdapter;
  service: MemoryService;
  ports: ConstructorParameters<typeof MemoryService>[0];
  backend(control: AgentMemoryExecutionControl): MemoryBackendPort;
  alive(): boolean;
  projectExists?(id: string): Promise<boolean | null>;
}, generate?: HostTextGeneration): Promise<{ ran: boolean; reason: string; learned: MemoryLearned[] }> {
  const originals = await assistantMemorySources(home, input.adapter, task);
  if (!originals) return { ran: false, reason: "原始输入已失效或无法核验，没有提炼", learned: [] };
  const { caller, said } = originals.request;
  const assertCurrent = () => {
    if (!input.alive() || !input.service.worthLearning(caller, said)) throw memoryErrors.forbidden("原工作或学习权限已失效");
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
  return learnFromWork(controlled, home, originals.request, generate, stillWanted);
}
