import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { AgentMemoryExtractionDraft, AgentMemoryExtractionRequest, AgentMemoryExtractor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { reportedTokenTotal, type PrologueStructuredRequest } from "@molis-ai/molis-work-service-agent-host";
import { memoryErrors, sameText, sameWords } from "@molis-ai/molis-work-service-memory";
import { isDeepStrictEqual } from "node:util";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";
import { MEMORY_EXTRACT } from "../agent-definitions/system-prompts.js";
import { resolveModelPrompt } from "../agent-definitions/instructions.js";
import { hostTextGeneration, type HostTextGeneration } from "../host-complete-text.js";

interface Draft {
  slot_id: string; text: string; applies_when?: { task: string };
  suggested_basis: "explicit" | "inferred";
  evidence: Array<{ source_id: string; quote: string }>;
}
function schema(input: AgentMemoryExtractionRequest, slotIds: string[]) {
  return { type: "object", properties: { drafts: { type: "array", maxItems: input.limits.max_drafts,
    items: { type: "object", properties: {
      slot_id: { type: "string", enum: slotIds },
      text: { type: "string", minLength: 1, maxLength: Math.min(200, input.limits.max_draft_chars) },
      // Models often answer "no condition" with a blank task; it is read as no condition below rather than failing the batch (BL-1073).
      applies_when: { type: "object", properties: { task: { type: "string", maxLength: 100 } }, required: ["task"], additionalProperties: false },
      suggested_basis: { type: "string", enum: ["explicit", "inferred"] },
      evidence: { type: "array", minItems: 1, maxItems: input.sources.length, items: { type: "object",
        properties: { source_id: { type: "string", enum: input.sources.map((_, index) => `s${index}`) }, quote: { type: "string", minLength: 1, maxLength: 200 } },
        required: ["source_id", "quote"], additionalProperties: false } },
    }, required: ["slot_id", "text", "suggested_basis", "evidence"], additionalProperties: false } } }, required: ["drafts"], additionalProperties: false } satisfies NonNullable<PrologueStructuredRequest["schema"]>;
}

/** One registered Host generation for all fixed destinations. The SDK owns admission and candidate writes. */
export function memoryExtractor(homeDirectory: string, generation: () => HostTextGeneration | undefined = () => hostTextGeneration({ homeDirectory })): AgentMemoryExtractor {
  return { async extract(_caller, input) {
    const generate = generation();
    if (!generate) throw memoryErrors.unavailable("没有可用的文字模型");
    input.signal.throwIfAborted();
    // The model sees one short ID per destination and kind: the SDK slots behind it differ only in what the model cannot see,
    // so each draft that names it takes the next free one (BL-1073: listing every slot cost tokens on every formation).
    const slots = new Map<string, AgentMemoryExtractionRequest["slots"][number][]>();
    const memories = new Map(input.context?.existing.map((entry, index) => [entry.memory_id, `m${index}`]));
    const destinations = new Map<string, { scope: string; replacement?: string; task?: string; slots: Record<string, string> }>();
    for (const slot of input.slots) {
      const target = slot.replacement?.memory_id, task = slot.meta.applies_when?.task;
      if (target && !memories.has(target)) memories.set(target, `m${memories.size}`);
      const key = JSON.stringify([slot.scope, target ?? null, task ?? null]);
      const group = destinations.get(key) ?? { scope: slot.scope, ...(target ? { replacement: memories.get(target)! } : {}),
        ...(task === undefined ? {} : { task }), slots: {} };
      const id = group.slots[slot.meta.kind!] ??= `d${slots.size}`;
      slots.set(id, [...slots.get(id) ?? [], slot]); destinations.set(key, group);
    }
    const existing = input.context?.existing ?? [], pending = input.context?.pending ?? [];
    const data = JSON.stringify({ work_title: input.context?.work_title ?? null,
      sources: input.sources.map((source, index) => ({ id: `s${index}`, text: source.text })),
      ...(existing.length ? { existing: existing.map(({ memory_id, version: _version, ...entry }) => ({ id: memories.get(memory_id)!, ...entry })) } : {}),
      ...(pending.length ? { pending: pending.map(({ scope, kind, text, work_title }, index) =>
        ({ id: `p${index}`, scope, kind, text, ...(work_title === undefined ? {} : { work_title }) })) } : {}),
      destinations: [...destinations.values()],
    });
    const outputSchema = schema(input, [...slots.keys()]);
    const result = await generate(resolveModelPrompt(homeDirectory, instructed(MEMORY_EXTRACT, data), "memory.extract"), {
      structured: { mode: "local", name: "memory_formation", schema: outputSchema }, signal: input.signal,
      timeoutMs: input.limits.timeout_ms, maxOutputTokens: 1500, beforeDispatch: input.before_dispatch,
    });
    result.validateResult(); input.signal.throwIfAborted();
    if (!compileActionSchema(outputSchema)(result.structured)) throw memoryErrors.invalid("模型没有返回合格式的记忆草稿");
    const drafts = (result.structured as { drafts: Draft[] }).drafts;
    const sources = new Map(input.sources.map((source, index) => [`s${index}`, source]));
    const taken = new Map<string, number>();
    const slotFor = (id: string): string => {
      const index = taken.get(id) ?? 0, slot = slots.get(id)![index];
      if (!slot) throw memoryErrors.invalid("记忆草稿超过了这个去处能放的条数");
      taken.set(id, index + 1); return slot.id;
    };
    const projected: AgentMemoryExtractionDraft[] = drafts.map(draft => ({ slot_id: slotFor(draft.slot_id), text: draft.text,
      ...(draft.applies_when?.task.trim() ? { applies_when: { task: draft.applies_when.task } } : {}), suggested_basis: draft.suggested_basis,
      evidence: draft.evidence.map(evidence => {
        const source = sources.get(evidence.source_id);
        if (!source) throw memoryErrors.invalid("记忆草稿引用了本轮未提供的来源");
        return { source: { event_id: source.event_id, version: source.version }, quote: evidence.quote };
      }) })).filter(draft => {
      const slot = input.slots.find(slot => slot.id === draft.slot_id)!;
      if (input.context?.replaying || slot.replacement) return true;
      if (input.context?.existing.some(entry => entry.scope === slot.scope && sameWords(entry.text, draft.text))) return false;
      const applies = { ...slot.meta.applies_when, ...draft.applies_when };
      return !input.context?.pending.some(entry => entry.scope === slot.scope && entry.kind === slot.meta.kind
        && sameText(entry.text, draft.text) && isDeepStrictEqual(entry.applies ?? {}, applies)
        && entry.sources?.length && draft.evidence.every(evidence => entry.sources!.some(source =>
          source.event_id === evidence.source.event_id && source.version === evidence.source.version)));
    });
    const outputTokens = reportedTokenTotal(result.usage, "output");
    const cacheKnown = result.usage.length > 0 && result.usage.every(usage => usage.cacheRead.source === "reported" && usage.cacheRead.tokens !== undefined);
    const cachedTokens = cacheKnown ? result.usage.reduce((sum, usage) => sum + usage.cacheRead.tokens!, 0) : undefined;
    // The SDK counts cached input inside input (it rejects cached > input); the Provider reports the uncached part alone, so the
    // total is uncached + cache reads. Reporting the uncached part made every cache-hit formation fail (BL-1073, 31 of 32 rejections).
    const uncached = reportedTokenTotal(result.usage, "input");
    const inputTokens = uncached === undefined ? undefined : uncached + (cachedTokens ?? 0);
    return { drafts: projected, usage: { ...(inputTokens === undefined ? {} : { input_tokens: inputTokens }),
      ...(outputTokens === undefined ? {} : { output_tokens: outputTokens }),
      ...(cachedTokens === undefined ? {} : { cached_input_tokens: cachedTokens }) } };
  } };
}
