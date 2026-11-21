import type { PluginRegistration, PluginWorkbenchRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { declaresOwner, ownedContribution, type OwnedUiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { drawCatalogText } from "./plugin-text.js";
import { splitPluginStylesheet, type SplitStylesheet } from "./plugin-styles.js";
import {
  CODING_BASICS_STYLES,
  COMPOSER_STYLES,
  CONTEXT_TOOLBAR_STYLES,
  INPUT_RECEIPTS_STYLES,
  INTERACTION_STYLES,
  KEEP_EDITS_STYLES,
  PRESENTATION_FORM_STYLES,
  PRIMITIVE_PLUGIN_CALENDAR,
  PRIMITIVE_PLUGIN_LAYOUT_SHELL,
  PRIMITIVE_PLUGIN_SEVERITY,
  SETTINGS_DOCUMENT_STYLES,
  SOURCE_LADDER_STYLES,
} from "@molis-ai/molis-work-design-system";
import { CODING_COMPANION_STYLES } from "./styles/coding-companions.js";
import { DETAIL_READING_STYLES } from "./styles/detail-reading.js";
export type { PluginSearchRow } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

export interface BuiltinPluginWorkbenchPack extends Omit<PluginWorkbenchRegistration, "order" | "clientServed" | "clientUses" | "contributions"> {
  readonly project_plugin_id: string;
  /** The contributions as the platform registers them: each owned by the plugin its catalog entry's Manifest names (PG-098), never by what the contribution says. */
  readonly contributions: readonly OwnedUiContribution[];
}

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
  const owners = new Map(catalog.map(entry => [entry.project_plugin_id, entry.manifest]));
  const shipped = catalog === BUILTIN_PLUGIN_CATALOG;
  return catalog.flatMap(entry => entry.workbench ? [{ project_plugin_id: entry.project_plugin_id, ...entry.workbench }] : [])
    .sort((a, b) => a.order - b.order)
    .map((registered, _at, all) => {
      const { order: _order, clientServed: _served, clientUses, ...rest } = registered, factory = clientOf(registered);
      const styleUses = [...new Set([...(registered.stylesheetUses ?? []), ...(clientUses ?? [])])];
      const pack = { ...rest, ...(styleUses.length > 0 ? { stylesheetUses: styleUses } : {}) };
      if (factory === undefined) return pack;
      const assets = [...(registered.clientAssets ?? []), ...(clientUses ?? []).map(bundleUrl)];
      return { ...pack, ...(assets.length > 0 ? { clientAssets: assets } : {}), clientFactory: clientUses ? withUsedClients(registered, factory, all, catalog) : factory };
    })
    .map(pack => ({ ...pack, contributions: pack.contributions.map(contribution => {
      // The platform fills the owner from the Manifest; a contribution that writes one is refused, as the Runtime and `ui:register` refuse it, never overwritten.
      if (declaresOwner(contribution.descriptor)) {
        throw new Error(`${pack.project_plugin_id} 的贡献 ${contribution.descriptor.contribution_id} 自己写了插件身份；插件身份由平台按 Manifest 填写，请删掉 plugin_id`);
      }
      const manifest = owners.get(pack.project_plugin_id)!;
      const owned = ownedContribution(contribution, manifest.plugin_id);
      // Only the canonical catalog can enter the Host's bound packaged text scope.
      return shipped ? { ...owned, render: request => drawCatalogText(manifest, () => owned.render(request)) } : owned;
    }) }));
}
export const BUILTIN_PLUGIN_WORKBENCH: readonly BuiltinPluginWorkbenchPack[] = pluginWorkbenchPacks();

const splits = new WeakMap<BuiltinPluginWorkbenchPack, SplitStylesheet | null>();

/**
 * A plugin that carries a client (`clientFactory` in a frame, or `pageClients` drawn in the shell) sends the rules of its
 * own namespaces as a sheet of its own (PG-070, PEQ-08): framed plugins link it inside their frame, shell-drawn plugins
 * link it in the workbench head only when enabled in the project (`pluginShellStyleLinks`), and standalone settings pages
 * link it via `pluginSettingsStyleLinks`.
 */
function splitOf(pack: BuiltinPluginWorkbenchPack): SplitStylesheet | null {
  if (!pack.stylesheet || (!pack.clientFactory && !pack.pageClients)) return null;
  let split = splits.get(pack);
  if (split === undefined) splits.set(pack, split = splitPluginStylesheet(pack.stylesheet, pack.project_plugin_id, pack.stylesheetShared, pack.stylesheetPrefixes));
  return split;
}

/**
 * What the shared workbench sheet holds of the plugins' styles in one layer: everything a framed plugin does not bring itself.
 * The sheet puts the "beneath-shell" layer before the shell's own layers and the "over-shell" one after them (`stylesheetLayer`).
 */
export function pluginWorkbenchStyles(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH, layer: "over-shell" | "beneath-shell" = "over-shell"): string {
  return packs.filter((pack) => (pack.stylesheetLayer ?? "over-shell") === layer).map((pack) => splitOf(pack)?.shared ?? pack.stylesheet ?? "").join("");
}

/** A framed plugin's own sheet (`/assets/molis-work-plugins/<id>.css`), or null when all its rules are shared. */
export function pluginOnDemandStylesheet(id: string, packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): string | null {
  const pack = packs.find(candidate => candidate.project_plugin_id === id);
  return (pack && splitOf(pack)?.scoped) || null;
}

/** Lower-specificity layout-shell primitives for framed plugins so a later dependency sheet (e.g. git.css after coding.css) never overrides the host plugin's responsive overrides. */
const FRAMED_LAYOUT_SHELL = PRIMITIVE_PLUGIN_LAYOUT_SHELL.replaceAll(":is(.mw-catalog, .mw-layout-primitives)", ":where(.mw-catalog, .mw-layout-primitives)");

const FRAMED_PLUGIN_EXTRA_STYLES: Readonly<Record<string, string>> = {
  coding: `${FRAMED_LAYOUT_SHELL}${COMPOSER_STYLES}${CODING_BASICS_STYLES}${CODING_COMPANION_STYLES}${SETTINGS_DOCUMENT_STYLES}${INPUT_RECEIPTS_STYLES}${INTERACTION_STYLES}.assistant-code pre{tab-size:var(--code-tab,4)}`,
  feed: `${KEEP_EDITS_STYLES}${SOURCE_LADDER_STYLES}${DETAIL_READING_STYLES}`,
  git: `${FRAMED_LAYOUT_SHELL}${CODING_BASICS_STYLES}${CODING_COMPANION_STYLES}`,
  inbox: `${PRESENTATION_FORM_STYLES}${DETAIL_READING_STYLES}`,
  jelly: PRIMITIVE_PLUGIN_CALENDAR,
  pages: CONTEXT_TOOLBAR_STYLES,
  risk: `${PRIMITIVE_PLUGIN_SEVERITY}${FRAMED_LAYOUT_SHELL}`,
  schedule: DETAIL_READING_STYLES,
  shelf: SETTINGS_DOCUMENT_STYLES,
  "work-brief": FRAMED_LAYOUT_SHELL,
};

/**
 * Full stylesheet served at `/assets/molis-work-plugins/<id>.css` for opaque plugin frames (102-1).
 * Framed plugins now load the lightweight `molis-work-plugin-base.css` instead of `molis-work-workbench.css`,
 * so their served on-demand sheet includes their own `shared` split rules (e.g. `@keyframes`, `.pc-*`, `.alc-*`)
 * plus any specialized design-system feature sheet only that plugin renders. `pluginOnDemandStylesheet` stays unchanged.
 */
export function pluginFrameServedStylesheet(id: string, packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): string | null {
  const pack = packs.find(candidate => candidate.project_plugin_id === id);
  const split = pack ? splitOf(pack) : null;
  if (!split?.scoped) return null;
  if (!pack?.clientFactory) return split.scoped;
  const extra = FRAMED_PLUGIN_EXTRA_STYLES[id] ?? "";
  return `${extra}${split.shared}${split.scoped}`;
}

/** The sheets a plugin's frame links: its own, then those of the plugins whose classes it draws. */
function framedStyles(pack: BuiltinPluginWorkbenchPack, packs: readonly BuiltinPluginWorkbenchPack[]): string[] {
  return [...new Set([pack.project_plugin_id, ...(pack.stylesheetUses ?? [])])].filter(id => pluginOnDemandStylesheet(id, packs) !== null);
}

/** The rules every plugin's settings pages draw with, for the settings sheet and the workbench sheet (settings open inside a project). */
export function pluginSettingsStyles(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): string {
  return packs.map((pack) => pack.settingsStylesheet ?? "").join("");
}

/** Every plugin's settings script, for a settings page the shell draws as a whole page of its own. */
export function pluginSettingsClients(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): string {
  return packs.map((pack) => pack.settingsClient ?? "").join("");
}

/** The factories a plugin registers for the page the shell draws for it (`pageClients`); a plugin that registers none stops the build. */
export function pluginPageClients(id: string, packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): Readonly<Record<string, string>> {
  const clients = packs.find((pack) => pack.project_plugin_id === id)?.pageClients;
  if (!clients) throw new Error(`${id} registers no page clients`);
  return clients;
}

/** The links a plugin's settings page needs beside the host's own settings sheet: the sheets its frame would link (PG-070). */
export function pluginSettingsStyleLinks(contributionId: string, packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): string {
  const pack = packs.find(candidate => candidate.contributions.some(contribution => contribution.descriptor.contribution_id === contributionId));
  if (!pack) return "";
  return framedStyles(pack, packs).map(id => `<link rel="stylesheet" href="/assets/molis-work-plugins/${encodeURIComponent(id)}.css">`).join("");
}

/** The on-demand sheets that enabled shell-drawn plugins (`pageClients`, no iframe) need in the workbench head (PEQ-08). */
export function pluginShellStyleLinks(enabled: readonly string[], packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH): string {
  const active = new Set(enabled);
  const ids = new Set<string>();
  for (const pack of packs) {
    if (!pack.pageClients || pack.clientFactory || !active.has(pack.project_plugin_id)) continue;
    for (const id of framedStyles(pack, packs)) ids.add(id);
  }
  return [...ids].map(id => `<link rel="stylesheet" href="/assets/molis-work-plugins/${encodeURIComponent(id)}.css" data-plugin-shell-style="${escapeAttr(id)}">`).join("");
}

const escapeAttr = (value: string): string => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

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
      // The page translates what the client draws with the words of the plugin it belongs to, never with another's.
      lines.push(`(${pack.clientFactory})({ mountPluginClient, projectId: () => state.project?.project_id || document.body.dataset.projectId || "", projectTitle: () => state.project?.display_name || "", api, route });`);
    }
    if (pack.settingsClient) lines.push(pack.settingsClient);
    return lines;
  }).join("\n    ");
}

