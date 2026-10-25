import type { PluginRegistration, PluginWorkbenchRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
export type { PluginSearchRow } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

export interface BuiltinPluginWorkbenchPack extends Omit<PluginWorkbenchRegistration, "order" | "clientServed" | "clientUses"> { readonly project_plugin_id: string }

/**
 * Comments that fill whole lines (`// …` and `/* … *\/`) and the indentation in front of every line of a plugin's client script
 * are notes and layout for the people who read its source; the page does not run them. A registration that sets `clientServed`
 * is sent without them (the page asset budget only shrinks, and these are the bytes that are provably dead). A block comment
 * is taken only when nothing else shares its lines; indentation inside a multi-line string or template would be content, so a
 * script that has one cannot use this. tests/plugin-client-served.test.ts holds the result to the same program as the source.
 */
const served = (script: string): string => script
  .replace(/^[ \t]*(?:\/\/[^\n]*|\/\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*)\n/gm, "")
  .replace(/^[ \t]+/gm, "");

type Registered = PluginWorkbenchRegistration & { readonly project_plugin_id: string };

const clientOf = (workbench: Registered): string | undefined => workbench.clientServed && workbench.clientFactory !== undefined
  ? served(workbench.clientFactory)
  : workbench.clientFactory;

/** Where a plugin's client bundle is served; a page loads it before it mounts the client. */
const bundleUrl = (id: string): string => `/assets/molis-work-plugins/${encodeURIComponent(id)}.js`;

/**
 * A client with the clients its registration names in `clientUses`, as `host.clients[<short id>]`. Each used plugin ships a
 * bundle of its own, which the page loads beside this one (`bundleUrl`); its factory takes the ports of the panel it is mounted
 * in and is given its own plugin's identity, so what it asks of its own plugin it asks as that plugin, never as this one.
 */
function withUsedClients(user: Registered, factory: string, all: readonly Registered[], catalog: readonly PluginRegistration[]): string {
  const used = (user.clientUses ?? []).map(id => {
    const lent = all.find(candidate => candidate.project_plugin_id === id), manifest = catalog.find(entry => entry.project_plugin_id === id)?.manifest;
    if (!lent?.clientFactory || !manifest) throw new Error(`${user.project_plugin_id} uses the client of ${id}, which has none`);
    const key = JSON.stringify(id), plugin = JSON.stringify(manifest.plugin_id);
    return `${key}: ports => globalThis.molisWorkbenchPluginFactories[${key}]({ ...host, ...ports, pluginId: ${plugin}, pluginRoute: path => host.route("/api/plugins/" + ${plugin} + path) })`;
  });
  return `(host) => (${factory})({ ...host, clients: { ${used.join(", ")} } })`;
}

/** Derive the registered UI and assets from the same entries used by the Host catalog. */
export function pluginWorkbenchPacks(catalog: readonly PluginRegistration[] = BUILTIN_PLUGIN_CATALOG): BuiltinPluginWorkbenchPack[] {
  return catalog.flatMap(entry => entry.workbench ? [{ project_plugin_id: entry.project_plugin_id, ...entry.workbench }] : [])
    .sort((a, b) => a.order - b.order)
    .map((registered, _at, all) => {
      const { order: _order, clientServed: _served, clientUses, ...pack } = registered, factory = clientOf(registered);
      if (factory === undefined) return pack;
      const assets = [...(registered.clientAssets ?? []), ...(clientUses ?? []).map(bundleUrl)];
      return { ...pack, ...(assets.length > 0 ? { clientAssets: assets } : {}), clientFactory: clientUses ? withUsedClients(registered, factory, all, catalog) : factory };
    });
}
export const BUILTIN_PLUGIN_WORKBENCH: readonly BuiltinPluginWorkbenchPack[] = pluginWorkbenchPacks();

export function pluginWorkbenchStyles(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): string {
  return packs.map((pack) => pack.stylesheet ?? "").join("");
}

export function pluginWorkbenchSettingsStyles(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): string {
  return packs
    .filter((pack) => pack.settingsClient)
    .map((pack) => pack.stylesheet ?? "")
    .join("");
}

export function pluginSearchRows(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): Array<[string, string, string]> {
  return packs.flatMap((pack) => pack.searchRow
    ? [[pack.project_plugin_id, pack.searchRow.selector, pack.searchRow.idDataset] as [string, string, string]]
    : []);
}

/** The rows a record opens from on a plugin's page where they differ from its search row; the page falls back to that. */
export function pluginRecordRows(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): Array<[string, string, string]> {
  return packs.flatMap((pack) => pack.recordRow
    ? [[pack.project_plugin_id, pack.recordRow.selector, pack.recordRow.idDataset] as [string, string, string]]
    : []);
}

export function pluginWorkbenchClientBootstrap(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH, deferClients = false): string {
  return packs.flatMap((pack) => {
    const lines: string[] = [];
    if (pack.clientFactory && !deferClients) {
      lines.push(`(${pack.clientFactory})({ mountPluginClient, translate: L, projectId: () => state.project?.project_id || document.body.dataset.projectId || "", projectTitle: () => state.project?.display_name || "", api, route });`);
    }
    if (pack.settingsClient) lines.push(pack.settingsClient);
    return lines;
  }).join("\n    ");
}

/** A surface's client: the bundle that carries its factory and what it prepares first (the bundles of the clients it uses among them). */
export interface PluginSurfaceClient { readonly id: string; readonly plugin_id: string; readonly bundle: string; readonly assets: readonly string[]; readonly factory: string; readonly searchRow?: PluginWorkbenchRegistration["searchRow"]; readonly recordRow?: PluginWorkbenchRegistration["recordRow"] }

/** Every surface with a client, each pointing at the one bundle that serves it. */
export function pluginSurfaceClients(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): PluginSurfaceClient[] {
  return packs.flatMap((pack) => pack.clientFactory
    ? [{ id: pack.project_plugin_id, plugin_id: BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === pack.project_plugin_id)?.manifest.plugin_id ?? "", bundle: pack.project_plugin_id, assets: pack.clientAssets ?? [], factory: pack.clientFactory, searchRow: pack.searchRow, recordRow: pack.recordRow }]
    : []);
}

/** Surfaces the Host renders itself with their own bundle, served under the plugin pack address (CHR-1 D5: 角色). */
const HOST_SURFACE_CLIENTS: readonly Pick<PluginSurfaceClient, "id" | "bundle" | "assets">[] = [{ id: "characters", bundle: "characters", assets: [] }];

/** Every surface the deferred loader mounts on first show: the plugins' and the Host's own. */
export function deferredSurfaceClients(): (Pick<PluginSurfaceClient, "id" | "bundle" | "assets"> & Partial<Pick<PluginSurfaceClient, "plugin_id" | "searchRow" | "recordRow">>)[] {
  return [...pluginSurfaceClients(), ...HOST_SURFACE_CLIENTS];
}

/** Fixed-build client assets derived from the same registration as styles and UI: one per bundle. */
export function pluginWorkbenchClientAsset(id: string): string | null {
  const pack = BUILTIN_PLUGIN_WORKBENCH.find(pack => pack.project_plugin_id === id);
  return pack?.clientFactory ? `globalThis.molisWorkbenchPluginFactories ||= {}; globalThis.molisWorkbenchPluginFactories[${JSON.stringify(id)}] = ${pack.clientFactory};` : null;
}
