import { inputSchemaFor, type InferActionInput } from "./action-input.js";
import type { ActionReference } from "./actions.js";
import { closedObjectSchema } from "./closed-object-schema.js";
import type { SandboxJson, SandboxSchema } from "./plugin-sandbox.js";
import type { TextRef } from "./ui-text.js";

export const SETTINGS_LAYERS = ["project", "personal"] as const;
export const SETTINGS_SOURCES = [...SETTINGS_LAYERS, "provider_default"] as const;
export const SETTINGS_CONSEQUENCES = ["reach", "cost", "external", "schedule"] as const;

export type SettingLayer = (typeof SETTINGS_LAYERS)[number];
export type SettingSource = (typeof SETTINGS_SOURCES)[number];
export type SettingConsequence = (typeof SETTINGS_CONSEQUENCES)[number];
export type SettingLayers = Partial<Record<SettingSource, SandboxJson>>;

export type SettingLayerRevisions = Partial<Record<SettingLayer, string>>;

export interface SettingEntryDeclaration {
  /** A stable name. The declaring installation or system provider owns it. */
  key: string;
  title: TextRef;
  summary?: TextRef;
  layers: SettingLayer[];
  schema: SandboxSchema;
  consequence?: SettingConsequence[];
  device_only?: true;
}

export interface SettingsDeclaration {
  /** Storage and separate connection-management actions for the plugin's declared personal model choice. */
  model_configuration?: import("./plugin-model-configuration.js").PluginModelConfigurationDeclaration & { key: string };
  entries: SettingEntryDeclaration[];
  read: Pick<ActionReference, "capability_id" | "version">;
  write: Pick<ActionReference, "capability_id" | "version">;
}

export const SETTINGS_READ_INPUT_TYPE = /* @version type.molis.settings.read.request "molis.settings.read.request.v{version}" */ "molis.settings.read.request.v1";
export const SETTINGS_WRITE_INPUT_TYPE = /* @version type.molis.settings.write.request "molis.settings.write.request.v{version}" */ "molis.settings.write.request.v1";
export const SETTINGS_READ_OUTPUT_TYPE = /* @version type.molis.settings.values "molis.settings.values.v{version}" */ "molis.settings.values.v1";

export interface SettingsReadInput { keys: string[] }

export type EffectiveSetting = { key: string; revision: string } & (
  | { state: "ok"; value_unavailable?: string; value: SandboxJson; source: SettingSource; layers?: SettingLayers; layer_revisions?: SettingLayerRevisions }
  | { state: "unavailable"; reason: string }
);

export interface SettingsValues { values: EffectiveSetting[] }

type LayerChange<T> = { set: T } | { inherit: true };
type SettingRecovery<T> = { previous: LayerChange<T> } | { undo_of: string };

export interface SettingsWriteInput {
  key: string;
  layer: SettingLayer;
  change: LayerChange<SandboxJson>;
  /** An original write binds the observed layer. Its undo names that verified request. */
  recovery?: SettingRecovery<SandboxJson>;
  expected_revision: string;
  request_id: string;
}

const nonblank = { type: "string", pattern: "\\S" } as const;
/** The one shape of a setting key; owners reuse it in their declaration schemas (no settings-declaring owner uses it in-repo yet). */
export const SETTING_KEY_SCHEMA = nonblank;
const json = { type: ["null", "boolean", "number", "string", "array", "object"] } as const;

export const SETTINGS_READ_INPUT_SCHEMA = inputSchemaFor<SettingsReadInput>()(closedObjectSchema({
  keys: { type: "array", items: SETTING_KEY_SCHEMA },
}));

// The gateway checks the envelope. The SDK checks bounded JSON and the setting's value schema.
type JsonEnvelope = InferActionInput<typeof json>;
type SettingsWriteEnvelope = Omit<SettingsWriteInput, "change" | "recovery"> & { change: LayerChange<JsonEnvelope>; recovery?: SettingRecovery<JsonEnvelope> };
const change = { oneOf: [closedObjectSchema({ set: json }), closedObjectSchema({ inherit: { const: true } })] } as const;
export const SETTINGS_WRITE_INPUT_SCHEMA = inputSchemaFor<SettingsWriteEnvelope>()(closedObjectSchema({
  key: SETTING_KEY_SCHEMA,
  layer: { type: "string", enum: SETTINGS_LAYERS },
  change,
  recovery: { oneOf: [closedObjectSchema({ previous: change }), closedObjectSchema({ undo_of: nonblank })] },
  expected_revision: nonblank,
  request_id: nonblank,
}, ["key", "layer", "change", "expected_revision", "request_id"]));

const observation = { key: SETTING_KEY_SCHEMA, revision: nonblank };
const layers = closedObjectSchema({ project: json, personal: json, provider_default: json }, []);
const available = closedObjectSchema({
  ...observation, state: { const: "ok" }, value_unavailable: nonblank, value: json, source: { type: "string", enum: SETTINGS_SOURCES }, layers,
  layer_revisions: closedObjectSchema({ project: nonblank, personal: nonblank }, []),
}, ["key", "revision", "state", "value", "source"]);
const unavailable = closedObjectSchema({ ...observation, state: { const: "unavailable" }, reason: nonblank });

/** Both actions use this output shape. A write returns its single transaction readback. */
export const SETTINGS_READ_OUTPUT_SCHEMA = closedObjectSchema({
  values: { type: "array", items: { oneOf: [available, unavailable] } },
});
