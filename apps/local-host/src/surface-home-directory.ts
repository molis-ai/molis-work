import { resolve } from "node:path";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionSubjectContext, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_ICON_NAMES, type PresentationFormValues } from "@molis-ai/molis-work-plugin-sdk/ui";
import { presentationOwnerHue } from "@molis-ai/molis-work-design-system";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { SurfaceHomePlugin, SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";
import { readOnlyAlwaysOnProjectPlugins, withFreshReadOnlyPluginDirectory } from "./always-on-plugins.js";
import { currentHomeStageHalves } from "./home-plugin-http.js";
import type { HomePluginHost } from "./home-plugins.js";
import { currentInstalledPluginHost } from "./installed-plugin-host.js";
import { installedManifestMatches, installedStageIdentity, installedStageReleaseMatches, sameInstalledRelease } from "./installed-stage-identity.js";
import { installedStageSurface } from "./installed-stage-section.js";
import { projectHomeRailOrder } from "./plugin-directory.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import { pluginPagesFor } from "./plugin-page-authority.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions } from "./plugin-install-actions.js";
import { availableProjectPluginIds, PLATFORM_PLUGIN_REGISTRATIONS, shownProjectPlugins } from "./plugin-registry.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { currentProjectPlatform } from "./project-plugins.js";
import { projectHomeStageLocation, runtimeStageOwner, type RuntimeStageOwner } from "./project-plugin-stages.js";

export type SurfaceHomeCatalogReader = <Result>(operation: (catalog: MolisWorkProjectCatalog) => Result) => Result | undefined;

interface DirectoryPorts {
  readonly store: LocalProjectDatabase;
  readonly reference: LocalHostProjectReference;
  readonly homeDirectory: string;
  readonly home?: HomePluginHost;
  readonly readCatalog: SurfaceHomeCatalogReader;
}

type Route = { view_id: string; shell: string; surface: string } &
  ({ kind: "native"; owner: RuntimeStageOwner } | { kind: "package" });
type SignedForm = NonNullable<ReturnType<ReturnType<typeof pluginPagesFor>["installedStartForm"]>>;

export interface HomeDirectoryEntry {
  readonly record: PluginInstanceRecord;
  readonly installation: SurfaceInstallationRef;
  readonly plugin: SurfacePlugin & { readonly home: SurfaceHomePlugin };
  readonly route?: Route;
  readonly signedForms: readonly SignedForm[];
  readonly display: PresentationFormValues["ownerDisplay"];
}

/** Locate the reader's own stage, or the actual stage of its registered dual native owner. */
export function objectStageLocation(entries: readonly HomeDirectoryEntry[], entry: HomeDirectoryEntry, open: ActionSubjectContext["open"]) {
  if (!open) return undefined;
  const stage = entry.route ? entry : entries.find(item => item.route?.kind === "native" && entry.record.publisher_trust === "host"
    && item.plugin.plugin_id === entry.plugin.plugin_id && item.record.publisher_signature === entry.record.publisher_signature);
  const route = stage?.route;
  if (!stage || !route || stage.record.state !== "running") return undefined;
  const main = open.surface === route.shell || open.surface === route.surface;
  if (!main && (route.kind !== "native" || !route.owner.view.descriptor.surfaces?.some(item =>
    item.surface_id === open.surface && item.target_slot_id === "workbench.main"))) return undefined;
  return { stage, viewId: route.view_id, id: open.id, surface: main ? route.surface : open.surface };
}

const projectEnable = { kind: "project_installation", action: { capability_id: pluginControlActions.enable.capability_id,
  version: pluginControlActions.enable.version, provider_id: PLUGIN_INSTALL_PROVIDER_ID } } as const;

function homeMembership(ports: DirectoryPorts) {
  const { homeDirectory, reference: { project_id, storage_key } } = ports;
  const membership = withFreshReadOnlyPluginDirectory(homeDirectory, () => ports.readCatalog(catalog => {
    if (resolve(catalog.getProject(project_id).database_path) !== storage_key || catalog.recycle.isRecycled(project_id))
      throw new ActionError("actions.scope_mismatch", "原项目已关闭或变化");
    const { plugins, hidden } = catalog.projectPluginMembership(project_id, () => readOnlyAlwaysOnProjectPlugins(homeDirectory));
    const shown = shownProjectPlugins(plugins, hidden).filter(key => !hidden.includes(key));
    const reach = availableProjectPluginIds(shown);
    const removed = new Set(PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => !reach.has(entry.project_plugin_id)
      && !hidden.includes(entry.project_plugin_id) && catalog.wasProjectPluginRemoved(project_id, entry.project_plugin_id)).map(entry => entry.project_plugin_id));
    return { shown: new Set(shown), hidden: new Set(hidden), removed };
  }));
  if (!membership) throw new ActionError("actions.unavailable", "项目目录尚未打开");
  return membership;
}

function nativeRoute(owner: RuntimeStageOwner, manifest: PluginManifest): Route | undefined {
  const stage = projectHomeStageLocation(manifest, owner.view);
  return stage ? { kind: "native", ...stage, shell: owner.entry.project_plugin_id, owner } : undefined;
}

