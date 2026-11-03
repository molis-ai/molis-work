import type { ActionReference } from "./actions.js";
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

/** Installed consumer configuration, bound by the Host to the declared settings actions. */
export interface PluginModelConfigurationClient {
  /** Only this consumer's selected provider/model names, also usable during availability discovery. */
  selection(): PluginModelSelection | undefined;
  read(): Promise<PluginModelConfigurationView>;
  save(input: PluginModelConfigurationInput): Promise<PluginModelConfigurationView>;
}

/**
 * What a plugin's Manifest declares (`model_configuration`, PG-102), like any plugin's: the Host gives the service only to a
 * definition on its start list, whose preference directory its store registry holds as this plugin's.
 */
export interface PluginModelConfigurationDeclaration {
  readonly preference: { readonly store_name: string; readonly file_name: string };
  readonly custom_provider: { readonly provider_id: string; readonly display_name: string };
  readonly actions: {
    readonly read: Pick<ActionReference, "capability_id" | "version">;
    readonly save: Pick<ActionReference, "capability_id" | "version">;
  };
}
