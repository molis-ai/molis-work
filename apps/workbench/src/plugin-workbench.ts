import { BUILTIN_PLUGIN_CATALOG, type BuiltinPluginEntry, type BuiltinPluginWorkbench } from "./builtin-plugins.js";
export type { PluginSearchRow } from "./builtin-plugins.js";

export interface BuiltinPluginWorkbenchPack extends Omit<BuiltinPluginWorkbench, "order"> { readonly project_plugin_id: string }

/** Derive the registered UI and assets from the same entries used by the Host catalog. */
export function pluginWorkbenchPacks(catalog: readonly BuiltinPluginEntry[] = BUILTIN_PLUGIN_CATALOG): BuiltinPluginWorkbenchPack[] {
  return catalog.flatMap(entry => entry.workbench ? [{ project_plugin_id: entry.project_plugin_id, ...entry.workbench }] : [])
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...pack }) => pack);
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

/** A surface's client: the bundle that carries its factory (its own, or the one `clientFrom` names) and what it prepares first. */
export interface PluginSurfaceClient { readonly id: string; readonly bundle: string; readonly assets: readonly string[]; readonly factory: string }

/** Every surface with a client, each pointing at the one bundle that serves it. */
export function pluginSurfaceClients(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): PluginSurfaceClient[] {
  return packs.flatMap((pack) => {
    const source = pack.clientFrom ? packs.find(candidate => candidate.project_plugin_id === pack.clientFrom) : pack;
    return source?.clientFactory
      ? [{ id: pack.project_plugin_id, bundle: source.project_plugin_id, assets: source.clientAssets ?? [], factory: source.clientFactory }]
      : [];
  });
}

/** Fixed-build client assets derived from the same registration as styles and UI: one per bundle, none for a borrowed client. */
export function pluginWorkbenchClientAsset(id: string): string | null {
  const pack = BUILTIN_PLUGIN_WORKBENCH.find(pack => pack.project_plugin_id === id);
  return pack?.clientFactory ? `globalThis.molisWorkbenchPluginFactories ||= {}; globalThis.molisWorkbenchPluginFactories[${JSON.stringify(id)}] = ${pack.clientFactory};` : null;
}
