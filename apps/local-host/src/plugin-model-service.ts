import type { ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { InstructedPrompt, InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginDefinition, PluginModelClient, PluginModelSelection, PluginModelConfigurationDeclaration, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginModelClient, createPluginModelConfigurationClient, pluginModelErrors, type PluginModelPort } from "@molis-ai/molis-work-plugin-runtime";
import { createConsumerModelConfiguration } from "./model-configuration.js";
import { decodePrologueJsonOutput, reportedTokenTotal } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { registeredInstructionBody, resolveModelPrompt } from "./agent-definitions/instructions.js";
import { hostTextGeneration, textModelAvailability, textModelMissing, textModelRequired, type HostTextRequestOptions, type HostTextGenerationFailure } from "./host-complete-text.js";
import { configuredModelChoices, openConfiguredModels, selectConfiguredTextModel } from "./configured-models.js";
import { withPluginModelImages } from "./plugin-model-images.js";
import { rememberInDirectoryPass } from "@molis-ai/molis-work-kernel";
import type { PluginPlatformHome } from "./home-side.js";

/**
 * `services.model` for a plugin this Host runs itself: declared `model:read` or `model:invoke`, not sandboxed, on a platform that
 * reaches a Home. `model:read` reaches only the list and availability; the Runtime decides whether a call may be made (inside one of the plugin's concurrent `model:invoke` actions, with the call's
 * `beforeEffect` agreeing before and after); the port below only makes it, through `hostTextGeneration`, which is agent-host's
 * Prologue inference and the one path every other caller of the Host's text model takes. No call id is passed on (user decision 2026-10-10).
 */
export function pluginModelFor(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, context: PluginStartContext,
  assertActive: () => void, declaration?: PluginModelConfigurationDeclaration): PluginModelClient | undefined {
  if (!home || definition.execution === "sandbox" || !definition.manifest.permissions.some(item => MODEL_PERMISSIONS.includes(item.permission))) return undefined;
  const gate = { install_id: context.install_id, installation_generation: context.installation_generation, assertActive, requireGrant: (permission: string) => context.requireGrant(permission) };
  return Object.freeze({ ...createPluginModelClient(definition.manifest, createPluginModelPort(home, definition.instructions ?? []), gate),
    ...(declaration ? { configuration: createPluginModelConfigurationClient(definition.manifest, declaration, createConsumerModelConfiguration(home.directory, declaration), gate) } : {}),
  });
}

/** Either builds the service: `model:read` for the list and availability, `model:invoke` for those and requests. */
const MODEL_PERMISSIONS: readonly string[] = ["model:read", "model:invoke"];

const unavailable = (reason: string): ActionAvailability => ({ available: false, code: "actions.connection_required", reason });

/**
 * The Host's model for one Home. What the Host was built with decides first, read when a call needs it and never kept: a function
 * stands in for the model (tests), `null` says there is none; otherwise the Home's own configuration, as for every other caller.
 * A call sends only instructions the calling definition carries: the register also keeps other installations' and not-running ones
 * (PG-051 Q1 b), which are not this one's to send.
 */
export function createPluginModelPort(home: PluginPlatformHome, carried: readonly Pick<InstructionPrompt, "owner_id" | "prompt_id">[]): PluginModelPort {
  const carries = (instruction: InstructionPrompt) => carried.some(item => item.owner_id === instruction.owner_id && item.prompt_id === instruction.prompt_id);
  const configured = (selection?: PluginModelSelection) => hostTextGeneration({ homeDirectory: home.directory, selection });
  return {
    choices: () => configuredModelChoices(home.directory),
    availability(selection) {
      const injected = home.completeText();
      // A model the Host was given for a test is handed images as they are.
      if (injected !== undefined) return injected === null ? unavailable(textModelMissing()) : { available: true, vision: true };
      // Every model action of every plugin asks this within one directory: read the settings once per Home and selection there.
      return rememberInDirectoryPass(createPluginModelPort, JSON.stringify([home.directory, selection ?? null]), () => {
        let label: string | undefined, vision = false;
        const state = textModelAvailability(() => {
          if (!configured(selection)) return false;
          const catalog = openConfiguredModels(home.directory);
          try {
            const selected = catalog && selectConfiguredTextModel(home.directory, catalog.store, selection);
            if (selected) { label = `Prologue · ${selected.provider.display_name} · ${selected.model.model_id}`; vision = selected.model.vision === true; }
            return true;
          } finally { catalog?.storage.close(); }
        });
        return state.available && label ? { ...state, runtime_label: label, vision } : state;
      });
    },
    complete: (owner, prompt, dispatch) => runWithMolisWorkHome(home.directory, () => withPluginModelImages(dispatch, async images => {
      const injected = home.completeText();
      if (injected === null) throw textModelRequired();
      for (const instruction of [prompt.instruction, ...dispatch.system ? [dispatch.system] : []]) {
        if (!carries(instruction)) throw pluginModelErrors.model_instruction_refused(`指令 ${instruction.prompt_id} 不在本插件的定义里：在 PluginDefinition.instructions 里登记这段指令`);
      }
      const { text, system } = resolved(home.directory, owner, prompt, dispatch.system);
      const options: HostTextRequestOptions = { ...(images ? { images } : {}), signal: dispatch.signal, beforeDispatch: dispatch.beforeDispatch,
        timeoutMs: dispatch.timeout_ms, maxOutputTokens: dispatch.max_output_tokens, ...(system === undefined ? {} : { system }),
        ...(dispatch.onText ? { onProgress: event => { if (event.type === "text-delta") dispatch.onText!(event.text); } } : {}) };
      if (injected) return { text: await injected(text, options), validateResult: () => {} };
      const generate = configured(dispatch.selection);
      if (!generate) throw textModelRequired();
      let result;
      try { result = await generate(text, options); }
      catch (error) {
        const source = error instanceof Error ? error as HostTextGenerationFailure : undefined;
        const failure = error instanceof ActionError ? error : pluginModelErrors.model_failed(source?.message ?? "模型请求失败，请重试");
        if (source?.execution) Object.defineProperty(failure, "execution", { value: structuredClone(source.execution), configurable: true });
        if (source?.validateResult) Object.defineProperty(failure, "validateResult", { value: source.validateResult, configurable: true });
        throw failure;
      }
      const input = reportedTokenTotal(result.usage, "input"), output = reportedTokenTotal(result.usage, "output");
      return { text: result.value, execution: structuredClone({ run_ref: result.run_ref, state: result.state, configuredModel: result.configuredModel, reportedModels: result.reportedModels, usage: result.usage }), validateResult: result.validateResult, ...(input !== undefined && output !== undefined ? { usage: { input_tokens: input, output_tokens: output } } : {}) };
    })),
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
