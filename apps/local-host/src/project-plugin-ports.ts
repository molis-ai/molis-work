import type { InstalledPackageRepair } from './installed-plugin-common.js';
import { inLanguagePreview, languagePreviewUnavailable } from "./web-locale.js";
import { ActionError, LOCAL_PERSON_ACTOR_ID, requireSynchronous, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { observeReviewSettlements, type AgentWritePlaces } from "./review-settlement-events.js";
import { agentContinuationStarts } from "./agent-continuation-starts.js";
import { currentInstalledPluginHost, ensureInstalledPlugins, runningInstalledPlugins } from "./installed-plugin-host.js";
import { installedPluginEntries, installedPluginManifest } from "./plugin-installation-directory.js";
import { pluginInstallRecords } from "./plugin-install-records.js";
import { assertPermissionSwitchTarget, type InstalledPluginEntry, type PermissionSwitchTarget } from "./plugin-installed-view.js";
import type { InstalledRelease, PackageInstallChoices } from "./installed-release.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkLocalHost, MolisWorkLocalHostOptions, MolisWorkProjectRuntime } from "./project-host.js";
import { ensureProjectPlugins, runningProjectPlatform, type ProjectPluginState } from "./project-plugins.js";
import { hostDependencyCheck } from "./plugin-actions-client.js";
import type { HomePluginHost } from "./home-plugins.js";
import type { ProjectPackageControl } from "./plugin-install-service.js";
import type { SurfaceInstallCatalog } from "./surface-installation.js";
import type { PluginUninstallTarget } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { controlOutcome, type PackageControlOutcome } from "./uninstall-retained.js";
import { isPendingUninstall } from "./installed-plugin-lifecycle.js";
import { runningPluginTextIn } from "./running-plugin-text.js";

/**
 * What the project's plugin ports are read from. `agents` is read when a call needs it, not when the Host is built: the
 * Agent service is attached to the Host afterwards.
 */
export interface ProjectPluginHost {
  readonly host: LocalHost<MolisWorkProjectRuntime>;
  readonly options: MolisWorkLocalHostOptions;
  agents(): AgentHostComposition | undefined;
  ownerClosing?(): boolean;
  /** The Home's plugin host, which runs a package that asks for the Home (BL-628); none when the Host has no Home. */
  homePlugins(): HomePluginHost | undefined;
}

export async function readyAgentHost(source: Pick<ProjectPluginHost, "agents">) {
  const service = source.agents();
  await service?.ready;
  return service?.agentHost;
}

/** Reuse the complete production composition, without restoring external MCP or executing an Agent. */
export async function withPreparedProject<Result>(source: ProjectPluginHost, reference: LocalHostProjectReference,
  operation: (runtime: MolisWorkProjectRuntime) => Result | Promise<Result>, activatePlugins = false): Promise<Result> {
  if (inLanguagePreview()) {
    const result = await source.host.withExistingRuntime(reference, async runtime => {
      if (!await runningProjectPlatform(runtime.store, runtime.project_id)
        || source.options.homeDirectory && !await runningInstalledPlugins(runtime.store, runtime.project_id)) throw languagePreviewUnavailable();
      return { value: await operation(runtime) };
    });
    if (!result) throw languagePreviewUnavailable();
    return result.value;
  }
  const opened = activatePlugins ? await ensureProjectPluginActions(source, reference) : undefined;
  return source.host.withRuntime(reference, async runtime => { await prepareInstalledPlugins(source, reference, runtime, opened); return operation(runtime); });
}

/** The plugins installed in this project (generated, installed from the market): their actions join the project's directory. */
export async function prepareInstalledPlugins(source: ProjectPluginHost, reference: LocalHostProjectReference, runtime: MolisWorkProjectRuntime,
  /** The project's platform this request already opened; it is opened once per request, never again here. */
  opened?: ProjectPluginState): Promise<void> {
  if (!source.options.homeDirectory) return;
  // The installed plugins run on the project's platform (47-1 B): one that did not start runs none of them, and its page says why.
  // Preparing reads never starts the project's plugins: only a caller that activates them (or a platform already running) brings them in,
  // so a page's several prepared reads do not each re-read the project's plugin list either.
  const ready = opened ? !!opened.platform : !!await runningProjectPlatform(runtime.store, runtime.project_id);
  if (!ready) return;
  await (await installedPluginsOf(source, reference, runtime, true)).refreshPublicActions();
}

/** Prepare the actual providers for the action entrance; a preview reads the prepared directory and cannot reconcile it. */
export async function prepareProjectActionDirectory(source: ProjectPluginHost, reference: LocalHostProjectReference, signal?: AbortSignal): Promise<void> {
  const opened = await ensureProjectPluginActions(source, reference);
  signal?.throwIfAborted();
  if (inLanguagePreview()) return;
  await source.agents()?.restoreExternalMcp(reference);
  signal?.throwIfAborted();
  await source.host.withRuntime(reference, runtime => prepareInstalledPlugins(source, reference, runtime, opened));
  signal?.throwIfAborted();
}

async function installedPluginsOf(source: ProjectPluginHost, reference: LocalHostProjectReference, runtime: MolisWorkProjectRuntime, platformOpen = false) {
  const { host, options } = source;
  // The installed plugins run on the project's one platform (47-1 B): open it with the Runtime's own stores first, unless this request already did.
  if (!platformOpen) await ensureProjectPlugins(projectPluginPorts(source, reference, runtime));
  return ensureInstalledPlugins({ store: runtime.store, projectId: runtime.project_id, homeDirectory: options.homeDirectory!, actorId: LOCAL_PERSON_ACTOR_ID,
    routePrefix: options.projectRoutePrefix?.(reference.project_id) ?? `/projects/${encodeURIComponent(reference.project_id)}`,
    dependencyCheck: hostDependencyCheck(host.client(reference)),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, scenes: host.sceneClient(reference), project_id: reference.project_id,
      // This internal directory is already in a prepared Host; recursing through the public entry would wait on itself.
      inspect: caller => host.inspectActions(caller, reference) } });
}

