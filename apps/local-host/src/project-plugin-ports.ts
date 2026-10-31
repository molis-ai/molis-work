import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { observeReviewSettlements, type AgentWritePlaces } from "./review-settlement-events.js";
import { ensureInstalledPlugins } from "./installed-plugin-host.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import type { InstalledPluginEntry } from "./plugin-installed-view.js";
import type { InstalledRelease } from "./installed-release.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkLocalHostOptions, MolisWorkProjectRuntime } from "./project-host.js";
import { ensureProjectPlugins, runningProjectPlatform } from "./project-plugins.js";
import { hostDependencyCheck } from "./plugin-actions-client.js";
import type { HomePluginHost } from "./home-plugins.js";

/**
 * What the project's plugin ports are read from. `agents` is read when a call needs it, not when the Host is built: the
 * Agent service is attached to the Host afterwards.
 */
export interface ProjectPluginHost {
  readonly host: LocalHost<MolisWorkProjectRuntime>;
  readonly options: MolisWorkLocalHostOptions;
  agents(): AgentHostComposition | undefined;
  /** The Home's plugin host, which runs a package that asks for the Home (BL-628); none when the Host has no Home. */
  homePlugins(): HomePluginHost | undefined;
}

/** The plugins installed in this project (generated, installed from the market): their actions join the project's directory. */
export async function prepareInstalledPlugins(source: ProjectPluginHost, reference: LocalHostProjectReference, runtime: MolisWorkProjectRuntime): Promise<void> {
  if (!source.options.homeDirectory) return;
  await (await installedPluginsOf(source, reference, runtime)).refreshPublicActions();
}

function installedPluginsOf(source: ProjectPluginHost, reference: LocalHostProjectReference, runtime: MolisWorkProjectRuntime) {
  const { host, options } = source;
  return ensureInstalledPlugins({ store: runtime.store, projectId: runtime.project_id, homeDirectory: options.homeDirectory!, actorId: LOCAL_PERSON_ACTOR_ID,
    routePrefix: options.projectRoutePrefix?.(reference.project_id) ?? `/projects/${encodeURIComponent(reference.project_id)}`,
    dependencyCheck: hostDependencyCheck(host.client(reference)),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, scenes: host.sceneClient(reference), project_id: reference.project_id,
      // This internal directory is already in a prepared Host; recursing through the public entry would wait on itself.
      inspect: caller => host.inspectActions(caller, reference) } });
}

/** Installs a release read from a signed package in the project the person is in; the project's installed plugins are the ones that run it. */
export async function installPackageInProject(source: ProjectPluginHost, projectId: string, release: InstalledRelease): Promise<void> {
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference || !source.options.homeDirectory) throw new ActionError("actions.scope_mismatch", "安装需要一个打开的项目");
  await source.host.withRuntime(reference, async runtime => {
    const installed = await installedPluginsOf(source, reference, runtime);
    await installed.installPackage(release, { consent: true });
    await installed.refreshPublicActions();
  });
}

/**
 * Switches one signed-package installation of the project off or on, or takes it off (BL-623). Only an installation that came from a signed package
 * is reached here; the package is read back without asking whether its publisher is still trusted, so a publisher taken back does not stop the
 * person from taking its plugin off. Answers the state the installation is in afterwards.
 */
export async function controlPackageInProject(source: ProjectPluginHost, projectId: string, pluginId: string, action: "disable" | "enable" | "uninstall", input: { keep_data: boolean }): Promise<string> {
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference || !source.options.homeDirectory) throw new ActionError("actions.scope_mismatch", "需要一个打开的项目");
  return await source.host.withRuntime(reference, async runtime => {
    const installed = await installedPluginsOf(source, reference, runtime);
    const release = installed.packageOf(pluginId);
    if (!release) throw pluginErrors.state_invalid("这个项目里没有从签名的包装进来的这个插件");
    await installed.lifecycle(action, release, action === "uninstall" ? { keepData: input.keep_data } : {});
    await installed.refreshPublicActions();
    return installed.records().find(item => item.plugin_id === pluginId)?.state ?? "uninstalled";
  });
}

/** Installs a release read from a signed package in the Home: the Home's plugin host runs it, in the sandbox, for every project. */
export async function installPackageInHome(source: ProjectPluginHost, release: InstalledRelease): Promise<void> {
  const home = source.homePlugins();
  if (!home) throw new ActionError("actions.scope_mismatch", "这个 Host 没有 Home，不能把插件装进 Home");
  await home.installPackage(release);
}

/** The plugins installed in a project, each with the Manifest it was installed with; the project's built-in plugins are started first so they are listed too. */
export async function installedPluginsInProject(source: ProjectPluginHost, projectId: string): Promise<InstalledPluginEntry[]> {
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference) throw new ActionError("actions.scope_mismatch", "需要一个打开的项目");
  await ensureProjectPluginActions(source, reference);
  const entries = await source.host.withRuntime(reference, async runtime => {
    const installed = source.options.homeDirectory ? await installedPluginsOf(source, reference, runtime) : undefined;
    // A publisher the person took back since this project last looked: its installations are stopped before they are listed.
    await installed?.reconcilePublishers();
    // Why a package of this project is not running, when its plugin host knows; a plugin of the Host's build has none here.
    return installedPluginEntries(runtime.store.db).map(entry => ({ ...entry, recoveryError: installed?.recoveryErrors.get(entry.record.plugin_id) }));
  });
  // The Home's own packages of that publisher stop the same way.
  await source.homePlugins()?.reconcilePublishers();
  return entries;
}