/** A surface's client: the bundle that carries its factory and what it prepares first (the bundles of the clients it uses among them). */
export interface PluginSurfaceClient { readonly id: string; readonly plugin_id: string; readonly bundle: string; readonly assets: readonly string[]; readonly styles: readonly string[]; readonly factory: string; readonly searchRow?: PluginWorkbenchRegistration["searchRow"]; readonly recordRow?: PluginWorkbenchRegistration["recordRow"] }

const pluginIdOf = (catalog: readonly PluginRegistration[], projectPluginId: string): string =>
  catalog.find(entry => entry.project_plugin_id === projectPluginId)?.manifest.plugin_id ?? "";

/** Every surface with a client, each pointing at the one bundle that serves it. */
export function pluginSurfaceClients(packs: readonly BuiltinPluginWorkbenchPack[] = BUILTIN_PLUGIN_WORKBENCH, catalog: readonly PluginRegistration[] = BUILTIN_PLUGIN_CATALOG): PluginSurfaceClient[] {
  return packs.flatMap((pack) => pack.clientFactory
    ? [{ id: pack.project_plugin_id, plugin_id: pluginIdOf(catalog, pack.project_plugin_id), bundle: pack.project_plugin_id, assets: pack.clientAssets ?? [], styles: framedStyles(pack, packs), factory: pack.clientFactory, searchRow: pack.searchRow, recordRow: pack.recordRow }]
    : []);
}

