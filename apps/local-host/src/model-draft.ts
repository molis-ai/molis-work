import { randomUUID } from "node:crypto";
import type { AgentDraftTextRequest, AgentDraftTextResult } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { fencedMaterials } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { resolveConfiguredHome } from "./product-home.js";
import { reportedTokenTotal } from "@molis-ai/molis-work-service-agent-host";
import { hostTextGeneration, type HostTextOptions, type HostTextRequestOptions } from "./host-complete-text.js";
import { prepareInstructionPrompt } from "./agent-definitions/instructions.js";
import { modelRoundLocale, replyLanguagePrompt } from "./reply-language.js";

const LIMITS = { purpose: 80, material: 60_000 } as const;

/** A tool-free draft through the owning Home Runtime; no workspace or durable conversation is created. */
export async function draftText(options: HostTextOptions, input: AgentDraftTextRequest,
  execution: Pick<HostTextRequestOptions, "signal" | "beforeDispatch" | "onProgress"> & { /** Trusted Host invocation identity, never request input. */ pluginId?: string } = {}): Promise<AgentDraftTextResult> {
  for (const key of ["purpose", "material"] as const) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > LIMITS[key]) throw new ActionError("actions.input_invalid", "起草的说明或材料为空或过长");
  }
  if (typeof input.prompt !== "string" || !/^[a-z0-9][a-z0-9.-]*$/u.test(input.prompt)) throw new ActionError("actions.input_invalid", "起草需要一份已登记的指令");
  if (!execution.pluginId) throw new ActionError("actions.host_context_missing", "登记指令需要原插件调用身份");
  const lifetime = createExecutionLifetime({ signal: execution.signal, timeout: { milliseconds: 120_000, reason: new ActionError("actions.timeout", "起草超过两分钟，已停止，可重试") } });
  try {
    lifetime.assertActive();
    const home = options.homeDirectory ?? resolveConfiguredHome(), locale = modelRoundLocale(home);
    const instruction = prepareInstructionPrompt(home, execution.pluginId, input.prompt, locale);
    const system = instruction.body + "\n\n" + replyLanguagePrompt(locale).body;
    await lifetime.wait(Promise.resolve(execution.beforeDispatch?.()));
    lifetime.assertActive();
    const generate = hostTextGeneration({ ...options, ...(input.model_selection ? { selection: input.model_selection } : {}) });
    if (!generate) throw new ActionError("actions.connection_required", "没有可用文字模型，请检查模型设置后重试");
    const fenced = fencedMaterials(input.material, "DRAFT_" + randomUUID().replaceAll("-", ""));
    const promptText = locale.startsWith("en")
      ? `${input.purpose}. Return only the result itself, do not call tools, and do not add extra commentary.\n${fenced}`
      : `${input.purpose}。只返回结果本身，不要调用工具，不要加其他文字。\n${fenced}`;
    const result = await generate(promptText,
      { signal: lifetime.signal, beforeDispatch: execution.beforeDispatch, onProgress: execution.onProgress, system, timeoutMs: 120_000 });
    instruction.recordUse();
    lifetime.assertActive();
    const used = reportedTokenTotal(result.usage, "input"), output = reportedTokenTotal(result.usage, "output");
    return { text: result.value, usage: used !== undefined && output !== undefined ? { input: used, output } : null };
  } finally { lifetime.dispose(); }
}
