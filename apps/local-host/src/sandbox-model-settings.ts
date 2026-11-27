import { join } from "node:path";
import type { PluginDefinition, PluginModelClient, PluginModelConfigurationClient, PluginModelConfigurationInput, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createConsumerModelConfiguration, modelConfigurationInvalid, type ConsumerModelConfigurationDeclaration } from "./model-configuration.js";
import type { PluginPlatformHome } from "./home-side.js";
import { sandboxProviderId } from "./sandbox-home-names.js";

// A Home package's own model settings (`sdk.model.settings`, PG-017 BL-491, S-60). No Manifest declares these settings: the
// package asks with `effects.modelSettings` and the Host derives the rest. The choice is kept where the installation's own files are, next to (not inside) the
// folder the package's declared files live in, so the package cannot write it as a file: <Home>/plugin-files/<installation>/.model-settings/preference.json,
// which an uninstall that keeps no data removes with the installation's folder (`removeSandboxOwnerFiles`). The Home upgrade process enumerates the existing choice files by installation.
// A package may only choose among the providers and
// models the person enabled: it names no address, account or format, and the provider id the Host reserves for a consumer's own provider is never created.

const MODEL_READ = "model:read", MODEL_INVOKE = "model:invoke";
/** The folder inside an installation's folder that holds the choice; a declared files folder cannot be named like this (it starts with a letter or digit). */
export const SANDBOX_MODEL_SETTINGS_FOLDER = ".model-settings";

export function sandboxModelDeclaration(installId: string): ConsumerModelConfigurationDeclaration {
  return { preference: { store_name: join("plugin-files", installId, SANDBOX_MODEL_SETTINGS_FOLDER), file_name: "preference.json" },
    reserved_provider_id: sandboxProviderId(installId) };
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
  const declaration = sandboxModelDeclaration(context.install_id);
  const port = createConsumerModelConfiguration(home.directory, declaration);
  const permit = (permission: string) => { assertActive(); if (!declared.has(permission)) throw modelConfigurationInvalid("清单没有声明模型设置需要的权限"); context.requireGrant(permission); };
  const configuration: PluginModelConfigurationClient = Object.freeze({
    selection: () => { permit(MODEL_READ); return port.selection(); },
    read: async () => { permit(MODEL_READ); return port.read(); },
    save: async (input: PluginModelConfigurationInput) => {
      permit(MODEL_INVOKE);
      return port.save(input);
    },
  });
  return Object.freeze({ ...model, configuration });
}