const projectScopeOpen = (source: ProjectPluginHost, projectId: string) => !source.ownerClosing?.() && source.host.lifecycle() === "running"
  && source.host.projects().some(row => row.project_id === projectId && row.state !== "closing");

/** Installs a release read from a signed package in the project the person is in; the project's installed plugins are the ones that run it. */
export async function installPackageInProject(source: ProjectPluginHost, projectId: string, release: InstalledRelease, assertCurrent?: () => void, complete?: () => void, choices?: PackageInstallChoices): Promise<void> {
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference || !source.options.homeDirectory) throw new ActionError("actions.scope_mismatch", "安装需要一个打开的项目");
  await source.host.withRuntime(reference, async runtime => {
    const installed = await installedPluginsOf(source, reference, runtime);
    assertCurrent?.();
    const scopeOpen = () => projectScopeOpen(source, projectId);
    await installed.installPackage(release, { consent: true, assertCurrent, scopeOpen, complete, ...choices });
  });
}

/**
 * Switches one signed-package installation of the project off or on, or takes it off (BL-623). Only an installation that came from a signed package
 * is reached here; the package is read back without asking whether its publisher is still trusted, so a publisher taken back does not stop the
 * person from taking its plugin off. Answers the state the installation is in afterwards.
 */
export async function controlPackageInProject(source: ProjectPluginHost, projectId: string, input: ProjectPackageControl): Promise<PackageControlOutcome> {
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference || !source.options.homeDirectory) throw new ActionError("actions.scope_mismatch", "需要一个打开的项目");
  return await source.host.withRuntime(reference, async runtime => {
    const installed = await installedPluginsOf(source, reference, runtime), { plugin_id: pluginId, action } = input;
    const read = () => installed.records().find(item => item.plugin_id === pluginId);
    if (action === "enable") {
      const { caller, expected_installation: expected } = input;
      const current = () => {
        caller.signal?.throwIfAborted();
        requireSynchronous(caller.assert_authority_current?.());
        if (!projectScopeOpen(source, projectId)) throw new ActionError("actions.host_closed", "项目运行环境已关闭");
        const record = read();
        if (expected.scope !== "project" || !record || record.publisher_trust !== "pinned" || record.install_id !== expected.install_id
          || record.installation_generation !== expected.installation_generation || record.version !== expected.version
          || record.manifest_digest !== expected.manifest_digest)
          throw new ActionError("actions.provider_replaced", "原项目插件安装已变化，请重新查看");
        return record;
      };
      await caller.beforeEffect();
      const installation = current(), release = installed.packageOf(pluginId);
      if (!release) throw pluginErrors.state_invalid("这个项目里没有从签名的包装进来的这个插件");
      await installed.lifecycle(action, release, { enable: { installation, beforeEffect: caller.beforeEffect, assertCurrent: current } });
      await caller.beforeEffect();
      if (current().state !== "running") throw new ActionError("actions.provider_replaced", "原插件已退出运行，请重新查看");
      return controlOutcome("running");
    }
    // Taken off from its trusted row alone (BL-915): its package, gone or altered as it may be, is not read.
    if (action === "uninstall") {
      const retained = await installed.uninstall(pluginId, { keepData: input.keep_data, ...input.target ? { target: input.target } : {}, ...input.assertCurrent ? { assertCurrent: input.assertCurrent } : {} });
      await installed.refreshPublicActions();
      return controlOutcome(read()?.state ?? "uninstalled", retained);
    }
    const release = installed.packageOf(pluginId);
    if (!release) throw pluginErrors.state_invalid("这个项目里没有从签名的包装进来的这个插件");
    await installed.lifecycle(action, release, {});
    await installed.refreshPublicActions();
    return controlOutcome(read()?.state ?? "uninstalled");
  });
}

