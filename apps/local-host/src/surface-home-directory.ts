import { resolve } from "node:path";
import { ActionError, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { railEntries, stageOpeningView, stageSurfaceDescriptors, type PluginDirectoryEntry } from "@molis-ai/molis-work-app-workbench";
import type { SurfaceHomePlugin, SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";
import { readOnlyAlwaysOnProjectPlugins, withFreshReadOnlyPluginDirectory } from "./always-on-plugins.js";
import { currentHomeStageHalves } from "./home-plugin-http.js";
import type { HomePluginHost } from "./home-plugins.js";
import { installedStartForm } from "./installed-action-registration.js";
import { currentInstalledPluginHost } from "./installed-plugin-host.js";
import { installedManifestMatches, installedStageIdentity, installedStageReleaseMatches, sameInstalledRelease } from "./installed-stage-identity.js";
import { installedStageSurface } from "./installed-stage-section.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions } from "./plugin-install-actions.js";
import { availableProjectPluginIds, PLATFORM_PLUGIN_REGISTRATIONS, shownProjectPlugins } from "./plugin-registry.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { currentProjectPlatform } from "./project-plugins.js";
import { runtimeStageOwner, type RuntimeStageOwner } from "./project-plugin-stages.js";

interface DirectoryPorts {
  readonly store: LocalProjectDatabase;
  readonly reference: LocalHostProjectReference;
  readonly homeDirectory: string;
  readonly home?: HomePluginHost;
  readCatalog<Result>(operation: (catalog: MolisWorkProjectCatalog) => Result): Result;
}

type Route = { view_id: string; shell: string; surface: string } &
  ({ kind: "native"; owner: RuntimeStageOwner } | { kind: "package" });
export interface HomeDirectoryEntry {
  readonly record: PluginInstanceRecord;
  readonly installation: SurfaceInstallationRef;
  readonly plugin: SurfacePlugin & { readonly home: SurfaceHomePlugin };
  readonly route?: Route;
}

const projectEnable = { kind: "project_installation", action: { capability_id: pluginControlActions.enable.capability_id,
  version: pluginControlActions.enable.version, provider_id: PLUGIN_INSTALL_PROVIDER_ID } } as const;

function homeMembership(ports: DirectoryPorts) {
  const { homeDirectory, reference: { project_id, storage_key } } = ports;
  return withFreshReadOnlyPluginDirectory(homeDirectory, () => ports.readCatalog(catalog => {
    if (resolve(catalog.getProject(project_id).database_path) !== storage_key || catalog.recycle.isRecycled(project_id))
      throw new ActionError("actions.scope_mismatch", "原项目已关闭或变化");
    const { plugins, hidden } = catalog.projectPluginMembership(project_id, () => readOnlyAlwaysOnProjectPlugins(homeDirectory));
    const shown = shownProjectPlugins(plugins, hidden).filter(key => !hidden.includes(key));
    const reach = availableProjectPluginIds(shown);
    const removed = new Set(PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => !reach.has(entry.project_plugin_id)
      && !hidden.includes(entry.project_plugin_id) && catalog.wasProjectPluginRemoved(project_id, entry.project_plugin_id)).map(entry => entry.project_plugin_id));
    return { shown: new Set(shown), hidden: new Set(hidden), removed };
  }));
}

function nativeRoute(owner: RuntimeStageOwner, manifest: PluginManifest): Route | undefined {
  const view = stageOpeningView(manifest);
  const surface = stageSurfaceDescriptors(manifest, owner.view).find(item => item.target_slot_id === "workbench.main");
  if (!view || !surface) return undefined;
  return { kind: "native", view_id: view.view_id, shell: owner.entry.project_plugin_id, surface: surface.surface_id, owner };
}

function formsFor(record: PluginInstanceRecord, scope: SurfaceInstallationRef["scope"], manifest: PluginManifest,
  stage: Route | undefined, home: HomePluginHost | undefined, installed: ReturnType<typeof currentInstalledPluginHost>): SurfaceHomePlugin["forms"] {
  const forms = (manifest.presentation?.overview?.start ?? []).flatMap(declaration => {
    const open = declaration.open;
    if (!open || stageOpeningView(manifest)?.view_id !== open.view_id) return [];
    let action: ExactActionReference | undefined;
    if (record.execution === "sandbox" && stage?.kind === "package") {
      action = scope === "home" ? home?.surfaceReads.packageForm(record, open.panel, declaration)
        : installed && installedStartForm(installed.actions, record, open.panel, declaration);
    } else if (stage?.kind === "native" && stage.owner.view.descriptor.surfaces?.some(surface => surface.surface_id === open.panel
      && surface.target_slot_id === "workbench.overlay" && surface.format === "declarative-html")) {
      const target = manifest.actions?.find(item => item.capability_id === declaration.capability_id && item.version === declaration.version && item.action.scope === scope);
      if (target) action = { capability_id: target.capability_id, version: target.version,
        provider_id: record.publisher_trust === "host" ? record.plugin_id : record.install_id };
    }
    return action ? [{ ...open, action }] : [];
  });
  return forms.length ? forms : undefined;
}

function projectPackageRoute(record: PluginInstanceRecord, manifest: PluginManifest, installed: ReturnType<typeof currentInstalledPluginHost>): Route | undefined {
  if (record.state !== "running" || installed?.recoveryErrors.has(record.plugin_id)) return undefined;
  const release = installed?.releaseFor(record.plugin_id), view = stageOpeningView(manifest);
  if (!view || !installedStageReleaseMatches(record, release, manifest)) return undefined;
  return { kind: "package", view_id: view.view_id, shell: installedStageSurface(release), surface: "workbench" };
}

/** One synchronous sample of the existing Catalog, both installation owners and the workbench's own stage choice. */
function sample(ports: DirectoryPorts): HomeDirectoryEntry[] {
  const { store, reference: { project_id }, home } = ports;
  const membership = homeMembership(ports);
  const project = currentProjectPlatform(store, project_id), installed = currentInstalledPluginHost(store, project_id);
  const halves = currentHomeStageHalves(home);
  const entries = [
    ...installedPluginEntries(store.db).map(item => ({ ...item, scope: "project" as const })),
    ...(home?.installations() ?? []).filter(record => record.state !== "uninstalled").map(record =>
      ({ record, manifest: home?.manifest(record.plugin_id), scope: "home" as const })),
  ];
  const rows = entries.flatMap(({ record, manifest, scope }) => {
    const id = record.plugin_id;
    const builtin = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.manifest.plugin_id === id && item.manifest.publisher.signature === record.publisher_signature
      && record.publisher_trust === "host");
    const fromHome = halves?.entries.find(item => item.manifest.plugin_id === id && item.manifest.publisher.signature === record.publisher_signature);
    const stage = builtin ?? fromHome;
    const key = stage?.project_plugin_id ?? id;
    const sandbox = record.execution === "sandbox" && record.publisher_trust !== "host";
    if ((!stage && !sandbox) || membership.hidden.has(key) || membership.hidden.has(id)) return [];
    const wanted = membership.shown.has(key);
    const removed = !!builtin?.project_runtime && scope === "project" && !wanted && membership.removed.has(key) && record.state === "disabled";
    if (builtin && !wanted && !removed || !builtin && !fromHome && !sandbox) return [];
    const exact = installedManifestMatches(record, manifest) ? manifest : undefined;
    if (exact && exact.kind !== "app" && exact.kind !== "native") return [];
    const platform = scope === "home" ? home?.surfaceReads.platform() : sandbox ? installed?.platform : project;
    const activation = platform?.supervisor.state(id);
    const active = record.state === "running" && activation?.status === "running" && activation.install_id === record.install_id && !!exact;
    const owner = active && stage && !sandbox ? runtimeStageOwner({ platform: project }, stage, halves).owner : undefined;
    const route = active && exact ? sandbox
      ? scope === "project" ? projectPackageRoute(record, exact, installed)
        : home?.packageSurface(id) && stageOpeningView(exact) ? { kind: "package" as const, view_id: stageOpeningView(exact)!.view_id, shell: id, surface: "workbench" } : undefined
      : owner?.scope === scope && sameInstalledRelease(owner.installation, record) ? nativeRoute(owner, exact) : undefined
      : undefined;
    const forms = active && exact ? formsFor(record, scope, exact, route, home, installed) : undefined;
    const enable = record.state !== "disabled" || record.publisher_trust !== "pinned" ? undefined
      : scope === "home" && !!exact && home?.hasPackage(id) ? { kind: "home_plugin_settings" as const }
        : scope === "project" && installedStageReleaseMatches(record, installed?.releaseFor(id), exact) ? projectEnable : undefined;
    const unavailable = record.state === "running" ? !active : record.state === "disabled" && !!builtin?.project_runtime && scope === "project" && !removed;
    const installation = installedStageIdentity(scope, record);
    const contribution = active ? platform?.supervisor.contribution(id) : undefined;
    const slots = contribution?.kind === "app" ? contribution.views?.flatMap(view => view.descriptor.slots) ?? [] : [];
    const directory: PluginDirectoryEntry = { id: route?.shell ?? key, plugin_id: id, name: exact?.name ?? stage?.manifest.name ?? id,
      chosen: builtin !== undefined, ...(builtin?.personal || !builtin && scope === "home" && !home?.dualInstance(id) ? { personal: true } : {}), ui: { views: exact?.ui.views ?? [] } };
    // The real member revision and setter land together in batch 20. Until then a removed native installation is a disabled card,
    // without a guessed revision or a second write path.
    return [{ record, installation, route, directory, presentation: exact?.presentation, slots, forms, enable, unavailable }];
  });
  const directory = [...new Map(rows.map(row => [row.directory.id, row.directory])).values()];
  const ordered = new Map(railEntries(directory.map(entry => entry.id), directory).map((entry, index) => [entry.id, index]));
  return rows.map(({ record, installation, route, directory: entry, presentation, slots, forms, enable, unavailable }) => ({
    record, installation, route,
    plugin: { plugin_id: record.plugin_id, install_id: record.install_id, scope: installation.scope,
      revision: JSON.stringify([installation, record.publisher_signature, record.publisher_trust]), state: record.state, presentation, slots,
      home: { order: ordered.get(entry.id) ?? ordered.size, installation_generation: installation.installation_generation,
        version: installation.version, manifest_digest: installation.manifest_digest, ...(route ? { stage_view_id: route.view_id } : {}),
        ...(forms ? { forms } : {}), ...(enable ? { enable } : {}), ...(unavailable ? { unavailable: true } : {}) } },
  }));
}

const facts = (entries: readonly HomeDirectoryEntry[]) => JSON.stringify(entries.map(({ plugin, route }) =>
  [plugin.plugin_id, plugin.scope, plugin.install_id, plugin.revision, plugin.state, plugin.home, route?.shell, route?.surface,
    route?.kind === "native" ? route.owner.producer : undefined]));

export function surfaceHomeDirectory(ports: DirectoryPorts) {
  const entries = sample(ports), original = facts(entries);
  return { entries, plugins: entries.map(entry => entry.plugin), assertVisiblePackage(pluginId: string) {
    if (homeMembership(ports).hidden.has(pluginId))
      throw new ActionError("actions.plugin_disabled", "此项目不再显示该插件");
  }, assertCurrent() {
    if (!ports.store.db.open || facts(sample(ports)) !== original)
      throw new ActionError("actions.provider_changed", "首页的插件目录已变化，请重新读取");
    for (const { route } of entries) if (route?.kind === "native") route.owner.assertCurrent();
  } };
}
