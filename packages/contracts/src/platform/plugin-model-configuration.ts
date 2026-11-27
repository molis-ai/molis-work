import type { PluginModelSelection } from "./plugin-model.js";
import type { SandboxModelSettingsView } from "./plugin-sandbox.js";

/** A signed package may select a model already enabled by the person. */
export type PluginModelConfigurationInput = PluginModelSelection;
export type PluginModelConfigurationView = SandboxModelSettingsView;

/** A Home package's own model settings, derived by the Host from the package's `effects.modelSettings` (BL-491). */
export interface PluginModelConfigurationClient {
  /** Only this consumer's selected provider/model names, also usable during availability discovery. */
  selection(): PluginModelSelection | undefined;
  read(): Promise<PluginModelConfigurationView>;
  save(input: PluginModelConfigurationInput): Promise<PluginModelConfigurationView>;
}