/**
 * Switches one optional permission through the platform that owns this project's installation: its built-in plugins or its installed
 * packages. Only that Runtime stops the activation, saves its grants and starts it again.
 */
export async function regrantPluginInProject(source: ProjectPluginHost, projectId: string, installId: string, permission: string, granted: boolean): Promise<void> {
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference) throw new ActionError("actions.scope_mismatch", "需要一个打开的项目");
  await ensureProjectPluginActions(source, reference);
  await source.host.withRuntime(reference, async runtime => {
    const platform = await runningProjectPlatform(runtime.store, runtime.project_id);
    const record = platform?.runtime.list().find(row => row.install_id === installId);
    if (platform && record && platform.supervisor.state(record.plugin_id)?.install_id === installId) {
      await platform.runtime.regrant(installId, permission, granted);
      return;
    }
    if (source.options.homeDirectory) {
      const installed = await installedPluginsOf(source, reference, runtime);
      const owned = installed.records().find(row => row.install_id === installId);
      if (owned && installed.releaseFor(owned.plugin_id)) {
        await installed.platform.runtime.regrant(installId, permission, granted);
        return;
      }
    }
    throw pluginErrors.grant_denied("这个插件没有可以开关的可选权限");
  });
}

/**
 * The plugins that run as the Home's own instance, each with the Manifest the Home runs it by (BL-700) and why it is not running when the Home
 * knows (BL-715). A publisher the person took back is reconciled first, as a project's list does, so the state listed is the one after it.
 */
export async function installedHomePlugins(homePlugins: HomePluginHost | undefined): Promise<InstalledPluginEntry[]> {
  if (!homePlugins) return [];
  await homePlugins.ready();
  await homePlugins.reconcilePublishers();
  return homePlugins.installations().filter(record => record.state !== "uninstalled")
    .map(record => ({ record, manifest: homePlugins.manifest(record.plugin_id), recoveryError: homePlugins.packageError(record.plugin_id) }));
}

/**
 * Switches a package installed in the Home off or on, or takes it off (BL-715), for the Host settings door: only an installation that came from
 * a signed package (a plugin of the Host's build or a fixture is not reached here). Answers the state it is in afterwards.
 */
export async function controlHomePackage(homePlugins: HomePluginHost | undefined, pluginId: string, action: "disable" | "enable" | "uninstall", input: { keep_data: boolean }): Promise<string> {
  if (!homePlugins) throw pluginErrors.state_invalid("这个宿主没有个人空间");
  await homePlugins.ready();
  if (!homePlugins.hasPackage(pluginId)) throw pluginErrors.state_invalid("个人空间里没有从签名的包装进来的这个插件");
  await homePlugins.packageAction(pluginId, action, action === "uninstall" ? { keepData: input.keep_data } : {});
  return homePlugins.installation(pluginId)?.state ?? "uninstalled";
}

/** Switches one optional permission of a Home instance: the Home platform's supervisor runs it, so the Home platform stops it and starts it again. */
export async function regrantHomePlugin(homePlugins: HomePluginHost | undefined, installId: string, permission: string, granted: boolean): Promise<void> {
  const platform = await homePlugins?.ready();
  const record = platform?.runtime.list().find(row => row.install_id === installId && row.state !== "uninstalled");
  if (!platform || !record || !homePlugins?.manifest(record.plugin_id)) {
    throw pluginErrors.grant_denied("这个插件没有可以开关的可选权限");
  }
  await platform.runtime.regrant(installId, permission, granted);
}

/** The project's built-in Runtime plugins (Coding, Files, Git, ...): started once per project, their actions registered. */
export function ensureProjectPluginActions(source: ProjectPluginHost, reference: LocalHostProjectReference): Promise<unknown> {
  const { host, options } = source;
  const agents = () => source.agents();
  return host.withRuntime(reference, runtime => ensureProjectPlugins({
    store: runtime.store, artifacts: runtime.artifacts, processItems: runtime.processItems, projectId: runtime.project_id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: options.homeDirectory,
    dependencyCheck: hostDependencyCheck(host.client(reference)),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, scenes: host.sceneClient(reference), project_id: reference.project_id },
    ...(agents() ? { observeReviewSettlements: listener => observeReviewSettlements(agents()!.agentHost.reviews, runtime.project_id, listener,
      agentWritePlaces(source, runtime.project_id)) } : {}),
  }));
}

/** Where an Agent's approved write in this project landed (BL-366): its round's frozen directory, and the project's workspaces. */
function agentWritePlaces(source: ProjectPluginHost, projectId: string): AgentWritePlaces {
  return {
    async runDirectory(run) {
      const host = source.agents()?.agentHost;
      for (const { runtime_id } of host?.descriptors() ?? []) {
        const view = await host!.adapter(runtime_id).read(run).catch(() => null);
        if (view) return view.frozen.directory?.canonical_path ?? null;
      }
      return null;
    },
    async workspaces() {
      const { workspacesFor, workspaceFor } = source.options;
      if (workspacesFor) return workspacesFor(projectId);
      const one = await workspaceFor?.(projectId);
      return one ? [one] : [];
    },
  };
}
