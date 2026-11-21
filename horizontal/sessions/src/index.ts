import type {
  ActionSubjectContext,
  SearchEntriesInput,
  SearchEntriesPage,
  SubjectContextRequest,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorUsage, ConnectorUsagesInput } from "@molis-ai/molis-work-contracts/services/connector-host";
import type {
  ExternalSessionAttributionInput,
  ExternalSessionAttributionSuggestInput,
  ExternalSessionAttributionSuggestOutput,
  ExternalSessionDiscoveryRunInput,
  ExternalSessionDiscoveryRunOutput,
  ExternalSessionHistoryAuthorization,
  ExternalSessionHistoryAuthorizeInput,
  ExternalSessionHistoryInput,
  ExternalSessionHistoryOutput,
  ExternalSessionListInput,
  ExternalSessionListOutput,
  ExternalSessionProjectAiRead,
  ExternalSessionProjectAiReadSetInput,
  ExternalSessionRow,
  ExternalSessionScopeReadInput,
  ExternalSessionScopeSetInput,
  ExternalSessionScopeView,
  ExternalSessionToolSearchInput,
  ExternalSessionToolSearchOutput,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { DiscoveryCoordinator } from "./discovery.js";
import type { SessionsPorts } from "./ports.js";
import { assertPersonalCaller, type SessionsCaller } from "./runtime-view.js";
import {
  runAttributionSet,
  runConnectorUsages,
  runDiscovery,
  runProjectAiReadSet,
  runScopeRead,
  runScopeSet,
} from "./scope-commands.js";
import {
  runHistoryAuthorize,
  runHistoryRead,
  runSearchEntries,
  runSessionList,
  runSubjectRead,
  runToolSearch,
} from "./session-queries.js";
import { SessionsStore } from "./store.js";
import { runAttributionSuggest } from "./suggest.js";

export {
  EXTERNAL_SESSIONS_BASELINE,
  EXTERNAL_SESSIONS_HOME_STORE,
  EXTERNAL_SESSIONS_STORE,
  clearExternalSessionsProjectFile,
  clearExternalSessionsProjectRows,
  sessionsProjectData,
} from "./schema.js";
export { identifySessionDirectory, identifySessionDirectoryAsync, type IdentifySessionDirectoryOptions, type SessionDirectoryIdentity } from "./git-files.js";
export {
  readSessionSourceFailure,
  sessionSourceFailure,
  sourceStatusFromFailure,
  type CodexThreadListResponse,
  type CodexThreadReadResponse,
  type ExternalSessionSourceAdapter,
  type SessionAttributionSuggester,
  type SessionCommandResult,
  type SessionDirectoryEntry,
  type SessionPortFailureKind,
  type SessionProjectSnapshot,
  type SessionServiceRequest,
  type SessionServiceResponse,
  type SessionSourceFailureInfo,
  type SessionSuggestDraft,
  type SessionSuggestDraftItem,
  type SessionSuggestGroupMaterial,
  type SessionSuggestInput,
  type SessionSuggestProjectMaterial,
  type SessionsPorts,
} from "./ports.js";
export type { SessionsCaller } from "./runtime-view.js";

export interface SessionsListReadiness {
  readonly ready: boolean;
  readonly has_allowed_source: boolean;
  readonly project_ai_read_allowed: boolean;
  readonly next_step: "open_scope" | "open_project_ai_read" | null;
}

/**
 * Evaluates the two-step scene/list readiness contract (`contract-design` §6.5) from `sessions.scope.read@1` (`include_counts: false`).
 * Step 1: at least one available adapter source is allowed (`open_scope`).
 * Step 2: the current project's AI read permit is allowed (`open_project_ai_read`).
 */
export function evaluateSessionsListReadiness(scope: ExternalSessionScopeView): SessionsListReadiness {
  const hasAllowedSource = scope.sources.some((source) => source.allowed && source.adapter === "available");
  const projectAiReadAllowed = scope.project_ai_reads.find((row) => row.current)?.allowed === true;
  if (!hasAllowedSource) {
    return { ready: false, has_allowed_source: false, project_ai_read_allowed: projectAiReadAllowed, next_step: "open_scope" };
  }
  if (!projectAiReadAllowed) {
    return { ready: false, has_allowed_source: true, project_ai_read_allowed: false, next_step: "open_project_ai_read" };
  }
  return { ready: true, has_allowed_source: true, project_ai_read_allowed: true, next_step: null };
}

export class SessionsService {
  private readonly store: SessionsStore;
  private readonly discovery: DiscoveryCoordinator;
  private closed = false;

  constructor(
    homeDirectory: string,
    private readonly ports: SessionsPorts,
  ) {
    this.store = new SessionsStore(homeDirectory);
    this.discovery = new DiscoveryCoordinator(this.store, ports);
    this.discovery.resumeInterrupted();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.discovery.cancelAll();
    this.store.close();
  }

  waitForDiscoveryIdle(): Promise<void> {
    return this.discovery.waitForIdle();
  }

  /**
   * Notifies the service that workspace directory memberships, bindings, or projects changed (`contract-design` §7.3).
   */
  directoriesChanged(): void {
    if (this.closed) return;
    this.discovery.cancelLinkedProjectsJobs();
    this.ports.searchChanged();
  }

  purgeProject(projectId: string): void {
    if (this.closed) return;
    this.store.purgeProject(projectId);
    this.ports.searchChanged();
  }

  list(input: ExternalSessionListInput, caller: SessionsCaller): Promise<ExternalSessionListOutput> {
    return runSessionList(input, caller, this.store, this.discovery, this.ports);
  }

  historyRead(input: ExternalSessionHistoryInput, caller: SessionsCaller): Promise<ExternalSessionHistoryOutput> {
    return runHistoryRead(input, caller, this.store, this.ports);
  }

  historyAuthorize(input: ExternalSessionHistoryAuthorizeInput, caller: SessionsCaller): Promise<ExternalSessionHistoryAuthorization> {
    return runHistoryAuthorize(input, caller, this.store, this.ports);
  }

  scopeRead(input: ExternalSessionScopeReadInput, caller: SessionsCaller): Promise<ExternalSessionScopeView> {
    return runScopeRead(input, caller, this.store, this.ports);
  }

  scopeSet(input: ExternalSessionScopeSetInput, caller: SessionsCaller): Promise<ExternalSessionScopeView> {
    return runScopeSet(input, caller, this.store, this.discovery, this.ports);
  }

  projectAiReadSet(input: ExternalSessionProjectAiReadSetInput, caller: SessionsCaller): Promise<ExternalSessionProjectAiRead> {
    return runProjectAiReadSet(input, caller, this.store, this.ports);
  }

  discoveryRun(input: ExternalSessionDiscoveryRunInput, caller: SessionsCaller): Promise<ExternalSessionDiscoveryRunOutput> {
    return runDiscovery(input, caller, this.store, this.discovery, this.ports);
  }

  attributionSet(input: ExternalSessionAttributionInput, caller: SessionsCaller): Promise<ExternalSessionRow> {
    return runAttributionSet(input, caller, this.store, this.ports);
  }

  async attributionSuggest(
    input: ExternalSessionAttributionSuggestInput,
    caller: SessionsCaller,
  ): Promise<ExternalSessionAttributionSuggestOutput> {
    assertPersonalCaller(caller);
    return runAttributionSuggest(input, caller, this.store, this.ports);
  }

  toolSearch(input: ExternalSessionToolSearchInput, caller: SessionsCaller): Promise<ExternalSessionToolSearchOutput> {
    return runToolSearch(input, caller, this.store, this.ports);
  }

  searchEntries(input: SearchEntriesInput, caller: SessionsCaller): Promise<SearchEntriesPage> {
    return runSearchEntries(input, caller, this.store, this.ports);
  }

  subjectRead(request: SubjectContextRequest, caller: SessionsCaller): Promise<ActionSubjectContext> {
    return runSubjectRead(request, caller, this.store, this.ports);
  }

  connectorUsages(input: ConnectorUsagesInput, caller: SessionsCaller): Promise<{ usages: ConnectorUsage[] }> {
    return runConnectorUsages(input, caller, this.store);
  }
}