/**
 * The Host's own surfaces, mounted on first show beside the plugins'. The Host's 角色 pages are settings pages now (Settings › 角色 and
 * 项目设置 › 角色, docs/design/role-scope), loaded by their own settings loader, so 角色 is not among them.
 */
const HOST_SURFACE_CLIENTS: readonly Pick<PluginSurfaceClient, "id" | "bundle" | "assets">[] = [
  { id: "sessions", bundle: "sessions", assets: [] },
];

/** Every surface the deferred loader mounts on first show: the plugins' and the Host's own. */
export function deferredSurfaceClients(): (Pick<PluginSurfaceClient, "id" | "bundle" | "assets"> & Partial<Pick<PluginSurfaceClient, "plugin_id" | "styles" | "searchRow" | "recordRow">>)[] {
  return [...pluginSurfaceClients(), ...HOST_SURFACE_CLIENTS];
}

/** Fixed-build client assets derived from the same registration as styles and UI: one per bundle. */
export function pluginWorkbenchClientAsset(id: string): string | null {
  const pack = BUILTIN_PLUGIN_WORKBENCH.find(pack => pack.project_plugin_id === id);
  return pack?.clientFactory ? `globalThis.molisWorkbenchPluginFactories ||= {}; globalThis.molisWorkbenchPluginFactories[${JSON.stringify(id)}] = ${pack.clientFactory};` : null;
}