function formsFor(ports: DirectoryPorts, record: PluginInstanceRecord, scope: SurfaceInstallationRef["scope"], manifest: PluginManifest | undefined,
  stage: Route | undefined) {
  const signedForms: SignedForm[] = [];
  const forms = (manifest?.presentation?.overview?.start ?? []).flatMap(declaration => {
    const open = declaration.open;
    if (!open || stage?.view_id !== open.view_id) return [];
    let action: ExactActionReference | undefined;
    if (stage.kind === "package") {
      const form = pluginPagesFor(ports.homeDirectory).installedStartForm(record.plugin_id, scope === "home" ? null : ports.reference.project_id,
        LOCAL_PERSON_ACTOR_ID, record, open.panel, declaration);
      if (form) { signedForms.push(form); action = form.action; }
    } else if (stage.owner.view.descriptor.surfaces?.some(surface => surface.surface_id === open.panel
      && surface.target_slot_id === "workbench.overlay" && surface.format === "declarative-html")) {
      const target = manifest?.actions?.find(item => item.capability_id === declaration.capability_id && item.version === declaration.version && item.action.scope === scope);
      if (target) action = { capability_id: target.capability_id, version: target.version,
        provider_id: record.publisher_trust === "host" ? record.plugin_id : record.install_id };
    }
    return action ? [{ ...open, action }] : [];
  });
  return { forms, signedForms };
}

function projectPackageRoute(record: PluginInstanceRecord, manifest: PluginManifest, installed: ReturnType<typeof currentInstalledPluginHost>): Route | undefined {
  if (record.state !== "running" || installed?.recoveryErrors.has(record.plugin_id)) return undefined;
  const release = installed?.releaseFor(record.plugin_id), stage = projectHomeStageLocation(manifest);
  if (!stage || !installedStageReleaseMatches(record, release, manifest)) return undefined;
  return { kind: "package", ...stage, shell: installedStageSurface(release) };
}

function homePackageRoute(home: HomePluginHost | undefined, id: string, manifest: PluginManifest): Route | undefined {
  if (!home?.packageStage(id)) return undefined;
  const stage = projectHomeStageLocation(manifest);
  return stage ? { kind: "package", ...stage, shell: id } : undefined;
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
    const platform = scope === "home" ? home?.surfacePlatform() : sandbox ? installed?.platform : project;
    const activation = platform?.supervisor.state(id);
    const active = record.state === "running" && activation?.status === "running" && activation.install_id === record.install_id && !!exact;
    const owner = active && stage && !sandbox ? runtimeStageOwner({ platform: project }, stage, halves).owner : undefined;
    const route = active && exact ? sandbox
      ? scope === "project" ? projectPackageRoute(record, exact, installed)
        : homePackageRoute(home, id, exact)
      : owner?.scope === scope && sameInstalledRelease(owner.installation, record) ? nativeRoute(owner, exact) : undefined
      : undefined;
    const { forms, signedForms } = formsFor(ports, record, scope, exact, route);
    const enable = record.state !== "disabled" || record.publisher_trust !== "pinned" ? undefined
      : scope === "home" && !!exact && home?.hasPackage(id) ? { kind: "home_plugin_settings" as const }
        : scope === "project" && installedStageReleaseMatches(record, installed?.releaseFor(id), exact) ? projectEnable : undefined;
    const unavailable = record.state === "running" ? !active : record.state === "disabled" && !!builtin?.project_runtime && scope === "project" && !removed;
    const installation = installedStageIdentity(scope, record);
    const contribution = active ? platform?.supervisor.contribution(id) : undefined;
    const slots = contribution?.kind === "app" ? contribution.views?.flatMap(view => view.descriptor.slots) ?? [] : [];
    const directory = { id: route?.shell ?? key, plugin_id: id, name: exact?.name ?? stage?.manifest.name ?? id,
      chosen: builtin !== undefined, ...(builtin?.personal || !builtin && scope === "home" && !home?.dualInstance(id) ? { personal: true as const } : {}), ui: { views: exact?.ui.views ?? [] } };
    // The real member revision and setter land together in batch 20. Until then a removed native installation is a disabled card,
    // without a guessed revision or a second write path.
    return [{ record, installation, route, directory, presentation: exact?.presentation, slots, forms, signedForms, enable, unavailable }];
  });
  const ordered = projectHomeRailOrder(rows.map(row => row.directory));
  return rows.map(({ record, installation, route, directory: entry, presentation, slots, forms, signedForms, enable, unavailable }) => ({
    record, installation, route, signedForms, display: { name: entry.name, hue: presentationOwnerHue(record.plugin_id), icon: PLUGIN_ICON_NAMES.find(icon => icon === (entry.ui.views?.find(view => view.slot === "navigator")?.icon ?? entry.ui.views?.find(view => view.slot === "stage")?.icon)) },
    plugin: { plugin_id: record.plugin_id, install_id: record.install_id, scope: installation.scope,
      revision: JSON.stringify([installation, record.publisher_signature, record.publisher_trust]), state: record.state, presentation, slots,
      home: { order: ordered.get(entry.id) ?? ordered.size, installation_generation: installation.installation_generation,
        version: installation.version, manifest_digest: installation.manifest_digest, ...(route ? { stage_view_id: route.view_id } : {}),
        ...(forms.length ? { forms } : {}), ...(enable ? { enable } : {}), ...(unavailable ? { unavailable: true } : {}) } },
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