/** Restore the current release in the scope named by the protected action context. */
export async function repairInstalledPackage(source: ProjectPluginHost, input: InstalledPackageRepair, caller: ActionExecutionContext) {
  const check = () => {
    caller.signal?.throwIfAborted();
    requireSynchronous(caller.assert_authority_current?.());
  };
  if (input.expected_installation.scope === "home") {
    const home = source.homePlugins();
    if (!home) throw new ActionError("actions.scope_mismatch", "这个宿主没有个人空间");
    const repaired = await home.repairPackage(input, caller);
    if (home.dualInstance(input.plugin_id)) await reconcileOpenDualProjectHalves(source, input.plugin_id, "enable");
    return repaired;
  }
  const reference = source.host.projects().find(row => row.project_id === caller.project_id);
  if (!reference || !source.options.homeDirectory) throw new ActionError("actions.scope_mismatch", "需要一个打开的项目");
  return source.host.withRuntime(reference, async runtime => {
    const installed = await installedPluginsOf(source, reference, runtime);
    await caller.beforeEffect();
    return installed.recovery.repair(input, () => {
      check();
      if (!projectScopeOpen(source, reference.project_id)) throw new ActionError("actions.host_closed", "项目运行环境已关闭");
    });
  });
}

/** The names of the keys saved for a package where it is installed (a project, or the Home: null); never a value. */
export async function savedPackageSecrets(source: ProjectPluginHost, projectId: string | null, pluginId: string): Promise<readonly string[]> {
  if (projectId === null) return await source.homePlugins()?.savedSecrets(pluginId) ?? [];
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference || !source.options.homeDirectory) return [];
  return await source.host.withRuntime(reference, async runtime => (await installedPluginsOf(source, reference, runtime)).secrets.list(pluginId).map(item => item.name));
}

/** Installs a release read from a signed package in the Home: the Home's plugin host runs it, in the sandbox, for every project. */
export async function installPackageInHome(source: ProjectPluginHost, release: InstalledRelease, assertCurrent?: () => void, complete?: () => void, choices?: PackageInstallChoices): Promise<void> {
  const home = source.homePlugins();
  if (!home) throw new ActionError("actions.scope_mismatch", "这个 Host 没有 Home，不能把插件装进 Home");
  await home.installPackage(release, assertCurrent, complete, choices);
}

/** A catalog only sees an open scope; this never starts its Runtime or asks what a caller may invoke. */
export async function installationPresentationCatalog(source: ProjectPluginHost, projectId: string | null): Promise<SurfaceInstallCatalog> {
  const home = source.homePlugins();
  if (projectId === null && home) return home.installationScope.catalog();
  const reference = source.host.projects().find(row => row.project_id === projectId);
  const catalog = reference && await source.host.withExistingRuntime(reference, runtime => ({
    projectId: runtime.project_id, home: source.options.homeDirectory, db: runtime.store.db, registry: source.host.actionRegistry(reference),
  }));
  if (!catalog) throw pluginErrors.declaration_invalid("呈现声明的安装范围不可读");
  return catalog;
}

