import { composeInstructedPrompt, modelPromptText, type InstructionPrompt, type ModelPromptInput } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { agentDefinitionsFor } from "./agent-definitions.js";
import { builtinRegistrations } from "./builtin-registrations.js";

/** Resolve a named instruction in a Host-bound owner's namespace. */
export function resolveInstructionPrompt(homeDirectory: string, ownerId: string, promptId: string, caller: string): string {
  return agentDefinitionsFor(homeDirectory, builtinRegistrations).instruction(ownerId, promptId, caller).body;
}

/**
 * The text a model call sends: registered instructions as the person left them (their version, or the default),
 * then the call's data. A plain string passes through; the prompt-registration check keeps new ones from appearing.
 */
export function resolveModelPrompt(homeDirectory: string | undefined, prompt: ModelPromptInput, caller: string): string {
  if (typeof prompt === "string" || !homeDirectory) return modelPromptText(prompt);
  const body = resolveInstructionPrompt(homeDirectory, prompt.instruction.owner_id, prompt.instruction.prompt_id, caller);
  return composeInstructedPrompt(body, prompt.data);
}

/** Just the instruction's text as the person left it (their version, or the default), for callers that place it themselves. */
export function registeredInstructionBody(homeDirectory: string | undefined, instruction: InstructionPrompt, caller: string): string {
  if (!homeDirectory) return instruction.body;
  return agentDefinitionsFor(homeDirectory, builtinRegistrations).instruction(instruction.owner_id, instruction.prompt_id, caller).body;
}

/**
 * The revision of the person's own version of a registered instruction, or null while the default is in force. A read of the register:
 * it records no use, so it can be asked as often as a cached answer needs to know whether the person has changed the text since.
 */
export function registeredInstructionRevision(homeDirectory: string, instruction: InstructionPrompt): number | null {
  return agentDefinitionsFor(homeDirectory, builtinRegistrations).prompt(`${instruction.owner_id}/${instruction.prompt_id}`).user?.revision ?? null;
}

/** A Host text model that takes registered instructions, over one that takes plain text. */
export function withRegisteredPrompts<O>(homeDirectory: string | undefined, caller: string, complete: (prompt: string, options: O) => Promise<string>):
  (prompt: ModelPromptInput, options: O) => Promise<string> {
  return (prompt, options) => complete(resolveModelPrompt(homeDirectory, prompt, caller), options);
}
