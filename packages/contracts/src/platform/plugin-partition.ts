/**
 * Manifest fields of the unified partitions (specs/unified-partition-plugins §4–§7, batch 106): where the plugin is listed in the market,
 * which other plugins it relies on, the settings that follow the person rather than a partition, and what it can push from the personal
 * space into a project. They are declarations only: batch 106 adds and validates them; the plugins that use them move in 107–111.
 */

/** The market's groups (user 2026-11-24): every plugin is listed under exactly one. */
export const PLUGIN_MARKET_CATEGORIES = ["write", "plan", "data", "media", "knowledge", "develop", "inform", "automate"] as const;
export type PluginMarketCategory = (typeof PLUGIN_MARKET_CATEGORIES)[number];

/** `market` in the Manifest: the one group the market and the plugin switcher list the plugin under (UPP-04). */
export interface PluginMarketDeclaration {
  readonly category: PluginMarketCategory;
}

/**
 * One entry of `dependencies`: another plugin this one relies on in the same partition (V9). `enable_with` turns it on with this one when
 * the person enables this one there, the same rule for every plugin (it replaces the hard-coded companions); `optional` says this plugin
 * still works without it. `reason` is shown to the person when the platform asks to enable it, in plain words.
 */
export interface PluginDependencyDeclaration {
  readonly plugin_id: string;
  readonly enable_with?: true;
  readonly optional?: true;
  readonly reason: string;
}
/** The most dependencies one plugin declares. */
export const PLUGIN_DEPENDENCY_LIMIT = 16;

/**
 * The kinds of a person setting (§4.2 第 4 条). Only `preference` may be `portable` and follow the person to their other devices through
 * the personal configuration sync of #2231; a secret reference, a connection reference and a path on this machine stay on this machine.
 */
export const PERSON_SETTING_KINDS = ["preference", "secret_ref", "connection_ref", "local_path"] as const;
export type PersonSettingKind = (typeof PERSON_SETTING_KINDS)[number];

/** One key of `person_settings`: kept in the Home per (installation, key), for the person on this machine and the plugin's own background. */
export interface PersonSettingDeclaration {
  readonly key: string;
  readonly kind: PersonSettingKind;
  readonly portable?: true;
}
/** `person_settings` in the Manifest. */
export interface PluginPersonSettingsDeclaration {
  readonly keys: readonly PersonSettingDeclaration[];
}
export const PERSON_SETTING_LIMITS = Object.freeze({ keys: 64, key: 64, value_bytes: 16 * 1024 });
export const PERSON_SETTING_KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/u;

/**
 * `push` in the Manifest (§7.1): the object kinds this plugin can copy from the personal space into a project, and its two actions.
 * `revision` is the JSON pointer of the object's increasing version; `local_refs` are fields that only mean something in the source
 * partition, stripped or pointed at the pushed copy; `children` are the sub-records the export carries. The push itself is batch 111.
 */
export interface PluginPushDeclaration {
  readonly kinds: readonly PluginPushKindDeclaration[];
}
export interface PluginPushKindDeclaration {
  readonly kind: string;
  /** One of this plugin's actions, declared with `defineObjectExportAction` (input `molis.push.export.input.v1`, `PUSH_EXPORT_INPUT_TYPE`). */
  readonly export_action: string;
  /** One of this plugin's actions, declared with `defineObjectPutAction` (input `molis.push.put.input.v1`, `PUSH_PUT_INPUT_TYPE`). */
  readonly put_action: string;
  readonly revision: string;
  readonly local_refs?: readonly { readonly path: string; readonly on_push: "strip" | "remap" }[];
  readonly children?: readonly string[];
}
export const PLUGIN_PUSH_LIMITS = Object.freeze({ kinds: 16, local_refs: 32, children: 16 });
/** A JSON pointer into the exported record: `/field` or `/field/sub`, no escapes. */
export const PUSH_POINTER_PATTERN = /^(?:\/[a-z][a-z0-9_]{0,63}){1,4}$/u;
