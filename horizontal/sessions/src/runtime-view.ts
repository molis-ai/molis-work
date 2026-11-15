import { ActionError, type ActionCallContext, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { EXTERNAL_TOOLS, type ExternalToolEntry, type ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import {
  sessionsErrors,
  type ExternalSessionNextStep,
  type ExternalSessionReadScope,
  type ExternalSessionRow,
  type ExternalSessionSource,
  type ExternalSessionSourceStatus,
  type ExternalSessionSourceSummary,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { hasSessionAdapter } from "./adapters/index.js";
import {
  computeBindingSnapshotDigest,
  computeDirectorySnapshotDigest,
  directoryKeyForPath,
  evaluateDerivedDirectory,
  isSessionDirectoryAllowedByScope,
  matchRuntimeBindingForSession,
  resolveSessionAttribution,
  type PreparedLinkedWorkspace,
  type ResolvedAttribution,
  type StoredAttributionDecision,
} from "./attribution.js";
import { type DiscoveryCoordinator, resolveLocalToolRoot } from "./discovery.js";
import { SessionSourceFailure, type SessionProjectSnapshot, type SessionsPorts } from "./ports.js";
import {
  materializeSuggestion,
  type SessionsStore,
  type StoredDirectoryRow,
  type StoredExternalSessionRow,
  type StoredSourceRow,
  type StoredSuggestionRow,
} from "./store.js";

export type SessionsCaller = ActionCallContext & Partial<Pick<ActionExecutionContext, "beforeEffect">>;
export type RegisteredToolEntry = ExternalToolEntry & { id: ExternalToolId };

const STALE_DISCOVERY_MS = 5 * 60 * 1000;
const REGISTERED_TOOLS = EXTERNAL_TOOLS as readonly RegisteredToolEntry[];

export function topLevelTools(): readonly RegisteredToolEntry[] {
  return REGISTERED_TOOLS.filter(tool => tool.shares_sessions_with === undefined);
}

export function findTopLevelTool(entryId: string): RegisteredToolEntry | undefined {
  return REGISTERED_TOOLS.find(tool => tool.id === entryId && tool.shares_sessions_with === undefined);
}

export function isPersonalCaller(caller: SessionsCaller): boolean {
  return caller.audience === "user" && !caller.delegated_by;
}

export function assertPersonalCaller(caller: SessionsCaller): void {
  if (!isPersonalCaller(caller)) {
    throw new ActionError("actions.forbidden", "这项操作只有本人能执行");
  }
}

export function nowDate(ports: SessionsPorts): Date {
  return (ports.clock ?? (() => new Date()))();
}

export function nowIso(ports: SessionsPorts): string {
  return nowDate(ports).toISOString();
}

export function toSummarySource(source: ExternalSessionSource): ExternalSessionSourceSummary {
  const { location_key: _loc, skipped_count: _skip, progress: _prog, ...summary } = source;
  return summary;
}

export function isSourceCurrentlyAllowed(
  scope: ExternalSessionReadScope | undefined,
  surface: ExternalToolEntry["surface"],
  ports: SessionsPorts,
): boolean {
  if (!scope || !scope.allowed) return false;
  if (surface === "cloud") {
    if (!scope.connection_id) return false;
    const conn = ports.connections.current(scope.connection_id);
    if (!conn || !conn.enabled) return false;
  }
  return true;
}

export function isSessionInScopeWithMaps(
  session: StoredExternalSessionRow,
  scopeMap: ReadonlyMap<string, ExternalSessionReadScope>,
  dirMap: ReadonlyMap<string, StoredDirectoryRow>,
  workspaces: readonly PreparedLinkedWorkspace[],
  ports: SessionsPorts,
): boolean {
  const tool = findTopLevelTool(session.entry_id);
  if (!tool || !hasSessionAdapter(session.entry_id)) return false;
  const scope = scopeMap.get(`${session.entry_id}\0${session.location_key}`);
  if (!isSourceCurrentlyAllowed(scope, tool.surface, ports)) return false;
  if (scope!.directories.mode === "all") return true;

  const dirRow = session.directory_key ? dirMap.get(session.directory_key) : undefined;
  const identity = dirRow
    ? (dirRow.realpath_verified
        ? { real_path: dirRow.path, repository_key: dirRow.repository_key, worktree_relative: dirRow.worktree_relative }
        : null)
    : (session.directory_path ? ports.directories.identify(session.directory_path) : null);
  return isSessionDirectoryAllowedByScope(scope!.directories, identity, workspaces);
}

export function isSessionInScopeSync(
  session: StoredExternalSessionRow,
  store: SessionsStore,
  ports: SessionsPorts,
  workspaces: readonly PreparedLinkedWorkspace[],
): boolean {
  const scopeMap = new Map(store.decisions.readScopes().map(s => [`${s.entry_id}\0${s.location_key}`, s]));
  const dirMap = store.allDirectories();
  return isSessionInScopeWithMaps(session, scopeMap, dirMap, workspaces, ports);
}

export function syncDerivedCaches(
  snapshot: SessionProjectSnapshot,
  prepared: { projectMap: Map<string, { project_id: string; display_name: string }>; workspaces: PreparedLinkedWorkspace[] },
  store: SessionsStore,
  ports: SessionsPorts,
): { dirDigest: string; dirMap: Map<string, StoredDirectoryRow> } {
  const dirDigest = computeDirectorySnapshotDigest(snapshot);
  const bindingDigest = computeBindingSnapshotDigest(snapshot);
  const storedDirDigest = store.getMeta("directory_snapshot_digest");
  const storedBindingDigest = store.getMeta("binding_snapshot_digest");

  if (storedDirDigest === dirDigest && storedBindingDigest === bindingDigest) {
    return { dirDigest, dirMap: store.allDirectories() };
  }

  store.inTransaction(() => {
    if (storedDirDigest !== dirDigest) {
      for (const ws of prepared.workspaces) {
        const wsKey = directoryKeyForPath(ws.real_path);
        const identity = { real_path: ws.real_path, repository_key: ws.repository_key, worktree_relative: ws.worktree_relative };
        const derived = evaluateDerivedDirectory(identity, prepared.workspaces, "automatic");
        store.upsertDirectory({ directory_key: wsKey, path: ws.real_path, kind: "workspace", identity, derived, directory_digest: dirDigest });
      }
      for (const dirRow of store.allDirectories().values()) {
        if (dirRow.kind !== "session") continue;
        const identity = ports.directories.identify(dirRow.path);
        const derived = evaluateDerivedDirectory(identity, prepared.workspaces, dirRow.derived_state);
        store.upsertDirectory({
          directory_key: dirRow.directory_key, path: identity?.real_path ?? dirRow.path,
          kind: "session", identity, derived, directory_digest: dirDigest,
        });
      }
      store.setMeta("directory_snapshot_digest", dirDigest);
    }

    const freshDirs = store.allDirectories();
    const decisions = store.decisions.allAttributionDecisions();
    const duplicateLocal = store.duplicateLocalNativeKeys();
    for (const session of store.activeSessionsOrdered()) {
      const dirRow = session.directory_key ? freshDirs.get(session.directory_key) : undefined;
      const derived = dirRow
        ? {
            derived_state: dirRow.derived_state, derived_project_id: dirRow.derived_project_id,
            evidence_kind: dirRow.evidence_kind, evidence_path: dirRow.evidence_path, candidates: dirRow.candidates,
          }
        : { derived_state: "no_relation" as const, derived_project_id: null, evidence_kind: null, evidence_path: null, candidates: [] };
      const binding = matchRuntimeBindingForSession(session, snapshot.bindings, prepared.projectMap, duplicateLocal);
      const resolved = resolveSessionAttribution({
        decision: decisions.get(session.session_key) ?? null, derived, binding, suggestion: null, projectMap: prepared.projectMap,
      });
      if (resolved.reported_project_id !== session.reported_project_id) {
        store.updateReportedProjectId(session.session_key, resolved.reported_project_id);
      }
    }
    store.setMeta("binding_snapshot_digest", bindingDigest);
  });

  return { dirDigest, dirMap: store.allDirectories() };
}

export function materializeFullRow(
  session: StoredExternalSessionRow,
  dirMap: ReadonlyMap<string, StoredDirectoryRow>,
  decisionMap: ReadonlyMap<string, StoredAttributionDecision>,
  suggestionMap: ReadonlyMap<string, StoredSuggestionRow>,
  bindings: SessionProjectSnapshot["bindings"],
  projectMap: ReadonlyMap<string, { project_id: string; display_name: string }>,
  duplicateLocal: ReadonlySet<string>,
): { row: ExternalSessionRow; resolved: ResolvedAttribution } {
  const tool = findTopLevelTool(session.entry_id)!;
  const dirRow = session.directory_key ? dirMap.get(session.directory_key) : undefined;
  const derived = dirRow
    ? {
        derived_state: dirRow.derived_state, derived_project_id: dirRow.derived_project_id,
        evidence_kind: dirRow.evidence_kind, evidence_path: dirRow.evidence_path, candidates: dirRow.candidates,
      }
    : { derived_state: "no_relation" as const, derived_project_id: null, evidence_kind: null, evidence_path: null, candidates: [] };
  const decision = decisionMap.get(session.session_key) ?? null;
  const suggestion = materializeSuggestion(suggestionMap.get(session.session_key), projectMap);
  const binding = matchRuntimeBindingForSession(session, bindings, projectMap, duplicateLocal);
  const resolved = resolveSessionAttribution({ decision, derived, binding, suggestion, projectMap });

  const row: ExternalSessionRow = {
    session_key: session.session_key,
    identity: { entry_id: session.entry_id, location_key: session.location_key, native_id: session.native_id },
    tool: { entry_id: session.entry_id, display_name: tool.display_name, surface: tool.surface, region: tool.region },
    seen_via: session.seen_via,
    title: session.title,
    directory: session.directory_path,
    last_activity_at: session.last_activity_at,
    activity: session.activity,
    attribution: resolved.attribution,
    attribution_revision: decision?.revision ?? 0,
    forked_from: session.forked_from,
    return_target: session.return_target,
  };
  return { row, resolved };
}

function nextStepForStatus(tool: ExternalToolEntry, status: ExternalSessionSourceStatus): ExternalSessionNextStep | null {
  switch (status.state) {
    case "complete":
    case "reading":
      return null;
    case "not_allowed":
      return "open_scope";
    case "needs_login":
      return status.reason === "login_expired" ? "sign_in" : "open_scope";
    case "version_unreadable":
      return "update_tool";
    case "failed":
      return "retry";
    case "unsupported": {
      const discover = tool.sessions.discover;
      return discover.via === "gap" && discover.fallback === "export" ? "export" : "return_to_tool";
    }
  }
}

function unsupportedStatusForTool(tool: ExternalToolEntry): ExternalSessionSourceStatus {
  const discover = tool.sessions.discover;
  const list = tool.sessions.list;
  return discover.via === "gap" && list.via === "gap"
    ? { state: "unsupported", reason: "tool_gap" }
    : { state: "unsupported", reason: "adapter_pending" };
}

function storedStatus(stored: StoredSourceRow): ExternalSessionSourceStatus {
  switch (stored.state) {
    case "needs_login":
      return {
        state: "needs_login",
        reason: stored.reason === "connection_removed" || stored.reason === "account_changed" ? stored.reason : "login_expired",
      };
    case "version_unreadable":
      return { state: "version_unreadable", reason: stored.reason === "parse_error" ? "parse_error" : "version_mismatch" };
    case "failed":
      return {
        state: "failed",
        reason: stored.reason === "tool_missing" || stored.reason === "timed_out" ? stored.reason : "read_error",
      };
    case "unsupported":
      return { state: "unsupported", reason: stored.reason === "tool_gap" ? "tool_gap" : "adapter_pending" };
    default:
      return { state: "complete", reason: null };
  }
}

function buildSingleSourceView(
  tool: RegisteredToolEntry,
  locationKey: string,
  scope: ExternalSessionReadScope | undefined,
  sourceRows: ReadonlyMap<string, StoredSourceRow>,
  inScopeCountsBySource: ReadonlyMap<string, number>,
  discovery: DiscoveryCoordinator,
  ports: SessionsPorts,
): ExternalSessionSource {
  const entryId = tool.id;
  const key = `${entryId}\0${locationKey}`;
  const stored = sourceRows.get(key);
  const liveCount = inScopeCountsBySource.get(key) ?? 0;

  if (!scope || !scope.allowed) {
    return {
      entry_id: entryId, display_name: tool.display_name, state: "not_allowed", reason: null,
      session_count: 0, completed_at: stored?.completed_at ?? null, next_step: "open_scope",
      location_key: locationKey, skipped_count: 0, progress: null,
    };
  }

  if (tool.surface === "cloud") {
    const conn = scope.connection_id ? ports.connections.current(scope.connection_id) : null;
    if (!scope.connection_id || !conn || !conn.enabled) {
      const status: ExternalSessionSourceStatus = {
        state: "needs_login",
        reason: !scope.connection_id || !conn ? "connection_removed" : "login_expired",
      };
      return {
        entry_id: entryId, display_name: tool.display_name, ...status, session_count: liveCount,
        completed_at: stored?.completed_at ?? null, next_step: nextStepForStatus(tool, status),
        location_key: locationKey, skipped_count: stored?.skipped_count ?? 0, progress: null,
      };
    }
  }

  if (discovery.isRunning(entryId, locationKey) || !stored || stored.state === "reading") {
    return {
      entry_id: entryId, display_name: tool.display_name, state: "reading", reason: null,
      session_count: liveCount, completed_at: stored?.completed_at ?? null, next_step: null,
      location_key: locationKey, skipped_count: stored?.skipped_count ?? 0,
      progress: { read: stored?.progress_read ?? 0, total: stored?.progress_total ?? null },
    };
  }

  const status = storedStatus(stored);
  return {
    entry_id: entryId, display_name: tool.display_name, ...status, session_count: liveCount,
    completed_at: stored.completed_at, next_step: nextStepForStatus(tool, status),
    location_key: locationKey, skipped_count: stored.skipped_count, progress: null,
  };
}

export function buildPersonSources(
  scopes: readonly ExternalSessionReadScope[],
  sourceRows: ReadonlyMap<string, StoredSourceRow>,
  inScopeCountsBySource: ReadonlyMap<string, number>,
  discovery: DiscoveryCoordinator,
  ports: SessionsPorts,
): ExternalSessionSource[] {
  const scopesByEntry = new Map<ExternalToolId, ExternalSessionReadScope[]>();
  for (const scope of scopes) {
    const list = scopesByEntry.get(scope.entry_id) ?? [];
    list.push(scope);
    scopesByEntry.set(scope.entry_id, list);
  }

  const result: ExternalSessionSource[] = [];
  for (const tool of topLevelTools()) {
    const entryId = tool.id;
    if (!hasSessionAdapter(entryId)) {
      const status = unsupportedStatusForTool(tool);
      result.push({
        entry_id: entryId, display_name: tool.display_name, ...status,
        session_count: 0, completed_at: null, next_step: nextStepForStatus(tool, status),
        location_key: tool.surface === "cloud" ? null : resolveLocalToolRoot(tool, ports).locationKey,
        skipped_count: 0, progress: null,
      });
      continue;
    }

    if (tool.surface === "cloud") {
      const cloudScopes = scopesByEntry.get(entryId) ?? [];
      if (cloudScopes.length === 0) {
        result.push({
          entry_id: entryId, display_name: tool.display_name, state: "not_allowed", reason: null,
          session_count: 0, completed_at: null, next_step: "open_scope", location_key: null, skipped_count: 0, progress: null,
        });
      } else {
        for (const scope of cloudScopes) {
          result.push(buildSingleSourceView(tool, scope.location_key, scope, sourceRows, inScopeCountsBySource, discovery, ports));
        }
      }
      continue;
    }

    const { locationKey } = resolveLocalToolRoot(tool, ports);
    const scope = (scopesByEntry.get(entryId) ?? []).find(s => s.location_key === locationKey);
    result.push(buildSingleSourceView(tool, locationKey, scope, sourceRows, inScopeCountsBySource, discovery, ports));
  }
  return result;
}

export function maybeTriggerStaleDiscovery(
  scopes: readonly ExternalSessionReadScope[],
  sourceRows: ReadonlyMap<string, StoredSourceRow>,
  discovery: DiscoveryCoordinator,
  ports: SessionsPorts,
): void {
  const nowMs = nowDate(ports).getTime();
  for (const scope of scopes) {
    const tool = findTopLevelTool(scope.entry_id);
    if (!tool || !hasSessionAdapter(scope.entry_id)) continue;
    if (!isSourceCurrentlyAllowed(scope, tool.surface, ports)) continue;
    if (discovery.isRunning(scope.entry_id, scope.location_key)) continue;
    const stored = sourceRows.get(`${scope.entry_id}\0${scope.location_key}`);
    if (!stored) {
      discovery.enqueue(scope.entry_id, scope.location_key, true);
      continue;
    }
    const checkedMs = Date.parse(stored.checked_at);
    if (!Number.isFinite(checkedMs) || nowMs - checkedMs >= STALE_DISCOVERY_MS) {
      discovery.enqueue(scope.entry_id, scope.location_key, true);
    }
  }
}

export function rethrowAdapterError(
  error: unknown,
  entryId: ExternalToolId,
  locationKey: string,
  store: SessionsStore,
  ports: SessionsPorts,
): never {
  if (error instanceof ActionError) throw error;
  if (error instanceof SessionSourceFailure) {
    if (error.kind === "account_changed" || error.kind === "login_expired") {
      const existing = store.getSource(entryId, locationKey);
      store.upsertSource({
        entry_id: entryId, location_key: locationKey, state: "needs_login", reason: error.kind,
        progress_cursor: null, progress_read: existing?.progress_read ?? 0,
        progress_total: existing?.progress_total ?? null, session_count: existing?.session_count ?? 0,
        skipped_count: existing?.skipped_count ?? 0, completed_at: existing?.completed_at ?? null,
        checked_at: nowIso(ports),
      });
    }
    if (error.kind === "login_expired" || error.kind === "connection_removed" || error.kind === "account_changed") {
      throw sessionsErrors.needs_login(error.message);
    }
    if (error.kind === "version_mismatch" || error.kind === "parse_error") {
      throw sessionsErrors.version_unreadable(error.message);
    }
    throw sessionsErrors.read_failed(error.message);
  }
  throw error;
}
