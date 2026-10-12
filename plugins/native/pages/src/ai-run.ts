import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { isPagesAiCommand, pagesAiCommandLabel, type PagesAiRequest, type PagesAiResult } from "./ai.js";
import { pagesErrors } from "./error.js";
import { PAGES_WRITING_ASSISTANT } from "./prompts.js";

/**
 * The writing assistant's request, kept apart from the pure helpers in `ai.ts`: the editor's browser bundle imports those, and this file
 * raises errors (the SDK is Node-only).
 */
export async function runPagesAi(
  request: PagesAiRequest,
  completeText?: (prompt: InstructedPrompt) => Promise<string>,
): Promise<PagesAiResult> {
  if (!isPagesAiCommand(request.command)) {
    throw pagesErrors.invalid("不认识这个写作命令");
  }
  const text = request.text.trim();
  if (!text) throw pagesErrors.invalid("没有可处理的文字");
  const label = pagesAiCommandLabel(request.command, request.style);
  if (completeText) {
    const output = (await completeText(instructed(PAGES_WRITING_ASSISTANT, `命令：${label}\n\n${text}`))).trim();
    if (!output) throw pagesErrors.invalid("模型没有返回文字");
    // “更短” promises a shorter text: a longer one is not offered as the rewrite (seen from MiniMax M3.1, which also added facts).
    if (request.command === "rewrite" && request.style === "concise" && output.length >= text.length) {
      throw pagesErrors.invalid("这次改写没有比原文更短，没有采用；可以再试一次");
    }
    return { text: output, command: request.command, style: request.style };
  }
  throw new ActionError("actions.connection_required", "请先配置文字模型，再使用写作助手");
}
