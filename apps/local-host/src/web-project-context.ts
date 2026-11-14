import { readOnlyAlwaysOnProjectPlugins } from "./always-on-plugins.js";
import { requireSynchronous, type ActionCallContext, type ActionReference, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { PAGE_PLUGINS_WITHOUT_SELECTION } from "@molis-ai/molis-work-app-workbench";
import type { GoalsWebView } from "./web-view.js";
import { builtinPluginByManifestId, shownProjectPlugins } from "./plugin-registry.js";
import { observeReviewSettlements } from "./review-settlement-events.js";
import { bindLocalWebActions, localWebActionContext, type LocalWebEntry } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { bindGoalsWebActions } from "./goal-callers.js";
import { molisWorkHostProjectReference, type MolisWorkProjectRuntime } from "./project-host.js";
import { projectPluginEpoch } from "./project-catalog.js";
import type { ProjectPluginSurfacePorts } from "./project-plugin-stages.js";
import type { ContextualHttpPorts } from "./contextual/contextual-http.js";
import type { ResolvedWebBoardOptions } from "./web-types.js";
import type { WebRequestContext } from "./web-route-table.js";
import type { HomeRouteProjectPlugins } from "./home-plugin-http.js";
import { hostDependencyCheck } from "./plugin-actions-client.js";
import { pluginReachable, projectReachablePlugins, reachEntry } from "./project-action-availability.js";
import { homePluginsOutsideBuild } from "./home-registration.js";
import { matchingActions } from "./local-host-types.js";
import type { ReadArtifactDisplay } from "./artifact-display-words.js";

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
  /** The rendered selector keeps the revision of the same membership it displays. */
  readonly shownPluginSelection: (projectId: string, withRevision: boolean) => Promise<{ shown: string[]; revision?: string }>;
  /**
   * Whether Goals is in this project, by its plugin list (RAC-400). Pages ask this, not a refusal's code: in a project with Goals, a Goals read
   * the policy refuses (any code) is that refusal, shown; only a project without Goals reads as one with none.
   */
  readonly goalsHere: () => Promise<boolean>;
}

/** The same request inside the project's open runtime: the stores, and the ports the project's surfaces are given. */
export interface ProjectRuntimeContext extends ProjectRequestContext {
  readonly store: MolisWorkProjectRuntime["store"];
  /** Home shows and runs what any plugin offers the person here: native plugins by their manifests, Runtime plugins by their installed grants. */
  readonly homeActions: ReturnType<typeof bindLocalWebActions>;
  readonly goalActions: ReturnType<typeof bindGoalsWebActions>;
  readonly pluginServices: ProjectPluginServices;
  readonly pluginPorts: ProjectPluginSurfacePorts;
  readonly readWebView: () => Promise<GoalsWebView>;
  readonly readArtifactDisplay: ReadArtifactDisplay;
}

/** The services every project plugin surface is given: the unified action client, the Home, its plugins and settled reviews. */
type ProjectPluginServices = Pick<ProjectPluginSurfacePorts, "dependencyCheck" | "actions" | "homeDirectory" | "homePlugins" | "observeReviewSettlements">;

export function projectRequestContext(context: WebRequestContext, options: ResolvedWebBoardOptions): ProjectRequestContext {
  const { localHost, composition, serverOptions } = context;
  const homeDirectory = serverOptions.homeDirectory;
  const directory = homeDirectory ? () => readOnlyAlwaysOnProjectPlugins(homeDirectory) : undefined;
  const hostReference = molisWorkHostProjectReference({ databasePath: options.databasePath, projectId: options.projectId });
  const userActions = (permissions: readonly string[], entry: LocalWebEntry = {}) => bindLocalWebActions(localHost, hostReference, permissions, entry);
  const selection = async (projectId: string, versioned: boolean): Promise<{ shown: string[]; revision?: string }> => {
    const home = localHost.homePlugins;
    try { await home?.ready(); } catch { /* A failed Home retains its registered unavailable stages. */ }
    const withExternal = (plugins: readonly string[], hidden: readonly string[]) => {
      const external = (home?.registered() ?? []).filter(entry => !builtinPluginByManifestId(entry.manifest.plugin_id)
        && !hidden.includes(entry.key)).map(entry => entry.key);
      return [...new Set([...shownProjectPlugins(plugins, hidden), ...external])];
    };
    // An explicitly served single-database fixture has the same declared default selection as its page, without a Catalog record.
    if (!options.project) return { shown: withExternal(PAGE_PLUGINS_WITHOUT_SELECTION, []) };
    // A versioned read needs the revision of exactly the membership it shows, so it reads on its own; the others share one reading (N44).
    if (versioned) return composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => {
      const { plugins, hidden, revision } = catalog.projectPluginMembershipWithRevision(projectId, directory);
      return { shown: withExternal(plugins, hidden), revision };
    });
    const { plugins, hidden } = await observeProjectPluginMembership(composition, homeDirectory, projectId, directory);
    return { shown: withExternal(plugins, hidden) };
  };
  const goalsHere = async () => !options.project
    || (await observeProjectPluginMembership(composition, homeDirectory, options.projectId, directory)).plugins.includes("goals");
  return { ...context, options, hostReference, userActions, goalsHere,
    shownPlugins: async projectId => (await selection(projectId, false)).shown,
    shownPluginSelection: selection,
  };
}

