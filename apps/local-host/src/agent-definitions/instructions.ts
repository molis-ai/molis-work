import { composeInstructedPrompt, modelPromptText, type ModelPromptInput } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { agentDefinitionsFor } from "./agent-definitions.js";
import { builtinRegistrations } from "./builtin-registrations.js";

/**
 * The text a model call sends: registered instructions as the person left them (their version, or the default),
 * then the call's data. A plain string passes through; the prompt-registration check keeps new ones from appearing.
 */
export function resolveModelPrompt(homeDirectory: string | undefined, prompt: ModelPromptInput, caller: string): string {
  if (typeof prompt === "string" || !homeDirectory) return modelPromptText(prompt);
  const registry = agentDefinitionsFor(homeDirectory, builtinRegistrations);
  const { body } = registry.instruction(prompt.instruction.owner_id, prompt.instruction.prompt_id, caller);
  return composeInstructedPrompt(body, prompt.data);
}

/** A Host text model that takes registered instructions, over one that takes plain text. */
export function withRegisteredPrompts<O>(homeDirectory: string | undefined, caller: string, complete: (prompt: string, options: O) => Promise<string>):
  (prompt: ModelPromptInput, options: O) => Promise<string> {
  return (prompt, options) => complete(resolveModelPrompt(homeDirectory, prompt, caller), options);
}
