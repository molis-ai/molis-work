import type { ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { InstructedPrompt, InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginDefinition, PluginModelClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginModelClient, pluginModelErrors, type PluginModelPort } from "@molis-ai/molis-work-plugin-runtime";
import { decodePrologueJsonOutput, reportedTokenTotal } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { registeredInstructionBody, resolveModelPrompt } from "./agent-definitions/instructions.js";
import { hostTextGeneration, textModelAvailability, type HostTextRequestOptions } from "./host-complete-text.js";
import type { PluginPlatformHome } from "./home-side.js";

/**
 * `services.model` for a plugin this Host runs itself: declared `model:invoke`, not sandboxed, on a platform that reaches a Home.
 * The Runtime decides whether a call may be made (inside one of the plugin's concurrent `model:invoke` actions, with the call's
 * `beforeEffect` agreeing before and after); the port below only makes it, through `hostTextGeneration`, which is agent-host's
 * Prologue inference and the one path every other caller of the Host's text model takes. No call id is passed on (user decision 2026-10-10).
 */
export function pluginModelFor(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, context: PluginStartContext,
  assertActive: () => void): PluginModelClient | undefined {
  if (!home || definition.execution === "sandbox" || !definition.manifest.permissions.some(item => item.permission === "model:invoke")) return undefined;
  return createPluginModelClient(definition.manifest, createPluginModelPort(home),
    { install_id: context.install_id, assertActive, requireGrant: permission => context.requireGrant(permission) });
}

const NOT_SET_UP = "请先配置可用的文字模型";
const unavailable = (reason: string): ActionAvailability => ({ available: false, code: "actions.connection_required", reason });

/**
 * The Host's model for one Home. What the Host was built with decides first, read when a call needs it and never kept: a function
 * stands in for the model (tests), `null` says there is none; otherwise the Home's own configuration, as for every other caller.
 */
export function createPluginModelPort(home: PluginPlatformHome): PluginModelPort {
  const configured = () => hostTextGeneration({ homeDirectory: home.directory });
  return {
    availability() {
      const injected = home.completeText();
      if (injected !== undefined) return injected === null ? unavailable(NOT_SET_UP) : { available: true };
      return textModelAvailability(configured, NOT_SET_UP);
    },
    complete: (owner, prompt, dispatch) => runWithMolisWorkHome(home.directory, async () => {
      const injected = home.completeText();
      if (injected === null) throw new ActionError("actions.connection_required", NOT_SET_UP);
      const { text, system } = resolved(home.directory, owner, prompt, dispatch.system);
      const options: HostTextRequestOptions = { signal: dispatch.signal, beforeDispatch: dispatch.beforeDispatch,
        timeoutMs: dispatch.timeout_ms, maxOutputTokens: dispatch.max_output_tokens, ...(system === undefined ? {} : { system }) };
      if (injected) return { text: await injected(text, options) };
      const generate = configured();
      if (!generate) throw new ActionError("actions.connection_required", NOT_SET_UP);
      const result = await generate(text, options);
      const input = reportedTokenTotal(result.usage, "input"), output = reportedTokenTotal(result.usage, "output");
      return { text: result.value, ...(input !== undefined && output !== undefined ? { usage: { input_tokens: input, output_tokens: output } } : {}) };
    }),
    decodeJson: text => decodePrologueJsonOutput(text, { allowCodeFence: true }),
  };
}

/** The text a call sends: the registered instruction as the person left it, then the call's data; and the same for system. */
function resolved(home: string, owner: string, prompt: InstructedPrompt, system: InstructionPrompt | undefined) {
  try {
    return { text: resolveModelPrompt(home, prompt, owner), system: system && registeredInstructionBody(home, system, owner) };
  } catch (error) {
    if (error instanceof ActionError && ["agent_definitions.not_found", "agent_definitions.invalid"].includes(error.code)) throw pluginModelErrors.model_instruction_refused(`${error.message}：在 PluginDefinition.instructions 里登记这段指令`);
    throw error;
  }
}
