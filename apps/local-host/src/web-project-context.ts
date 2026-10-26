import { requireSynchronous, type ActionReference, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { shownProjectPlugins } from "./plugin-registry.js";
import { observeReviewSettlements } from "./review-settlement-events.js";
import { bindLocalWebActions, localWebActionContext, type LocalWebEntry } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { bindGoalsWebActions } from "./goals-actions.js";
import { molisWorkHostProjectReference, type MolisWorkProjectRuntime } from "./project-host.js";
import type { projectFeedOptions } from "./workflow-feed-options.js";
import type { ProjectPluginSurfacePorts } from "./project-plugin-stages.js";
import type { ContextualHttpPorts } from "./contextual/contextual-http.js";
import type { ResolvedWebBoardOptions } from "./web-types.js";
import type { WebRequestContext } from "./web-route-table.js";
import type { HomeRouteProjectPlugins } from "./home-plugin-http.js";
import { hostDependencyCheck } from "./plugin-actions-client.js";
import { pluginReachable, projectReachablePlugins, reachEntry } from "./project-action-availability.js";
import { homePluginsOutsideBuild } from "./home-registration.js";

/** A request for one project that exists and has a database, before the project's runtime is opened. */
export interface ProjectRequestContext extends WebRequestContext {
  readonly options: ResolvedWebBoardOptions;
  readonly hostReference: LocalHostProjectReference;
  /**
   * The person's calls for one surface, capped by the permissions it names: a Host-registered provider by what the person holds over
   * it, a Runtime plugin's by its installation's grants alone (PG-008, `bindLocalWebActions`); `entry` is the file an import handed in.
   */
  readonly userActions: (permissions: readonly string[], entry?: LocalWebEntry) => BoundActionClient;
  /** The plugins this project's page shows: personal ones included unless the person hid them here. */
  readonly shownPlugins: (projectId: string) => Promise<string[]>;
  /**
   * Whether Goals is in this project, by its plugin list (RAC-400). Pages ask this, not a refusal's code: in a project with Goals, a Goals read
   * the policy refuses (any code) is that refusal, shown; only a project without Goals reads as one with none.
   */
  readonly goalsHere: () => Promise<boolean>;
}

/** The same request inside the project's open runtime: the stores, and the ports the project's surfaces are given. */
export interface ProjectRuntimeContext extends ProjectRequestContext {
  readonly store: MolisWorkProjectRuntime["store"];
  readonly feedOptions: ReturnType<typeof projectFeedOptions>;
  /** Home shows and runs what any plugin offers the person here: native plugins by their manifests, Runtime plugins by their installed grants. */
  readonly homeActions: ReturnType<typeof bindLocalWebActions>;
  readonly goalActions: ReturnType<typeof bindGoalsWebActions>;
  readonly pluginServices: ProjectPluginServices;
  readonly pluginPorts: ProjectPluginSurfacePorts;
  readonly readWebView: () => Promise<MolisWorkWebView>;
}

/** The services every project plugin surface is given: the unified action client, the Home and settled reviews. */
type ProjectPluginServices = Pick<ProjectPluginSurfacePorts, "dependencyCheck" | "actions" | "homeDirectory" | "observeReviewSettlements">;

export function projectRequestContext(context: WebRequestContext, options: ResolvedWebBoardOptions): ProjectRequestContext {
  const { localHost, composition, serverOptions } = context;
  const hostReference = molisWorkHostProjectReference({ databasePath: options.databasePath, projectId: options.projectId });
  const userActions = (permissions: readonly string[], entry: LocalWebEntry = {}) => bindLocalWebActions(localHost, hostReference, permissions, entry);
  const shownPlugins = (projectId: string) => composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
    catalog => {
      const { plugins, hidden } = catalog.projectPluginMembership(projectId);
      return shownProjectPlugins(plugins, hidden);
    });
  const goalsHere = async () => !options.project || await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
    catalog => catalog.listProjectPlugins(options.projectId).includes("goals"));
  return { ...context, options, hostReference, userActions, shownPlugins, goalsHere };
}

/**
 * What a Home plugin's route under `/projects/<id>/…` checks: whether that project reaches the plugin, by the one judgement actions and
 * routes share (PG-013; a personal Home plugin outside the build by its plugin id, #679), or null when there is no such project.
 */
export function homeRouteProjectPlugins({ composition, serverOptions }: WebRequestContext): HomeRouteProjectPlugins {
  const home = serverOptions.homeDirectory;
  return projectId => composition.withCatalog({ homeDirectory: home }, catalog => {
    let databasePath: string, displayName: string;
    try { const project = catalog.getProject(projectId); databasePath = project.database_path; displayName = project.display_name; } catch { return null; /* No such project: the route refuses, saying so. */ }
    const reachable = projectReachablePlugins(catalog, projectId, homePluginsOutsideBuild(home));
    return { database_path: databasePath, display_name: displayName, reaches: (pluginId: string) => {
      const entry = reachEntry(home, pluginId);
      return entry !== undefined && pluginReachable(entry, reachable);
    } };
  });
}

/** `/projects/<id>` for a project page; empty for the board a fixture serves at the root. */
export const projectRoutePrefix = (options: ResolvedWebBoardOptions) => options.project ? `/projects/${encodeURIComponent(options.project.project_id)}` : "";

export function projectPluginServices({ localHost, hostReference, options, agentHost, serverOptions }: ProjectRequestContext): ProjectPluginServices {
  return {
    actions: { registry: localHost.actionRegistry(hostReference), client: { ...localHost.actionClient(hostReference), ...localHost.syncActionClient(hostReference) }, project_id: hostReference.project_id, inspect: caller => localHost.inspectActions(caller, hostReference) },
    observeReviewSettlements: listener => observeReviewSettlements(agentHost.reviews, options.projectId, listener),
    homeDirectory: serverOptions.homeDirectory,
    dependencyCheck: hostDependencyCheck(localHost.client(hostReference)),
  };
}

/** The context row's ports for one project: the local person's own authority there, and H3's owner check for 「放进左边」. */
export function contextualPorts({ localHost, hostReference, serverOptions, request }: ProjectRequestContext): ContextualHttpPorts {
  const homeDirectory = serverOptions.homeDirectory;
  const page = pluginPageRequest(request);
  const context = async (signal?: AbortSignal) => {
    const caller = await localWebActionContext(localHost, hostReference, LOCAL_OWNER_PERMISSIONS,
      signal && page ? AbortSignal.any([signal, page.signal]) : signal ?? page?.signal);
    return { ...caller, validate_authority: async (reference: ActionReference) => {
      page?.assertCurrent(); await caller.validate_authority?.(reference); page?.assertCurrent();
    }, assert_authority_current: (reference?: ActionReference, permissions?: readonly string[]) => {
      page?.assertCurrent(); requireSynchronous(caller.assert_authority_current?.(reference, permissions));
    } };
  };
  return {
    ...(homeDirectory ? { homeDirectory } : {}), scope: hostReference.project_id, actor_id: LOCAL_PERSON_ACTOR_ID,
    actions: () => {
      const client = localHost.actionClient(hostReference);
      return { discover: async () => client.discover(await context()), invoke: async (reference, input, signal) => client.invoke(await context(signal), reference, input) };
    },
    confirmReferences: async (picked, kinds) => localHost.search ? localHost.search.confirmReferences(hostReference.project_id, picked, kinds) : picked.map(() => false),
  };
}
