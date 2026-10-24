import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { isPluginConnectionRecordKey } from "@molis-ai/molis-work-contracts/platform/plugin-connections";

// The `scope_id` a plugin's connection slot binding lives under in `connector_bindings` (S-57 and its X2 extension; the hub decided
// on 2026-10-24 that the column keeps its meaning, an opaque scope key, with no change to the table). This file is the only place the string
// is written or read; nothing else builds one by hand.
//
//   installation slot:  plugin-installation:<install_id>
//   per_record slot:    plugin-installation:<install_id>/project:<project_id>/record:<record_key>
//
// None of the three parts may hold `/`, `:` or a control character, so each scope decodes to exactly one (installation, project,
// record), and a prefix anchored on a separator never reaches another installation's or project's bindings. Lookups match the
// whole scope exactly; removing an installation's or a project's bindings (X4) matches the anchored prefix with `substr`, never `LIKE`.
// The plugin gives only the record key; the installation and the project come from the trusted call.

export const pluginBindingErrors = defineErrorCodes("connector.plugin_bindings", { record_key_invalid: "invalid", scope_invalid: "invalid" });

const INSTALLATION = "plugin-installation:", PROJECT = "/project:", RECORD = "/record:";
const ID_MAX = 160;
const part = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= ID_MAX && !/[/:\u0000-\u001f\u007f]/u.test(value);

export interface PluginBindingTarget {
  readonly install_id: string;
  /** Both, for a `per_record` slot's binding; neither, for an installation slot's. */
  readonly project_id?: string;
  readonly record_key?: string;
}

/** The one place a binding scope is built. */
export function pluginBindingScope(target: PluginBindingTarget): string {
  if (!part(target.install_id)) throw pluginBindingErrors.scope_invalid("插件安装标识无效");
  if (target.project_id === undefined && target.record_key === undefined) return INSTALLATION + target.install_id;
  if (!part(target.project_id)) throw pluginBindingErrors.scope_invalid("按记录绑定的账号要在一个项目里");
  if (!isPluginConnectionRecordKey(target.record_key)) throw pluginBindingErrors.record_key_invalid("记录键必须是 1 到 128 个字符，不含 /、: 和控制字符");
  return INSTALLATION + target.install_id + PROJECT + target.project_id + RECORD + target.record_key;
}

/** The one place a binding scope is read back; `null` for a scope that is not a plugin's (`home`, a built-in consumer's). */
export function parsePluginBindingScope(scope: string): PluginBindingTarget | null {
  if (!scope.startsWith(INSTALLATION)) return null;
  const [install_id, project, record, ...rest] = scope.slice(INSTALLATION.length).split("/");
  if (rest.length || !part(install_id)) return null;
  if (project === undefined && record === undefined) return { install_id };
  if (!project?.startsWith("project:") || !record?.startsWith("record:")) return null;
  const project_id = project.slice("project:".length), record_key = record.slice("record:".length);
  return part(project_id) && isPluginConnectionRecordKey(record_key) ? { install_id, project_id, record_key } : null;
}