/** The installation facts and live display words behind an already prepared action directory. */
export function projectActionInstallationsIn({ store, project_id }: MolisWorkProjectRuntime, localHost: MolisWorkLocalHost) {
  const records = pluginInstallRecords(store.db);
  return {
    get: records.get, list: records.list,
    manifest: (id: string) => installedPluginManifest(store.db, id)?.manifest,
    text: runningPluginTextIn({ store, localHost, projectId: project_id }),
  };
}

/** The plugins installed in a project, each with the Manifest it was installed with; the project's built-in plugins are started first so they are listed too. */
export async function installedPluginsInProject(source: ProjectPluginHost, projectId: string): Promise<InstalledPluginEntry[]> {
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference) throw new ActionError("actions.scope_mismatch", "需要一个打开的项目");
  await ensureProjectPluginActions(source, reference);
  const entries = await source.host.withRuntime(reference, async runtime => {
    const installed = source.options.homeDirectory ? await installedPluginsOf(source, reference, runtime, true) : undefined;
    // A publisher the person took back since this project last looked: its installations are stopped before they are listed.
    await installed?.reconcilePublishers();
    // Why a package of this project is not running, when its plugin host knows; a plugin of the Host's build has none here.
    // An uninstall whose clean-up did not finish stays listed, stopped, so the person can retry it with the same choice (BL-915).
    const pending = (installed?.pendingUninstalls() ?? []).map(record => ({ record, manifest: undefined }));
    return [...installedPluginEntries(runtime.store.db), ...pending].map(entry => ({ ...entry, recoveryCode: installed?.recoveryErrors.code(entry.record.plugin_id) }));
  });
  // The Home's own packages of that publisher stop the same way.
  await source.homePlugins()?.reconcilePublishers();
  return entries;
}

/**
 * Switches one optional permission through the platform that owns this project's installation: its built-in plugins or its installed
 * packages. Only that Runtime stops the activation, saves its grants and starts it again.
 */