/** Presentation reads still waiting for the catalog, per running catalog owner and project: one membership reading serves all of them. */
const queuedMembership = new WeakMap<object, Map<string, Promise<ProjectPluginMembership>>>();

/** A successful membership write bumps the Catalog's epoch; a display read inside the same epoch reuses the membership (N44). */
const membershipCache = new WeakMap<object, Map<string, { epoch: number; at: number; membership: ProjectPluginMembership }>>();
const MEMBERSHIP_CACHE_MS = 1_000;

/**
 * The project's plugin membership for a page: the Goals branch and the shown list (N44). Reads that queue before one starts share it; the
 * entry is dropped as that read begins, so a later request reads afresh and nothing finished is kept. Execution and routes read on their own.
 */
function observeProjectPluginMembership(composition: WebRequestContext["composition"], home: string | undefined, projectId: string,
  directory: (() => readonly string[]) | undefined): Promise<ProjectPluginMembership> {
  let queued = queuedMembership.get(composition);
  if (!queued) queuedMembership.set(composition, queued = new Map());
  const key = JSON.stringify([home ?? null, projectId]);
  const waiting = queued.get(key);
  if (waiting) return waiting;
  let started = false, pending: Promise<ProjectPluginMembership> | undefined;
  const drop = () => { if (pending && queued.get(key) === pending) queued.delete(key); };
  pending = composition.withCatalog({ homeDirectory: home }, catalog => {
    started = true; drop();
    let cache = membershipCache.get(catalog);
    if (!cache) membershipCache.set(catalog, cache = new Map());
    const cached = cache.get(key);
    if (cached && cached.epoch === projectPluginEpoch(catalog) && Date.now() - cached.at < MEMBERSHIP_CACHE_MS) return cached.membership;
    const membership = catalog.projectPluginMembership(projectId, directory);
    cache.set(key, { epoch: projectPluginEpoch(catalog), at: Date.now(), membership });
    while (cache.size > 64) cache.delete(cache.keys().next().value!);
    return membership;
  }).finally(() => drop());
  if (!started) queued.set(key, pending);
  return pending;
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
    // These ports are used while the project Runtime starts. Re-entering its public preparation would wait on that same start.
    actions: { registry: localHost.actionRegistry(hostReference), client: { ...localHost.actionClient(hostReference, false), ...localHost.syncActionClient(hostReference) }, scenes: localHost.sceneClient(hostReference), project_id: hostReference.project_id, inspect: caller => localHost.inspectActions(caller, hostReference) },
    observeReviewSettlements: listener => observeReviewSettlements(agentHost.reviews, options.projectId, listener),
    homeDirectory: serverOptions.homeDirectory,
    homePlugins: localHost.homePlugins,
    dependencyCheck: hostDependencyCheck(localHost.client(hostReference)),
  };
}

/** The context row's ports for one project: the local person's own authority there, and H3's owner check for 「放进左边」. */
export function contextualPorts({ localHost, hostReference, serverOptions, request }: ProjectRequestContext): ContextualHttpPorts {
  const homeDirectory = serverOptions.homeDirectory;
  const page = pluginPageRequest(request);
  // One request's prepared authority, shared by the discovery and the calls its route makes (N42). It never outlives the request;
  // each call still re-checks the person's grants. A call brings its own signal when the page stops waiting for it, and gets the
  // context prepared with that signal, so the cancellation reaches the call rather than being dropped by the sharing.
  const contexts = new Map<AbortSignal | null, Promise<ActionCallContext>>();
  const context = (signal?: AbortSignal) => {
    const key = signal ?? null;
    let pending = contexts.get(key);
    if (!pending) {
      pending = localWebActionContext(localHost, hostReference, LOCAL_OWNER_PERMISSIONS,
        signal && page ? AbortSignal.any([signal, page.signal]) : signal ?? page?.signal).then(caller => ({ ...caller,
        validate_authority: async (reference: ActionReference) => {
          page?.assertCurrent(); await caller.validate_authority?.(reference); page?.assertCurrent();
        }, assert_authority_current: (reference?: ActionReference, permissions?: readonly string[]) => {
          page?.assertCurrent(); requireSynchronous(caller.assert_authority_current?.(reference, permissions));
        } }));
      contexts.set(key, pending);
      pending.catch(() => { if (contexts.get(key) === pending) contexts.delete(key); });
    }
    return pending;
  };
  return {
    ...(homeDirectory ? { homeDirectory } : {}), scope: hostReference.project_id, actor_id: LOCAL_PERSON_ACTOR_ID,
    actions: () => {
      const client = localHost.actionClient(hostReference);
      return { discover: async select => select ? matchingActions(client, await context(), select) : client.discover(await context()),
        invoke: async (reference, input, signal) => client.invoke(await context(signal), reference, input) };
    },
    confirmReferences: async (picked, kinds) => localHost.search ? localHost.search.confirmReferences(hostReference.project_id, picked, kinds) : picked.map(() => false),
  };
}
