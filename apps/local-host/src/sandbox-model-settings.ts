import { join } from "node:path";
import type { PluginDefinition, PluginModelClient, PluginModelConfigurationClient, PluginModelConfigurationInput, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createConsumerModelConfiguration, modelConfigurationInvalid, type ConsumerModelConfigurationDeclaration } from "./model-configuration.js";
import type { PluginPlatformHome } from "./home-side.js";
import { sandboxProviderId } from "./sandbox-home-names.js";

// A Home package's own model settings (`sdk.model.settings`, PG-017 BL-491, S-60). The Manifest has no `model_configuration` block for a sandboxed package: the
// package asks with `effects.modelSettings` and the Host derives the rest. The choice is kept where the installation's own files are, next to (not inside) the
// folder the package's declared files live in, so the package cannot write it as a file: <Home>/plugin-files/<installation>/.model-settings/preference.json,
// which an uninstall that keeps no data removes with the installation's folder (`removeSandboxOwnerFiles`). A package may only choose among the providers and
// models the person enabled: it names no address, account or format, and the provider id the Host reserves for a consumer's own provider is never created.

const MODEL_READ = "model:read", MODEL_INVOKE = "model:invoke";
/** The folder inside an installation's folder that holds the choice; a declared files folder cannot be named like this (it starts with a letter or digit). */
export const SANDBOX_MODEL_SETTINGS_FOLDER = ".model-settings";

export function sandboxModelDeclaration(pluginId: string, installId: string): ConsumerModelConfigurationDeclaration {
  return { preference: { store_name: join("plugin-files", installId, SANDBOX_MODEL_SETTINGS_FOLDER), file_name: "preference.json" },
    custom_provider: { provider_id: sandboxProviderId(pluginId), display_name: "沙箱插件专用" } };
}

/** The two names of a choice, and nothing else: an address, a connection, an API format, an unknown member or the reserved provider id is refused before anything is read or written. */
export function assertSandboxModelChoice(input: unknown, reservedProviderId: string): { provider_id: string; model_id: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw modelConfigurationInvalid("模型设置必须是对象");
  const keys = Object.keys(input);
  if (keys.some(key => key !== "provider_id" && key !== "model_id")) throw modelConfigurationInvalid("沙箱插件只能在你已启用的模型里选择，不能设置服务地址、连接或接口格式");
  const { provider_id, model_id } = input as { provider_id?: unknown; model_id?: unknown };
  if (typeof provider_id !== "string" || typeof model_id !== "string" || !provider_id.trim() || !model_id.trim()) throw modelConfigurationInvalid("请选择供应商和模型");
  if (provider_id.trim() === reservedProviderId) throw modelConfigurationInvalid("这个供应商名保留给平台，不能选择");
  return { provider_id, model_id };
}

/**
 * `model` for a Home package with its settings: the Host's model client plus a `configuration` that is not the runtime's (that one needs Manifest actions a
 * sandboxed Manifest does not have). Reading asks `model:read`, choosing asks `model:invoke` (the choice decides what the person's models are spent on); both
 * ask that the installation is live and that the person approved the row each time.
 */
export function withSandboxModelSettings(model: PluginModelClient | undefined, home: Pick<PluginPlatformHome, "directory"> | null | undefined, definition: PluginDefinition,
  context: Pick<PluginStartContext, "install_id" | "requireGrant">, assertActive: () => void): PluginModelClient | undefined {
  if (!model || !home || definition.execution !== "sandbox") return model;
  const declared = new Set(definition.manifest.permissions.map(entry => entry.permission));
  if (!declared.has(MODEL_READ) && !declared.has(MODEL_INVOKE)) return model;
  const declaration = sandboxModelDeclaration(definition.manifest.plugin_id, context.install_id);
  const port = createConsumerModelConfiguration(home.directory, declaration);
  const permit = (permission: string) => { assertActive(); if (!declared.has(permission)) throw modelConfigurationInvalid("清单没有声明模型设置需要的权限"); context.requireGrant(permission); };
  const configuration: PluginModelConfigurationClient = Object.freeze({
    selection: () => { permit(MODEL_READ); return port.selection(); },
    read: async () => { permit(MODEL_READ); return port.read(); },
    save: async (input: PluginModelConfigurationInput) => {
      permit(MODEL_INVOKE);
      const choice = assertSandboxModelChoice(input, declaration.custom_provider.provider_id);
      return port.save(choice);
    },
  });
  return Object.freeze({ ...model, configuration });
}