export async function regrantPluginInProject(source: ProjectPluginHost, projectId: string, installId: string, permission: string, granted: boolean, expected?: PermissionSwitchTarget): Promise<void> {
  const reference = source.host.projects().find(row => row.project_id === projectId);
  if (!reference) throw new ActionError("actions.scope_mismatch", "需要一个打开的项目");
  await ensureProjectPluginActions(source, reference);
  await source.host.withRuntime(reference, async runtime => {
    const platform = await runningProjectPlatform(runtime.store, runtime.project_id);
    const record = platform?.runtime.list().find(row => row.install_id === installId);
    if (platform && record && platform.supervisor.state(record.plugin_id)?.install_id === installId) {
      assertPermissionSwitchTarget(record, expected);
      if (platform.dualInstance(record.plugin_id)) throw pluginErrors.grant_denied("请在个人空间里管理这个插件的可选权限");
      await platform.runtime.regrant(installId, permission, granted);
      return;
    }
    if (source.options.homeDirectory) {
      const installed = await installedPluginsOf(source, reference, runtime, true);
      const owned = installed.records().find(row => row.install_id === installId);
      if (owned && installed.releaseFor(owned.plugin_id)) {
        assertPermissionSwitchTarget(owned, expected);
        // A signed dual-instance package's project half cannot exceed its Home half's optional permission upper bound (PEQ-06, S-48).
        if (granted && installed.platform.dualInstance(owned.plugin_id)) {
          const home = source.homePlugins();
          if (!home) throw pluginErrors.grant_denied("个人空间插件权限当前不可用");
          home.capturePermission(owned, permission);
        }
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
  return observedHomePlugins(homePlugins);
}

export function observedHomePlugins(homePlugins: HomePluginHost): InstalledPluginEntry[] {
  return homePlugins.installations().filter(record => record.state !== "uninstalled" || isPendingUninstall(record))
    .map(record => ({ record, manifest: homePlugins.manifest(record.plugin_id), recoveryCode: homePlugins.packageError(record.plugin_id, "code") }));
}

async function reconcileOpenDualProjectHalves(source: ProjectPluginHost | undefined, pluginId: string, action: "regrant" | "disable" | "enable" | "uninstall", permission?: string): Promise<void> {
  if (!source?.options.homeDirectory) return;
  for (const project of source.host.projects()) {
    await source.host.withExistingRuntime(project, async runtime => {
      const installed = currentInstalledPluginHost(runtime.store, runtime.project_id);
      if (installed) await installed.reconcileDualHalf(pluginId, action, permission);
    }).catch(() => undefined);
  }
}

/**
 * Switches a package installed in the Home off or on, or takes it off (BL-715), for the Host settings door: only an installation that came from
 * a signed package (a plugin of the Host's build or a fixture is not reached here). Answers the state it is in afterwards.
 */
export async function controlHomePackage(homePlugins: HomePluginHost | undefined, pluginId: string, action: "disable" | "enable" | "uninstall",
  input: { keep_data: boolean; target?: PluginUninstallTarget; assertCurrent?: () => void }, caller?: Partial<Pick<ActionExecutionContext, "beforeEffect" | "assert_authority_current" | "signal">>, source?: ProjectPluginHost): Promise<PackageControlOutcome> {
  if (!homePlugins) throw pluginErrors.state_invalid("这个宿主没有个人空间");
  await homePlugins.ready();
  // An uninstall finds and checks its row itself, a finished one named again included (BL-915).
  if (action !== "uninstall" && !homePlugins.hasPackage(pluginId)) throw pluginErrors.state_invalid("个人空间里没有从签名的包装进来的这个插件");
  const wasDual = homePlugins.dualInstance(pluginId);
  const retained = await homePlugins.packageAction(pluginId, action, action === "uninstall" ? { keepData: input.keep_data, ...input.target ? { target: input.target } : {}, ...input.assertCurrent ? { assertCurrent: input.assertCurrent } : {} } : {}, caller);
  if (wasDual || homePlugins.dualInstance(pluginId)) await reconcileOpenDualProjectHalves(source, pluginId, action);
  return controlOutcome(homePlugins.installation(pluginId)?.state ?? "uninstalled", retained);
}

/** Switches one optional permission of a Home instance: the Home platform's supervisor runs it, so the Home platform stops it and starts it again. */
export async function regrantHomePlugin(homePlugins: HomePluginHost | undefined, installId: string, permission: string, granted: boolean, expected?: PermissionSwitchTarget, source?: ProjectPluginHost): Promise<void> {
  const platform = await homePlugins?.ready();
  const record = platform?.runtime.list().find(row => row.install_id === installId && row.state !== "uninstalled");
  if (!platform || !record || !homePlugins?.manifest(record.plugin_id)) {
    throw pluginErrors.grant_denied("这个插件没有可以开关的可选权限");
  }
  assertPermissionSwitchTarget(record, expected);
  await platform.runtime.regrant(installId, permission, granted);
  if (!granted && homePlugins.dualInstance(record.plugin_id)) {
    await reconcileOpenDualProjectHalves(source, record.plugin_id, "regrant", permission);
  }
}

/** The project's built-in Runtime plugins (Coding, Files, Git, ...): started once per project, their actions registered. */
export function ensureProjectPluginActions(source: ProjectPluginHost, reference: LocalHostProjectReference): Promise<ProjectPluginState> {
  return source.host.withRuntime(reference, runtime => ensureProjectPlugins(projectPluginPorts(source, reference, runtime)));
}

/** The ports the project's plugin platform opens with: the Runtime's stores, its action directory and the Agent observers. */
function projectPluginPorts(source: ProjectPluginHost, reference: LocalHostProjectReference, runtime: MolisWorkProjectRuntime): Parameters<typeof ensureProjectPlugins>[0] {
  const { host, options } = source;
  const agents = () => source.agents();
  return {
    store: runtime.store, artifacts: runtime.artifacts, processItems: runtime.processItems, projectId: runtime.project_id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: options.homeDirectory,
    dependencyCheck: hostDependencyCheck(host.client(reference)),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, scenes: host.sceneClient(reference), project_id: reference.project_id },
    ...(agents() ? { observeReviewSettlements: listener => observeReviewSettlements(agents()!.agentHost.reviews, runtime.project_id, listener,
      agentWritePlaces(source, runtime.project_id)), observeContinuations: listener => agentContinuationStarts(agents()!.agentHost).observeProject(runtime.project_id, listener) } : {}),
  };
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
