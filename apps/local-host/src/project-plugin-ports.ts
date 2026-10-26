import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { observeReviewSettlements, type AgentWritePlaces } from "./review-settlement-events.js";
import { ensureInstalledPlugins } from "./installed-plugin-host.js";
import type { InstalledRelease } from "./installed-release.js";
import type { HomePluginHost } from "./home-plugins.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkLocalHostOptions, MolisWorkProjectRuntime } from "./project-host.js";
import { ensureProjectPlugins } from "./project-plugins.js";
import { hostDependencyCheck } from "./plugin-actions-client.js";

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
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: reference.project_id,
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

/** Installs a release read from a signed package in the Home: the Home's plugin host runs it, in the sandbox, for every project. */
export async function installPackageInHome(source: ProjectPluginHost, release: InstalledRelease): Promise<void> {
  const home = source.homePlugins();
  if (!home) throw new ActionError("actions.scope_mismatch", "这个 Host 没有 Home，不能把插件装进 Home");
  await home.installPackage(release);
}

/** The project's built-in Runtime plugins (Coding, Files, Git, ...): started once per project, their actions registered. */
export function ensureProjectPluginActions(source: ProjectPluginHost, reference: LocalHostProjectReference): Promise<unknown> {
  const { host, options } = source;
  const agents = () => source.agents();
  return host.withRuntime(reference, runtime => ensureProjectPlugins({
    store: runtime.store, artifacts: runtime.artifacts, processItems: runtime.processItems, projectId: runtime.project_id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: options.homeDirectory,
    dependencyCheck: hostDependencyCheck(host.client(reference)),
    actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: reference.project_id },
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
