import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { MEMORY_KINDS } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller, MemoryLearned, MemoryProposal, MemoryService } from "@molis-ai/molis-work-service-memory";
import { MEMORY_EXTRACT } from "../agent-definitions/system-prompts.js";
import { resolveModelPrompt } from "../agent-definitions/instructions.js";
import { hostTextGeneration, type HostTextGeneration } from "../host-complete-text.js";

/**
 * Drawing memories out of a finished work (specs/memory-system §6.1 item 2). The model reads the person's own words and
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

export async function learnFromWork(service: MemoryService, homeDirectory: string, request: MemoryLearningRequest,
  generate: HostTextGeneration | undefined = hostTextGeneration({ homeDirectory })): Promise<{ ran: boolean; reason: string; learned: MemoryLearned[] }> {
  const said = request.said.map(text => text.trim()).filter(Boolean).slice(-6).map(text => text.slice(0, 1500));
  if (!service.worthLearning(request.caller, said)) return { ran: false, reason: "这一轮没有值得学习的表态，或没有允许从工作里学习", learned: [] };
  if (!generate) return { ran: false, reason: "没有可用的文字模型", learned: [] };
  const context = await service.learningContext(request.caller);
  const data = JSON.stringify({
    有项目: Boolean(request.caller.project_id),
    工作: request.caller.work?.title ?? null,
    用户说的话: said,
    已有的记忆: context.existing,
    等待认可的建议: context.pending,
  });
  const result = await generate(resolveModelPrompt(homeDirectory, instructed(MEMORY_EXTRACT, data), "memory.extract"), {
    structured: { mode: "local", name: "memory_proposals", schema: PROPOSALS_SCHEMA as never }, timeoutMs: 120_000, maxOutputTokens: 1500,
  });
  const proposals = (result.structured as { candidates?: MemoryProposal[] } | undefined)?.candidates;
  if (!Array.isArray(proposals)) return { ran: true, reason: "模型没有给出合格式的提议，什么都没有记", learned: [] };
  return { ran: true, reason: "已提炼", learned: await service.learnFromWork(request.caller, { said, proposals }) };
}
