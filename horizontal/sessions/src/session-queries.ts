import {
  ActionError,
  searchEntriesPage,
  subjectContext,
  type ActionSubjectContext,
  type SearchEntriesInput,
  type SearchEntriesPage,
  type SearchEntry,
  type SubjectContextRequest,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  EXTERNAL_SESSION_HISTORY_DEFAULT,
  EXTERNAL_SESSION_HISTORY_MAX,
  EXTERNAL_SESSION_LIST_DEFAULT,
  EXTERNAL_SESSION_LIST_MAX,
  EXTERNAL_SESSION_SUBJECT_KIND,
  externalSessionSearchEntry,
  sessionsErrors,
  type ExternalSessionHistoryInput,
  type ExternalSessionHistoryOutput,
  type ExternalSessionListInput,
  type ExternalSessionListOutput,
  type ExternalSessionRow,
  type ExternalSessionRowSummary,
  type ExternalSessionSourceSummary,
  type ExternalSessionToolSearchInput,
  type ExternalSessionToolSearchOutput,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { redactSecrets } from "@molis-ai/molis-work-plugin-sdk";
import { getSessionAdapter } from "./adapters/index.js";
import { literalRanges } from "./adapters/shared.js";
import { sessionKeyForIdentity, toRowSummary } from "./attribution.js";
import { type DiscoveryCoordinator, resolveLocalToolRoot } from "./discovery.js";
import type { AdapterSourceContext, ExternalSessionSourceAdapter, SessionsPorts } from "./ports.js";
import {
  assertPersonalCaller,
  buildPersonSources,
  findTopLevelTool,
  isPersonalCaller,
  isSessionInScopeWithMaps,
  isSourceCurrentlyAllowed,
  materializeFullRow,
  maybeTriggerStaleDiscovery,
  resolveDerivedSnapshot,
  rethrowAdapterError,
  toSummarySource,
  type RegisteredToolEntry,
  type SessionsCaller,
} from "./runtime-view.js";
import { decodeSessionCursor, encodeSessionCursor, type SessionsStore, type StoredExternalSessionRow } from "./store.js";

export async function runSessionList(
  input: ExternalSessionListInput,
  caller: SessionsCaller,
  store: SessionsStore,
  discovery: DiscoveryCoordinator,
  ports: SessionsPorts,
): Promise<ExternalSessionListOutput> {
  const isPerson = isPersonalCaller(caller);
  if (!isPerson && input.view !== "project") {
    throw new ActionError("actions.forbidden", "非本人调用只能读取当前项目的会话");
  }
  if (input.view === "project" && !caller.project_id) {
    throw sessionsErrors.project_required("请先指定当前项目再查看项目会话");
  }

  const limit = Math.min(Math.max(1, input.limit ?? EXTERNAL_SESSION_LIST_DEFAULT), EXTERNAL_SESSION_LIST_MAX);
  const decodedCursor = input.cursor ? decodeSessionCursor(input.cursor) : null;
  const entryFilter = input.entry_ids && input.entry_ids.length > 0 ? new Set(input.entry_ids) : null;

  return ports.projects.read(snapshot => {
    if (!isPerson) {
      const permit = store.decisions.getProjectAiRead(caller.project_id!);
      if (!permit || !permit.allowed) {
        throw sessionsErrors.project_ai_read_off("当前项目的外部会话 AI 读取许可处于关闭状态", { next_step: "open_project_ai_read" });
      }
    }

    const { dirMap, workspaces, projectMap } = resolveDerivedSnapshot(snapshot, store, ports);
    const scopes = store.decisions.readScopes();
    const scopeMap = new Map(scopes.map(s => [`${s.entry_id}\0${s.location_key}`, s]));
    const sourceRows = store.sources();
    if (isPerson) maybeTriggerStaleDiscovery(scopes, sourceRows, discovery, ports);
    const freshSourceRows = isPerson ? store.sources() : sourceRows;

    const decisionMap = store.decisions.allAttributionDecisions();
    const suggestionMap = store.decisions.allSuggestions();
    const duplicateLocal = store.duplicateLocalNativeKeys();

    const inScopeCountsBySource = new Map<string, number>();
    const projectCountsBySource = new Map<string, number>();
    let unfiledCount = 0;
    const filteredRows: ExternalSessionRow[] = [];

    for (const session of store.activeSessionsOrdered()) {
      if (!isSessionInScopeWithMaps(session, scopeMap, dirMap, workspaces, ports)) continue;
      const sourceKey = `${session.entry_id}\0${session.location_key}`;
      inScopeCountsBySource.set(sourceKey, (inScopeCountsBySource.get(sourceKey) ?? 0) + 1);

      const { row, resolved } = materializeFullRow(
        session, dirMap, decisionMap, suggestionMap, snapshot.bindings, projectMap, duplicateLocal,
      );
      if (resolved.attribution.state === "unfiled") unfiledCount++;

      if (!isPerson) {
        if (resolved.effective_project_id !== caller.project_id) continue;
        projectCountsBySource.set(sourceKey, (projectCountsBySource.get(sourceKey) ?? 0) + 1);
      } else if (input.view === "project") {
        if (resolved.effective_project_id !== caller.project_id && resolved.reported_project_id !== caller.project_id) continue;
      } else if (input.view === "unfiled" && resolved.attribution.state !== "unfiled") {
        continue;
      }

      if (entryFilter && !entryFilter.has(session.entry_id) && !session.seen_via.some(id => entryFilter.has(id))) {
        continue;
      }
      filteredRows.push(row);
    }

    let startIdx = 0;
    if (decodedCursor) {
      startIdx = filteredRows.findIndex(
        r => r.last_activity_at < decodedCursor.last_activity_at
          || (r.last_activity_at === decodedCursor.last_activity_at && r.session_key > decodedCursor.session_key),
      );
      if (startIdx < 0) startIdx = filteredRows.length;
    }

    const page = filteredRows.slice(startIdx, startIdx + limit);
    const lastInPage = page.at(-1);
    const nextCursor = startIdx + page.length < filteredRows.length && lastInPage
      ? encodeSessionCursor({ last_activity_at: lastInPage.last_activity_at, session_key: lastInPage.session_key })
      : null;
    const personSources = buildPersonSources(scopes, freshSourceRows, inScopeCountsBySource, discovery, ports);

    if (isPerson) {
      return {
        sessions: page, sources: personSources, unfiled_count: unfiledCount,
        next_cursor: nextCursor, scope_revision: store.scopeRevision(), trust: "untrusted",
      };
    }

    const summaries: ExternalSessionRowSummary[] = page.map(toRowSummary);
    const projectSources: ExternalSessionSourceSummary[] = personSources
      .filter(src => src.location_key !== null && (projectCountsBySource.get(`${src.entry_id}\0${src.location_key}`) ?? 0) > 0)
      .map(src => ({
        ...toSummarySource(src),
        session_count: projectCountsBySource.get(`${src.entry_id}\0${src.location_key}`) ?? 0,
      }));
    return {
      sessions: summaries, sources: projectSources, unfiled_count: null,
      next_cursor: nextCursor, scope_revision: store.scopeRevision(), trust: "untrusted",
    };
  });
}

function precheckHistoryRead(
  input: ExternalSessionHistoryInput,
  caller: SessionsCaller,
  isPerson: boolean,
  store: SessionsStore,
  ports: SessionsPorts,
): Promise<{
  session: StoredExternalSessionRow;
  tool: RegisteredToolEntry;
  adapter: ExternalSessionSourceAdapter;
  root: string | null;
  connectionId: string | null;
}> {
  return ports.projects.read(snapshot => {
    if (!isPerson) {
      const permit = store.decisions.getProjectAiRead(caller.project_id!);
      if (!permit || !permit.allowed) {
        throw sessionsErrors.project_ai_read_off("当前项目的外部会话 AI 读取许可处于关闭状态", { next_step: "open_project_ai_read" });
      }
    }

    const session = store.getSession(input.session_key);
    if (!session) throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
    const tool = findTopLevelTool(session.entry_id);
    const adapter = getSessionAdapter(session.entry_id);
    if (!tool || !adapter) throw sessionsErrors.source_unsupported("该来源暂不支持读取对话原文");

    const scope = store.decisions.getReadScope(session.entry_id, session.location_key);
    if (!scope || !scope.allowed) {
      if (isPerson) throw sessionsErrors.not_allowed("该外部工具尚未在读取范围中允许读取");
      throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
    }
    if (tool.surface === "cloud") {
      const conn = scope.connection_id ? ports.connections.current(scope.connection_id) : null;
      if (!scope.connection_id || !conn || !conn.enabled) {
        if (isPerson) throw sessionsErrors.needs_login("云端来源尚未连接账号或账号登录已失效");
        throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
      }
    }

    const { dirMap, workspaces, projectMap } = resolveDerivedSnapshot(snapshot, store, ports);
    const scopeMap = new Map([[`${scope.entry_id}\0${scope.location_key}`, scope]]);
    if (!isSessionInScopeWithMaps(session, scopeMap, dirMap, workspaces, ports)) {
      throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
    }

    if (!isPerson) {
      const { resolved } = materializeFullRow(
        session, dirMap, store.decisions.allAttributionDecisions(),
        store.decisions.allSuggestions(), snapshot.bindings, projectMap, store.duplicateLocalNativeKeys(),
      );
      if (resolved.effective_project_id !== caller.project_id) {
        throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
      }
    }
    if (!adapter.readHistory) throw sessionsErrors.source_unsupported("该外部工具暂未开放对话原文读取");

    const root = tool.surface === "cloud" ? null : resolveLocalToolRoot(tool, ports).root;
    return { session, tool, adapter, root, connectionId: scope.connection_id };
  });
}

export async function runHistoryRead(
  input: ExternalSessionHistoryInput,
  caller: SessionsCaller,
  store: SessionsStore,
  ports: SessionsPorts,
): Promise<ExternalSessionHistoryOutput> {
  const isPerson = isPersonalCaller(caller);
  if (!isPerson && !caller.project_id) {
    throw sessionsErrors.project_required("需要当前项目上下文才能读取会话原文");
  }

  const limit = Math.min(Math.max(1, input.limit ?? EXTERNAL_SESSION_HISTORY_DEFAULT), EXTERNAL_SESSION_HISTORY_MAX);
  const signal = caller.signal ?? AbortSignal.any([]);
  const precheck = await precheckHistoryRead(input, caller, isPerson, store, ports);

  const adapterContext: AdapterSourceContext = {
    tool: precheck.tool, entry_id: precheck.session.entry_id, location_key: precheck.session.location_key,
    root: precheck.root, connection_id: precheck.connectionId, ports,
  };

  let readOut: Awaited<ReturnType<NonNullable<ExternalSessionSourceAdapter["readHistory"]>>>;
  try {
    readOut = await precheck.adapter.readHistory!(adapterContext, precheck.session.native_id, { from: input.from, limit, query: input.query }, signal);
  } catch (error) {
    rethrowAdapterError(error, precheck.session.entry_id, precheck.session.location_key, store, ports);
  }

  await caller.beforeEffect?.();
  return ports.projects.read(postSnapshot => {
    signal.throwIfAborted();
    caller.assert_authority_current?.();

    const liveSession = store.getSession(input.session_key);
    if (!liveSession) throw sessionsErrors.scope_changed("会话在读取期间已移出当前范围");
    const { dirMap, workspaces, projectMap } = resolveDerivedSnapshot(postSnapshot, store, ports, { allowDiskIdentify: false });
    const currentScope = store.decisions.getReadScope(liveSession.entry_id, liveSession.location_key);
    if (
      !currentScope
      || currentScope.connection_id !== precheck.connectionId
      || !isSessionInScopeWithMaps(
        liveSession, new Map([[`${currentScope.entry_id}\0${currentScope.location_key}`, currentScope]]), dirMap, workspaces, ports, false,
      )
    ) {
      throw sessionsErrors.scope_changed("读取范围在读取期间已变化");
    }

    if (!isPerson) {
      const permit = store.decisions.getProjectAiRead(caller.project_id!);
      if (!permit || !permit.allowed) {
        throw sessionsErrors.scope_changed("当前项目的外部会话 AI 读取许可在读取期间已关闭");
      }
      const { resolved } = materializeFullRow(
        liveSession, dirMap, store.decisions.allAttributionDecisions(),
        store.decisions.allSuggestions(), postSnapshot.bindings, projectMap, store.duplicateLocalNativeKeys(),
      );
      if (resolved.effective_project_id !== caller.project_id) {
        throw sessionsErrors.scope_changed("会话的项目归属在读取期间已变化");
      }
    }

    const entries = isPerson ? readOut.entries : readOut.entries.map(entry => ({ ...entry, text: redactSecrets(entry.text) }));
    const matches = isPerson || !input.query
      ? readOut.matches
      : entries.map(entry => ({ position: entry.position, ranges: literalRanges(entry.text, input.query!) })).filter(item => item.ranges.length > 0);

    return {
      session_key: liveSession.session_key, entries, older_cursor: readOut.older_cursor, newer_cursor: readOut.newer_cursor,
      matches, search: readOut.search, read_state: readOut.read_state, stopped: readOut.stopped, activity: readOut.activity, trust: "untrusted",
    };
  });
}

export async function runToolSearch(
  input: ExternalSessionToolSearchInput,
  caller: SessionsCaller,
  store: SessionsStore,
  ports: SessionsPorts,
): Promise<ExternalSessionToolSearchOutput> {
  assertPersonalCaller(caller);
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (!query || query.length > 400 || query.startsWith("-")) {
    throw new ActionError("actions.input_invalid", "搜索词不能为空且不能以连字符开头");
  }
  const limit = Math.min(Math.max(1, input.limit ?? EXTERNAL_SESSION_LIST_DEFAULT), EXTERNAL_SESSION_LIST_MAX);
  const signal = caller.signal ?? AbortSignal.any([]);

  const precheck = await ports.projects.read(snapshot => {
    const tool = findTopLevelTool(input.entry_id);
    const adapter = tool ? getSessionAdapter(tool.id) : undefined;
    if (!tool || !adapter?.searchTool) throw sessionsErrors.source_unsupported("该外部工具不支持自带搜索");
    const scope = store.decisions.getReadScope(tool.id, input.location_key);
    if (!scope || !scope.allowed) throw sessionsErrors.not_allowed("该外部工具尚未在读取范围中允许读取");
    if (tool.surface === "cloud") {
      const conn = scope.connection_id ? ports.connections.current(scope.connection_id) : null;
      if (!scope.connection_id || !conn || !conn.enabled) throw sessionsErrors.needs_login("云端账号登录已失效或未连接");
    }
    resolveDerivedSnapshot(snapshot, store, ports);
    const root = tool.surface === "cloud" ? null : resolveLocalToolRoot(tool, ports).root;
    return { tool, adapter, root, connectionId: scope.connection_id };
  });

  const ctx: AdapterSourceContext = {
    tool: precheck.tool, entry_id: precheck.tool.id, location_key: input.location_key,
    root: precheck.root, connection_id: precheck.connectionId, ports,
  };

  let found: Awaited<ReturnType<NonNullable<ExternalSessionSourceAdapter["searchTool"]>>>;
  try {
    found = await precheck.adapter.searchTool!(ctx, query, limit, signal);
  } catch (error) {
    rethrowAdapterError(error, precheck.tool.id, input.location_key, store, ports);
  }

  await caller.beforeEffect?.();
  return ports.projects.read(postSnapshot => {
    signal.throwIfAborted();
    caller.assert_authority_current?.();
    const currentScope = store.decisions.getReadScope(precheck.tool.id, input.location_key);
    if (!isSourceCurrentlyAllowed(currentScope ?? undefined, precheck.tool.surface, ports) || currentScope!.connection_id !== precheck.connectionId) {
      throw sessionsErrors.scope_changed("读取范围在搜索期间已变化");
    }

    const { dirMap, workspaces, projectMap } = resolveDerivedSnapshot(postSnapshot, store, ports, { allowDiskIdentify: false });
    const scopeMap = new Map([[`${currentScope!.entry_id}\0${currentScope!.location_key}`, currentScope!]]);
    const decisionMap = store.decisions.allAttributionDecisions();
    const suggestionMap = store.decisions.allSuggestions();
    const duplicateLocal = store.duplicateLocalNativeKeys();

    const sessions: ExternalSessionRow[] = [];
    let skippedCount = found.skipped_count;
    const seenKeys = new Set<string>();
    for (const nativeId of found.native_ids) {
      const key = sessionKeyForIdentity({ entry_id: precheck.tool.id, location_key: input.location_key, native_id: nativeId });
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const stored = store.getSession(key);
      if (!stored || !isSessionInScopeWithMaps(stored, scopeMap, dirMap, workspaces, ports, false)) {
        skippedCount++;
        continue;
      }
      const { row } = materializeFullRow(stored, dirMap, decisionMap, suggestionMap, postSnapshot.bindings, projectMap, duplicateLocal);
      sessions.push(row);
      if (sessions.length >= limit) break;
    }

    return { sessions, skipped_count: skippedCount, trust: "untrusted" };
  });
}

export async function runSearchEntries(
  input: SearchEntriesInput,
  caller: SessionsCaller,
  store: SessionsStore,
  ports: SessionsPorts,
): Promise<SearchEntriesPage> {
  assertPersonalCaller(caller);
  return ports.projects.read(snapshot => {
    const { dirDigest, dirMap, workspaces } = resolveDerivedSnapshot(snapshot, store, ports);
    const scopes = store.decisions.readScopes();
    const scopeMap = new Map(scopes.map(s => [`${s.entry_id}\0${s.location_key}`, s]));

    const entries: SearchEntry[] = [];
    for (const session of store.activeSessionsOrdered()) {
      if (!isSessionInScopeWithMaps(session, scopeMap, dirMap, workspaces, ports)) continue;
      const tool = findTopLevelTool(session.entry_id);
      if (!tool) continue;
      entries.push(
        externalSessionSearchEntry({
          session_key: session.session_key,
          tool: { entry_id: session.entry_id, display_name: tool.display_name, surface: tool.surface, region: tool.region },
          title: session.title, directory: session.directory_path, last_activity_at: session.last_activity_at,
        }),
      );
    }

    const paged = searchEntriesPage(entries, input);
    return {
      ...paged,
      collection_revision: `${paged.collection_revision}-${store.scopeRevision()}-${dirDigest.slice(0, 12)}`,
    };
  });
}

export async function runSubjectRead(
  request: SubjectContextRequest,
  caller: SessionsCaller,
  store: SessionsStore,
  ports: SessionsPorts,
): Promise<ActionSubjectContext> {
  assertPersonalCaller(caller);
  return ports.projects.read(snapshot => {
    const session = store.getSession(request.subject_id);
    if (!session) throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
    const { dirMap, workspaces } = resolveDerivedSnapshot(snapshot, store, ports);
    const scopeMap = new Map(store.decisions.readScopes().map(s => [`${s.entry_id}\0${s.location_key}`, s]));
    if (!isSessionInScopeWithMaps(session, scopeMap, dirMap, workspaces, ports)) {
      throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
    }
    const tool = findTopLevelTool(session.entry_id);
    if (!tool) throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");

    const searchRow = externalSessionSearchEntry({
      session_key: session.session_key,
      tool: { entry_id: session.entry_id, display_name: tool.display_name, surface: tool.surface, region: tool.region },
      title: session.title, directory: session.directory_path, last_activity_at: session.last_activity_at,
    });
    const contentLines = [
      `工具：${tool.display_name}`,
      session.directory_path ? `目录：${session.directory_path}` : null,
      `最近活动：${session.last_activity_at}`,
    ].filter((line): line is string => line !== null);

    return subjectContext(
      {
        subject: { kind: EXTERNAL_SESSION_SUBJECT_KIND, id: session.session_key },
        revision: searchRow.revision,
        title: searchRow.title,
        content: contentLines.join("\n"),
        ...(searchRow.open ? { open: searchRow.open } : {}),
      },
      request,
    );
  });
}
