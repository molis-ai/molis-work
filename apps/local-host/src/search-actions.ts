import { ActionError, SUBJECT_RETENTION_REQUEST_TYPE, SUBJECT_RETENTION_TYPE, type ActionCallContext, type ActionSubject, type ActionClient, type ActionHandlerBinding, type ActionProvider, type ActionRegistryPort, type ActionView, type FragmentOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SEARCH_PROVIDER_ID, prepareSearchFragmentOffers, searchActions, type SearchOpenRequest, type SearchQueryRequest, type SearchRebuildRequest, type SearchReferencesRequest, type SearchRetentionIdentity, type SearchScope } from "@molis-ai/molis-work-contracts/services/search";
import { SearchService, findReferenceCandidates, readReferences, type SearchAccess } from "@molis-ai/molis-work-service-search";
import { openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { SEARCH_OWNER } from "./project-deleted-owners.js";
import { createKnowledgeHost, type KnowledgeHost } from "./knowledge-actions.js";

/**
 * Host wiring for the system search (specs/archive/system-search §6): the index lives in this Home, indexing reads with the local
 * person's own access, and every caller reaches search through the shared directory with its own authority.
 * Search itself is in horizontal/search; nothing about any plugin is known here. Project knowledge rides on it (knowledge-actions.ts).
 */
interface SearchHostPorts {
  homeDirectory: string;
  registry: ActionRegistryPort;
  /** The open project behind a caller, or undefined when it is not open (or the caller has none). */
  project(projectId: string): LocalHostProjectReference | undefined;
  projectClient(reference: LocalHostProjectReference): ActionClient;
  homeClient(): ActionClient;
  /** The local person's trusted context over one scope, as the Web uses it. */
  ownerContext(reference: LocalHostProjectReference | undefined): Promise<ActionCallContext>;
  inspectActionMetadata?(caller: ActionCallContext, reference: LocalHostProjectReference): readonly Pick<ActionView, "action" | "provider">[];
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
  /**
   * Whether each object a person picked for a reference answer is still one they may use in that project (of an allowed
   * kind, read from its owner with their authority just now), in order. False for a project that is not open.
   */
  confirmReferences(projectId: string, picked: readonly ActionSubject[], kinds?: readonly string[]): Promise<boolean[]>;
  /** The same read, giving each object's label and revision as its owner has it (null where `confirmReferences` says false). */
  readReferences(projectId: string, picked: readonly ActionSubject[], kinds?: readonly string[]): Promise<({ label: string; revision: string } | null)[]>;
  /** How many pieces of project knowledge a caller whose directory is `views` would see listed (specs/project-knowledge PMAT-33). */
  knowledgeTally(projectId: string, views: readonly ActionView[]): ReturnType<KnowledgeHost["tally"]>;
  knowledgeCatalog(projectId: string, views: readonly ActionView[], words: string): ReturnType<KnowledgeHost["catalog"]>;
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
    { ...searchActions.references, handle: (caller, input) => findReferenceCandidates(service, access(caller), input as SearchReferencesRequest) },
    { ...searchActions.open, handle: (caller, input) => service.open(access(caller), input as SearchOpenRequest) },
    { ...searchActions.status, handle: (caller, input) => service.status(access(caller), input as { scope?: SearchScope }) },
    { ...searchActions.rebuild, handle: (caller, input) => service.rebuild(access(caller), input as SearchRebuildRequest) },
  ];
  // Project knowledge reads through this search, so it is registered and withdrawn with it (specs/project-knowledge).
  const ownerContext = async (projectId: string) => {
    const reference = ports.project(projectId);
    if (!reference) throw new ActionError("actions.scope_mismatch", "项目资料缺少当前项目运行环境");
    return ports.ownerContext(reference);
  };
  const knowledge = createKnowledgeHost({ homeDirectory: ports.homeDirectory, search: service, index, clientFor, ownerContext,
    ...(ports.inspectActionMetadata ? { unboundRetention: (caller: ActionCallContext, identity: SearchRetentionIdentity) => {
      try {
        if (!identity.project_id || identity.project_id !== caller.project_id) return "unavailable" as const;
        const reference = ports.project(identity.project_id);
        if (!reference) return "unavailable" as const;
        return ports.inspectActionMetadata!(caller, reference).some(view => view.provider.provider_id === identity.provider_id
          && (view.provider.project_id == null || view.provider.project_id === identity.project_id)
          && view.action.subject_kinds.includes(identity.subject.kind)
          && view.action.input_type === SUBJECT_RETENTION_REQUEST_TYPE && view.action.output_type === SUBJECT_RETENTION_TYPE)
          ? "unavailable" as const : "unsupported" as const;
      } catch { return "unavailable" as const; }
    } } : {}), ...(ports.onError ? { onError: ports.onError } : {}) });
  const disposers = [{ provider: { provider_id: SEARCH_PROVIDER_ID, title: "搜索", kind: "system" as const }, definitions: Object.values(searchActions), handlers },
    knowledge.registration].map(registration => ports.registry.registerProvider(registration));
  let closed = false;
  // A deleted project's entries leave the index with it; the index is derived, so this needs no label in the dialog.
  projectDeletedHooksFor(ports.homeDirectory).register({ ...SEARCH_OWNER, alive: () => !closed, clear: projectId => { service.removeProject(projectId); knowledge.projectDeleted(projectId); } });
  const read = async (projectId: string, picked: readonly ActionSubject[], kinds?: readonly string[]) => {
    const reference = ports.project(projectId);
    if (!reference) return picked.map(() => null);
    return readReferences({ client: ports.projectClient(reference), caller: await ports.ownerContext(reference) }, picked, kinds);
  };
  return {
    service,
    changed: (providerId, projectId) => { service.markChanged(providerId, projectId); knowledge.changed(projectId); },
    providerChanged: provider => service.markRegistration(provider.provider_id, provider.project_id ?? null),
    projectDeleted: projectId => { service.removeProject(projectId); knowledge.projectDeleted(projectId); },
    confirmReferences: async (projectId, picked, kinds) => (await read(projectId, picked, kinds)).map(found => found !== null),
    readReferences: (projectId, picked, kinds) => read(projectId, picked, kinds),
    knowledgeTally: (projectId, views) => knowledge.tally(projectId, views),
    knowledgeCatalog: (projectId, views, words) => knowledge.catalog(projectId, views, words),
    close: async () => { closed = true; for (const dispose of disposers) dispose(); await knowledge.close(); await service.close(); index.close(); },
  };
}
