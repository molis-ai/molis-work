import type { AgentReasoningEffort, AgentRunBudget } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Output limit per model call while thinking is on (the user's choice); only a ceiling, usage is what the model spends. */
export const THINKING_OUTPUT_TOKENS = 32_768;

/**
 * One set of call parameters for a round. Thinking is absent when off, so the request carries no thinking field at
 * all. On, thinking and the answer share one output limit, and the SDK's default (4096) is spent on thinking before a
 * plan or file is written: the raised ceiling replaces that default only. A budget the round was given always wins. The
 * reasoning effort the round was frozen with goes out on every model call of it (the SDK's two protocols translate it).
 */
export function runModelParams(model: { readonly thinking?: "adaptive" }, budget: AgentRunBudget | null | undefined, effort?: AgentReasoningEffort):
  { thinking?: "adaptive"; maxOutputTokens?: number; reasoningEffort?: AgentReasoningEffort } {
  const output = budget?.max_output_tokens;
  return {
    ...(model.thinking ? { thinking: model.thinking } : {}),
    ...(effort ? { reasoningEffort: effort } : {}),
    ...(output !== undefined ? { maxOutputTokens: output } : model.thinking ? { maxOutputTokens: THINKING_OUTPUT_TOKENS } : {}),
  };
}
