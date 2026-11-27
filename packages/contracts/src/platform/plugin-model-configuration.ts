import type { PluginModelSelection } from "./plugin-model.js";
import type { ModelApiFormat, ModelRecord } from "../modules/model-providers.js";

/** Consumer model settings. Endpoints and connection names are editable; credentials stay with Connectors. */
export interface PluginModelConfigurationInput {
  readonly provider_id?: string;
  readonly model_id?: string;
  readonly base_url?: string;
  readonly api_format?: ModelApiFormat;
  readonly connection_id?: string;
}

export interface PluginModelConfigurationView {
  readonly configured: boolean;
  readonly preference_revision?: string;
  readonly providers: readonly {
    readonly id: string;
    readonly provider_id: string;
    readonly name: string;
    readonly base_url: string;
    readonly api_format: ModelApiFormat;
    readonly enabled: boolean;
    readonly has_credential: boolean;
    readonly models: readonly ModelRecord[];
  }[];
  readonly selection?: PluginModelSelection;
  readonly effective_selection?: PluginModelSelection;
  readonly source: "selection" | "provider" | "environment" | "none";
  readonly connections: readonly { readonly connection_id: string; readonly display_name: string; readonly state: string }[];
  readonly custom_connection_id?: string;
}

/** A Home package's own model settings, derived by the Host from the package's `effects.modelSettings` (BL-491). */
export interface PluginModelConfigurationClient {
  /** Only this consumer's selected provider/model names, also usable during availability discovery. */
  selection(): PluginModelSelection | undefined;
  read(options?: { preference_revision: true }): Promise<PluginModelConfigurationView>;
  save(input: PluginModelConfigurationInput): Promise<PluginModelConfigurationView>;
}
