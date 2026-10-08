import { ActionError, type ActionCallContext, type ActionClient, type ActionHandlerBinding, type ActionProvider, type ActionRegistryPort, type FragmentOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SEARCH_PROVIDER_ID, prepareSearchFragmentOffers, searchActions, type SearchOpenRequest, type SearchQueryRequest, type SearchRebuildRequest, type SearchScope } from "@molis-ai/molis-work-contracts/services/search";
import { SearchService, type SearchAccess } from "@molis-ai/molis-work-service-search";
import { openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";

/**
 * Host wiring for the system search (specs/archive/system-search §6): the index lives in this Home, indexing reads with the local
 * person's own access, and every caller reaches search through the shared directory with its own authority.
 * Search itself is in horizontal/search; nothing about any plugin is known here.
 */
export interface SearchHostPorts {
  homeDirectory: string;
  registry: ActionRegistryPort;
  /** The open project behind a caller, or undefined when it is not open (or the caller has none). */
  project(projectId: string): LocalHostProjectReference | undefined;
  projectClient(reference: LocalHostProjectReference): ActionClient;
  homeClient(): ActionClient;
  /** The local person's trusted context over one scope, as the Web uses it. */
  ownerContext(reference: LocalHostProjectReference | undefined): Promise<ActionCallContext>;
  /** Project ids still in this Home's catalog; null until the catalog is configured. */
  knownProjects(): Promise<readonly string[] | null>;
  /** Open the personal space when it exists (never creates it), so the person finds its content from any project. */
  openPersonalSpace?(): Promise<LocalHostProjectReference | undefined>;
  onError?(error: unknown, where: string): void;
}

export interface SearchHost {
  readonly service: SearchService;
  /** A command of this provider succeeded (from any entry). */
  changed(providerId: string, projectId: string | null): void;
  /** A provider was registered or withdrawn: install, enable, upgrade, disable, uninstall. */
  providerChanged(provider: Pick<ActionProvider, "provider_id" | "project_id">): void;
  projectDeleted(projectId: string): void;
  close(): Promise<void>;
}

export function createSearchHost(ports: SearchHostPorts): SearchHost {
  const index = openTextSearchIndex({ homeDirectory: ports.homeDirectory });
  const clientFor = (caller: ActionCallContext): ActionClient => {
    if (!caller.project_id) return ports.homeClient();
    const reference = ports.project(caller.project_id);
    if (!reference) throw new ActionError("actions.scope_mismatch", "搜索缺少当前项目运行环境");
    return ports.projectClient(reference);
  };
  const service = new SearchService({
    index,
    indexer: async projectId => {
      if (!projectId) return { client: ports.homeClient(), caller: await ports.ownerContext(undefined) };
      const reference = ports.project(projectId) ?? (projectId === PERSONAL_SPACE_PROJECT_ID ? await ports.openPersonalSpace?.() : undefined);
      if (!reference) throw new ActionError("search.project_closed", "项目未打开，稍后在该项目里搜索时再更新");
      return { client: ports.projectClient(reference), caller: await ports.ownerContext(reference) };
    },
    knownProjects: () => ports.knownProjects(),
    personalSpace: PERSONAL_SPACE_PROJECT_ID,
    ...(ports.onError ? { onError: ports.onError } : {}),
  });
  const access = (caller: ActionCallContext): SearchAccess => ({ client: clientFor(caller), caller });
  const handlers: ActionHandlerBinding[] = [
    { ...searchActions.fragmentOffers, handle: (_caller, input) => ({ offers: prepareSearchFragmentOffers(input as FragmentOffersInput) }) },
    { ...searchActions.query, handle: (caller, input) => service.query(access(caller), input as SearchQueryRequest) },
    { ...searchActions.open, handle: (caller, input) => service.open(access(caller), input as SearchOpenRequest) },
    { ...searchActions.status, handle: (caller, input) => service.status(access(caller), input as { scope?: SearchScope }) },
    { ...searchActions.rebuild, handle: (caller, input) => service.rebuild(access(caller), input as SearchRebuildRequest) },
  ];
  const dispose = ports.registry.registerProvider({ provider: { provider_id: SEARCH_PROVIDER_ID, title: "搜索", kind: "system" },
    definitions: Object.values(searchActions), handlers });
  let closed = false;
  // A deleted project's entries leave the index with it; the index is derived, so this needs no label in the dialog.
  projectDeletedHooksFor(ports.homeDirectory).register({ id: "search", label: null, alive: () => !closed, clear: projectId => { service.removeProject(projectId); } });
  return {
    service,
    changed: (providerId, projectId) => service.markChanged(providerId, projectId),
    providerChanged: provider => service.markRegistration(provider.provider_id, provider.project_id ?? null),
    projectDeleted: projectId => { service.removeProject(projectId); },
    close: async () => { closed = true; dispose(); await service.close(); index.close(); },
  };
}
