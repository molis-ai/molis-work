import { EXTERNAL_TOOLS, type ExternalToolEntry, type ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { getSessionAdapter } from "./adapters/index.js";
import {
  canonicalEntryId,
  computeBindingSnapshotDigest,
  directoryKeyForPath,
  evaluateDerivedDirectory,
  isSessionDirectoryAllowedByScope,
  localLocationKey,
  matchRuntimeBindingForSession,
  resolveSessionAttribution,
  sessionKeyForIdentity,
} from "./attribution.js";
import type { SessionDirectoryIdentity } from "./git-files.js";
import {
  sessionSourceFailure,
  sourceStatusFromFailure,
  type AdapterDiscoveryBatch,
  type AdapterSourceContext,
  type SessionsPorts,
} from "./ports.js";
import { resolveDerivedSnapshot } from "./runtime-view.js";
import type { SessionsStore, StoredSourceRow } from "./store.js";

export interface DiscoveryStartState {
  cursor: string | null;
  startedFromNull: boolean;
  progressRead: number;
  skippedCount: number;
  connectionId: string | null;
  previousCompletedAt: string | null;
  root: string | null;
  rootExists: boolean;
}

export function resolveLocalToolRoot(tool: ExternalToolEntry, ports: SessionsPorts): { root: string | null; exists: boolean; locationKey: string } {
  const discover = tool.sessions.discover;
  const pathSpec = discover.via === "local_record" ? discover.root : (tool.data_root ?? null);
  if (!pathSpec) {
    return { root: null, exists: true, locationKey: localLocationKey(null) };
  }
  const resolved = ports.files.resolveRoot(pathSpec);
  return {
    root: resolved.root,
    exists: resolved.exists,
    locationKey: localLocationKey(resolved.root),
  };
}

function assertCloudConnectionActive(connectionId: string | null, ports: SessionsPorts): void {
  if (!connectionId) {
    throw sessionSourceFailure("connection_removed", "Missing cloud connection", false);
  }
  const currentConn = ports.connections.current(connectionId);
  if (!currentConn) {
    throw sessionSourceFailure("connection_removed", "Cloud connection removed", false);
  }
  if (!currentConn.enabled) {
    throw sessionSourceFailure("login_expired", "Cloud connection disabled or expired", false);
  }
}

function prepareDiscoveryStart(
  tool: ExternalToolEntry,
  entryId: ExternalToolId,
  locationKey: string,
  fromStart: boolean,
  store: SessionsStore,
  ports: SessionsPorts,
  now: string,
  isCancelled: () => boolean,
): Promise<DiscoveryStartState | null> {
  return ports.projects.read(() => {
    if (isCancelled()) return null;
    const scope = store.decisions.getReadScope(entryId, locationKey);
    if (!scope || !scope.allowed) return null;
    if (tool.surface === "cloud") assertCloudConnectionActive(scope.connection_id, ports);

    const localInfo = tool.surface === "cloud" ? { root: null, exists: true } : resolveLocalToolRoot(tool, ports);
    const existingSource = store.getSource(entryId, locationKey);
    const resumeCursor = !fromStart && existingSource?.state === "reading" ? existingSource.progress_cursor : null;
    const startedFromNull = resumeCursor === null;
    const progressRead = startedFromNull ? 0 : (existingSource?.progress_read ?? 0);
    const skippedCount = startedFromNull ? 0 : (existingSource?.skipped_count ?? 0);

    if (!localInfo.exists && tool.sessions.discover.via === "local_record") {
      store.inTransaction(() => {
        store.markMissingSourceSessionsGone(entryId, locationKey, new Set(), now);
        store.upsertSource({
          entry_id: entryId, location_key: locationKey, state: "complete", reason: null,
          progress_cursor: null, progress_read: 0, progress_total: 0,
          session_count: 0, skipped_count: 0, completed_at: now, checked_at: now,
        });
      });
      return {
        cursor: null, startedFromNull: true, progressRead: 0, skippedCount: 0,
        connectionId: scope.connection_id, previousCompletedAt: existingSource?.completed_at ?? null,
        root: localInfo.root, rootExists: false,
      };
    }

    store.upsertSource({
      entry_id: entryId, location_key: locationKey, state: "reading", reason: null,
      progress_cursor: resumeCursor, progress_read: progressRead,
      progress_total: existingSource?.progress_total ?? null,
      session_count: existingSource?.session_count ?? 0,
      skipped_count: skippedCount,
      completed_at: existingSource?.completed_at ?? null, checked_at: now,
    });

    return {
      cursor: resumeCursor, startedFromNull, progressRead, skippedCount,
      connectionId: scope.connection_id, previousCompletedAt: existingSource?.completed_at ?? null,
      root: localInfo.root, rootExists: true,
    };
  });
}

function commitDiscoveredBatch(params: {
  tool: ExternalToolEntry;
  entryId: ExternalToolId;
  locationKey: string;
  startState: DiscoveryStartState;
  batch: AdapterDiscoveryBatch;
  identifiedByPath: ReadonlyMap<string, SessionDirectoryIdentity | null>;
  seenKeys: Set<string>;
  counters: { progressRead: number; skippedCount: number };
  store: SessionsStore;
  ports: SessionsPorts;
  now: string;
  isCancelled: () => boolean;
}): Promise<{ committed: boolean; changed: boolean }> {
  const { tool, entryId, locationKey, startState, batch, identifiedByPath, seenKeys, counters, store, ports, now, isCancelled } = params;
  return ports.projects.read(snapshot => {
    if (isCancelled()) return { committed: false, changed: false };
    const currentScope = store.decisions.getReadScope(entryId, locationKey);
    if (!currentScope || !currentScope.allowed || currentScope.connection_id !== startState.connectionId) {
      return { committed: false, changed: false };
    }
    if (tool.surface === "cloud") assertCloudConnectionActive(currentScope.connection_id, ports);

    // Reuse the same digest-keyed workspace cache as list/history; only a changed directory snapshot or a missing cache entry
    // reads disk. The old path identified every linked folder again for every discovery batch.
    const snapshotView = resolveDerivedSnapshot(snapshot, store, ports);
    const workspaces = snapshotView.workspaces;
    const dirDigest = snapshotView.dirDigest;
    const bindingDigest = computeBindingSnapshotDigest(snapshot);
    const duplicateLocal = store.duplicateLocalNativeKeys();
    const decisionMap = store.decisions.allAttributionDecisions();

    let batchChanged = false;
    store.inTransaction(() => {
      for (const candidate of batch.sessions) {
        const identity = candidate.directory ? (identifiedByPath.get(candidate.directory) ?? null) : null;
        if (!isSessionDirectoryAllowedByScope(currentScope.directories, identity, workspaces)) continue;

        const canonicalPath = identity?.real_path ?? candidate.directory;
        const dirKey = canonicalPath ? directoryKeyForPath(canonicalPath) : null;
        let derived = evaluateDerivedDirectory(identity, workspaces, null);
        if (dirKey && canonicalPath) {
          const prevDir = store.getDirectory(dirKey);
          derived = evaluateDerivedDirectory(identity, workspaces, prevDir?.derived_state ?? null);
          store.upsertDirectory({ directory_key: dirKey, path: canonicalPath, kind: "session", identity, derived, directory_digest: dirDigest });
        }

        const sessionKey = sessionKeyForIdentity({ entry_id: entryId, location_key: locationKey, native_id: candidate.native_id });
        const forkedFromKey = candidate.forked_from_native_id
          ? sessionKeyForIdentity({ entry_id: entryId, location_key: locationKey, native_id: candidate.forked_from_native_id })
          : null;
        const seenVia = candidate.seen_via ? [entryId, candidate.seen_via] : [entryId];
        const binding = matchRuntimeBindingForSession(
          { entry_id: entryId, location_key: locationKey, native_id: candidate.native_id, seen_via: seenVia },
          snapshot.bindings, snapshotView.projectMap, duplicateLocal,
        );
        const resolved = resolveSessionAttribution({
          decision: decisionMap.get(sessionKey) ?? null,
          derived, binding, suggestion: null, projectMap: snapshotView.projectMap,
        });

        store.upsertSession({
          session_key: sessionKey, entry_id: entryId, location_key: locationKey, native_id: candidate.native_id,
          seen_via: seenVia, title: candidate.title, directory_key: dirKey, directory_path: canonicalPath,
          activity: candidate.activity, return_target: candidate.return_target,
          reported_project_id: resolved.reported_project_id, last_activity_at: candidate.last_activity_at,
          forked_from: forkedFromKey, gone_at: null,
        });
        seenKeys.add(sessionKey);
        batchChanged = true;
      }

      counters.progressRead += batch.sessions.length;
      counters.skippedCount += batch.skipped_count;

      if (batch.next_cursor !== null) {
        store.upsertSource({
          entry_id: entryId, location_key: locationKey, state: "reading", reason: null,
          progress_cursor: batch.next_cursor, progress_read: counters.progressRead, progress_total: batch.total ?? null,
          session_count: store.countActiveSessionsForSource(entryId, locationKey),
          skipped_count: counters.skippedCount, completed_at: startState.previousCompletedAt, checked_at: now,
        });
      } else {
        if (startState.startedFromNull) {
          store.markMissingSourceSessionsGone(entryId, locationKey, seenKeys, now);
          batchChanged = true;
        }
        store.upsertSource({
          entry_id: entryId, location_key: locationKey, state: "complete", reason: null,
          progress_cursor: null, progress_read: counters.progressRead,
          progress_total: batch.total ?? counters.progressRead,
          session_count: store.countActiveSessionsForSource(entryId, locationKey),
          skipped_count: counters.skippedCount, completed_at: now, checked_at: now,
        });
        store.setMeta("directory_snapshot_digest", dirDigest);
        store.setMeta("binding_snapshot_digest", bindingDigest);
      }
    });

    return { committed: true, changed: batchChanged };
  });
}

async function recordFailureIfStillAllowed(
  entryId: ExternalToolId,
  locationKey: string,
  store: SessionsStore,
  ports: SessionsPorts,
  nowIso: () => string,
  isCancelled: () => boolean,
  error: unknown,
): Promise<void> {
  if (isCancelled()) return;
  try {
    await ports.projects.read(() => {
      if (isCancelled()) return;
      const currentScope = store.decisions.getReadScope(entryId, locationKey);
      if (!currentScope || !currentScope.allowed) return;
      const mapped = sourceStatusFromFailure(error);
      const existing: StoredSourceRow | null = store.getSource(entryId, locationKey);
      store.upsertSource({
        entry_id: entryId, location_key: locationKey, state: mapped.state, reason: mapped.reason,
        progress_cursor: null,
        progress_read: existing?.progress_read ?? 0,
        progress_total: existing?.progress_total ?? null,
        session_count: existing?.session_count ?? store.countActiveSessionsForSource(entryId, locationKey),
        skipped_count: existing?.skipped_count ?? 0,
        completed_at: existing?.completed_at ?? null,
        checked_at: nowIso(),
      });
    });
  } catch {
    // Host closing; never update progress rows on shutdown.
  }
}

export async function executeDiscoveryJob(params: {
  entryId: ExternalToolId;
  locationKey: string;
  fromStart: boolean;
  signal: AbortSignal;
  isClosed: () => boolean;
  store: SessionsStore;
  ports: SessionsPorts;
}): Promise<void> {
  const { entryId, locationKey, fromStart, signal, isClosed, store, ports } = params;
  const isCancelled = () => signal.aborted || isClosed();
  const nowIso = () => (ports.clock ?? (() => new Date()))().toISOString();

  const tool = (EXTERNAL_TOOLS as readonly (ExternalToolEntry & { id: ExternalToolId })[]).find(
    item => canonicalEntryId(item) === entryId && !item.shares_sessions_with,
  );
  const adapter = getSessionAdapter(entryId);
  if (!tool || !adapter) return;

  let startState: DiscoveryStartState | null = null;
  try {
    startState = await prepareDiscoveryStart(tool, entryId, locationKey, fromStart, store, ports, nowIso(), isCancelled);
  } catch (error) {
    await recordFailureIfStillAllowed(entryId, locationKey, store, ports, nowIso, isCancelled, error);
    return;
  }

  if (!startState) return;
  if (!startState.rootExists) {
    ports.searchChanged();
    return;
  }

  const seenKeys = new Set<string>();
  const counters = { progressRead: startState.progressRead, skippedCount: startState.skippedCount };
  let cursor = startState.cursor;
  const adapterContext: AdapterSourceContext = {
    tool, entry_id: entryId, location_key: locationKey, root: startState.root, connection_id: startState.connectionId, ports,
  };

  try {
    while (!isCancelled()) {
      const batch = await adapter.discoverPage(adapterContext, cursor, signal, counters.progressRead);
      if (isCancelled()) return;

      const identifiedByPath = new Map<string, SessionDirectoryIdentity | null>();
      for (const candidate of batch.sessions) {
        if (candidate.directory && !identifiedByPath.has(candidate.directory)) {
          identifiedByPath.set(candidate.directory, ports.directories.identify(candidate.directory));
        }
      }

      const outcome = await commitDiscoveredBatch({
        tool, entryId, locationKey, startState, batch, identifiedByPath,
        seenKeys, counters, store, ports, now: nowIso(), isCancelled,
      });
      if (!outcome.committed) return;
      if (outcome.changed) ports.searchChanged();
      if (batch.next_cursor === null) break;
      cursor = batch.next_cursor;
    }
  } catch (error) {
    await recordFailureIfStillAllowed(entryId, locationKey, store, ports, nowIso, isCancelled, error);
  }
}
