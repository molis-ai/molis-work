import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import type { ConnectorUsage, ConnectorUsagesInput } from "@molis-ai/molis-work-contracts/services/connector-host";
import {
  SESSIONS_PROVIDER_ID,
  externalSessionConnectionLocation,
  sessionsActions,
  sessionsErrors,
  type ExternalSessionAttributionInput,
  type ExternalSessionDiscoveryRunInput,
  type ExternalSessionDiscoveryRunOutput,
  type ExternalSessionProjectAiRead,
  type ExternalSessionProjectAiReadSetInput,
  type ExternalSessionProjectCounts,
  type ExternalSessionReadScope,
  type ExternalSessionRow,
  type ExternalSessionScopeReadInput,
  type ExternalSessionScopeSetInput,
  type ExternalSessionScopeSource,
  type ExternalSessionScopeView,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { hasSessionAdapter } from "./adapters/index.js";
import { isSessionDirectoryAllowedByScope, type PreparedLinkedWorkspace } from "./attribution.js";
import { type DiscoveryCoordinator, resolveLocalToolRoot } from "./discovery.js";
import type { SessionProjectSnapshot, SessionsPorts } from "./ports.js";
import {
  assertPersonalCaller,
  findTopLevelTool,
  isLocationActiveForTool,
  isSessionInScopeWithMaps,
  isSourceCurrentlyAllowed,
  materializeFullRow,
  nowIso,
  resolveDerivedSnapshot,
  topLevelTools,
  type SessionsCaller,
} from "./runtime-view.js";
import type { SessionsStore, StoredDirectoryRow } from "./store.js";

function buildScopeSources(
  scopes: readonly ExternalSessionReadScope[],
  ports: SessionsPorts,
): ExternalSessionScopeSource[] {
  const scopesByEntry = new Map<ExternalToolId, ExternalSessionReadScope[]>();
  for (const scope of scopes) {
    const list = scopesByEntry.get(scope.entry_id) ?? [];
    list.push(scope);
    scopesByEntry.set(scope.entry_id, list);
  }

  const sources: ExternalSessionScopeSource[] = [];
  for (const tool of topLevelTools()) {
    const entryId = tool.id;
    const adapter = hasSessionAdapter(entryId) ? ("available" as const) : ("none" as const);
    const connMeta = tool.surface === "cloud"
      ? ports.connections.choices(tool)
      : { choices: [], connect_service_id: null };

    if (tool.surface === "cloud") {
      const cloudScopes = scopesByEntry.get(entryId) ?? [];
      if (cloudScopes.length === 0) {
        sources.push({
          entry_id: entryId, location_key: null, display_name: tool.display_name, allowed: false,
          directories: { mode: "linked_projects" }, connection_id: null, revision: 0, decided_at: null,
          adapter, connections: [...connMeta.choices], connect_service_id: connMeta.connect_service_id,
        });
      } else {
        for (const scope of cloudScopes) {
          sources.push({
            ...scope, display_name: tool.display_name, adapter,
            connections: [...connMeta.choices], connect_service_id: connMeta.connect_service_id,
          });
        }
      }
      continue;
    }

    const { locationKey } = resolveLocalToolRoot(tool, ports);
    const scope = (scopesByEntry.get(entryId) ?? []).find(s => s.location_key === locationKey);
    sources.push({
      entry_id: entryId, location_key: locationKey, display_name: tool.display_name,
      allowed: scope?.allowed ?? false, directories: scope?.directories ?? { mode: "linked_projects" },
      connection_id: null, revision: scope?.revision ?? 0, decided_at: scope?.decided_at ?? null,
      adapter, connections: [], connect_service_id: null,
    });
  }
  return sources;
}

function foldProjectSessionCounts(
  snapshot: SessionProjectSnapshot,
  scopes: readonly ExternalSessionReadScope[],
  dirMap: ReadonlyMap<string, StoredDirectoryRow>,
  workspaces: readonly PreparedLinkedWorkspace[],
  store: SessionsStore,
  ports: SessionsPorts,
): Map<string, ExternalSessionProjectCounts> {
  const countsByProject = new Map<string, {
    ai_readable: number;
    reported: number;
    blockedByTool: Map<ExternalToolId, number>;
  }>();
  for (const proj of snapshot.projects) {
    countsByProject.set(proj.project_id, { ai_readable: 0, reported: 0, blockedByTool: new Map() });
  }

  const scopeMap = new Map(scopes.map(s => [`${s.entry_id}\0${s.location_key}`, s]));
  for (const g of store.decisions.aggregateProjectSessionGroups()) {
    const tool = findTopLevelTool(g.entry_id);
    if (!tool) continue;

    let targetProjectId: string | null = null;
    let kind: "filed" | "reported" | null = null;
    if (g.decision === "leave_unfiled") {
      targetProjectId = null;
    } else if (g.decision === "project" && g.decision_project_id && countsByProject.has(g.decision_project_id)) {
      targetProjectId = g.decision_project_id;
      kind = "filed";
    } else if (g.decision !== "project" && g.derived_state === "automatic" && g.derived_project_id && countsByProject.has(g.derived_project_id)) {
      targetProjectId = g.derived_project_id;
      kind = "filed";
    } else if (g.decision !== "project" && g.derived_state !== "ambiguous" && g.reported_project_id && countsByProject.has(g.reported_project_id)) {
      targetProjectId = g.reported_project_id;
      kind = "reported";
    }
    if (!targetProjectId || !kind) continue;

    const bucket = countsByProject.get(targetProjectId)!;
    const scope = scopeMap.get(`${g.entry_id}\0${g.location_key}`);
    if (!isSourceCurrentlyAllowed(scope, tool, ports)) {
      bucket.blockedByTool.set(g.entry_id, (bucket.blockedByTool.get(g.entry_id) ?? 0) + g.count);
      continue;
    }
    if (scope!.directories.mode === "linked_projects") {
      const dirRow = g.directory_key ? dirMap.get(g.directory_key) : undefined;
      const identity = dirRow && dirRow.realpath_verified
        ? { real_path: dirRow.path, repository_key: dirRow.repository_key, worktree_relative: dirRow.worktree_relative }
        : null;
      if (!isSessionDirectoryAllowedByScope(scope!.directories, identity, workspaces)) continue;
    }
    if (kind === "reported") bucket.reported += g.count;
    else bucket.ai_readable += g.count;
  }

  const materialized = new Map<string, ExternalSessionProjectCounts>();
  for (const proj of snapshot.projects) {
    const c = countsByProject.get(proj.project_id)!;
    const blocked: ExternalSessionProjectCounts["blocked"] = [];
    let blockedSum = 0;
    for (const tool of topLevelTools()) {
      const bCount = c.blockedByTool.get(tool.id) ?? 0;
      if (bCount > 0) {
        blocked.push({ entry_id: tool.id, display_name: tool.display_name, count: bCount });
        blockedSum += bCount;
      }
    }
    materialized.set(proj.project_id, {
      filed: c.ai_readable + c.reported + blockedSum,
      ai_readable: c.ai_readable,
      reported: c.reported,
      blocked,
    });
  }
  return materialized;
}

export function buildScopeViewSync(
  snapshot: SessionProjectSnapshot,
  currentProjectId: string | undefined,
  includeCounts: boolean,
  store: SessionsStore,
  ports: SessionsPorts,
): ExternalSessionScopeView {
  const { dirMap, workspaces } = resolveDerivedSnapshot(snapshot, store, ports);
  const scopes = store.decisions.readScopes();
  const sources = buildScopeSources(scopes, ports);
  const aiReadsMap = store.decisions.projectAiReads();
  const countsMap = includeCounts
    ? foldProjectSessionCounts(snapshot, scopes, dirMap, workspaces, store, ports)
    : null;

  const dirsByProject = new Map<string, string[]>();
  for (const ws of workspaces) {
    for (const pid of ws.person_project_ids) {
      const list = dirsByProject.get(pid) ?? [];
      list.push(ws.canonical_path);
      dirsByProject.set(pid, list);
    }
  }

  const projectAiReads: ExternalSessionProjectAiRead[] = snapshot.projects.map(project => {
    const stored = aiReadsMap.get(project.project_id);
    return {
      project: { project_id: project.project_id, display_name: project.display_name },
      directories: dirsByProject.get(project.project_id) ?? [],
      current: currentProjectId === project.project_id,
      allowed: stored?.allowed ?? false,
      revision: stored?.revision ?? 0,
      decided_at: stored?.decided_at ?? null,
      counts: countsMap ? (countsMap.get(project.project_id) ?? null) : null,
    };
  });

  return {
    sources,
    project_ai_reads: projectAiReads,
    scope_revision: store.scopeRevision(),
  };
}

export async function runScopeRead(
  input: ExternalSessionScopeReadInput,
  caller: SessionsCaller,
  store: SessionsStore,
  ports: SessionsPorts,
): Promise<ExternalSessionScopeView> {
  assertPersonalCaller(caller);
  const includeCounts = input.include_counts !== false;
  return ports.projects.read(snapshot => buildScopeViewSync(snapshot, caller.project_id ?? undefined, includeCounts, store, ports));
}

function validateScopeSetWrites(
  sources: ExternalSessionScopeSetInput["sources"],
  ports: SessionsPorts,
): {
  seenTargetKeys: Set<string>;
  preparedWrites: Array<{
    entry_id: ExternalToolId;
    location_key: string;
    allowed: boolean;
    directories: ExternalSessionReadScope["directories"];
    connection_id: string | null;
  }>;
} {
  const seenTargetKeys = new Set<string>();
  const preparedWrites: Array<{
    entry_id: ExternalToolId;
    location_key: string;
    allowed: boolean;
    directories: ExternalSessionReadScope["directories"];
    connection_id: string | null;
  }> = [];

  for (const item of sources) {
    const tool = findTopLevelTool(item.entry_id);
    if (!tool) throw sessionsErrors.source_unsupported(`未知的外部工具：${item.entry_id}`);
    if (item.allowed && !hasSessionAdapter(tool.id)) {
      throw sessionsErrors.source_unsupported(`暂不支持读取 ${tool.display_name} 的会话`);
    }

    let locationKey: string;
    let connectionId: string | null = null;
    if (tool.surface === "cloud") {
      if (item.connection_id) {
        const choices = ports.connections.choices(tool).choices;
        const currentConn = ports.connections.current(item.connection_id);
        if (!choices.some(c => c.connection_id === item.connection_id) || !currentConn || (item.allowed && !currentConn.enabled)) {
          throw new ActionError("actions.connection_unavailable", "所选云端账号连接不可用或已失效");
        }
        connectionId = item.connection_id;
        locationKey = externalSessionConnectionLocation(item.connection_id);
      } else if (item.allowed) {
        throw new ActionError("actions.connection_required", `允许读取 ${tool.display_name} 前请先选择账号连接`);
      } else {
        continue;
      }
    } else {
      if (item.connection_id !== undefined) {
        throw new ActionError("actions.input_invalid", "本机工具来源不能指定云端账号连接");
      }
      locationKey = resolveLocalToolRoot(tool, ports).locationKey;
    }

    const dedupKey = `${tool.id}\0${locationKey}`;
    if (seenTargetKeys.has(dedupKey)) {
      throw new ActionError("actions.input_invalid", `来源 ${tool.display_name} 在同一次请求中重复出现`);
    }
    seenTargetKeys.add(dedupKey);
    preparedWrites.push({
      entry_id: tool.id, location_key: locationKey, allowed: item.allowed,
      directories: item.directories, connection_id: connectionId,
    });
  }
  return { seenTargetKeys, preparedWrites };
}

export async function runScopeSet(
  input: ExternalSessionScopeSetInput,
  caller: SessionsCaller,
  store: SessionsStore,
  discovery: DiscoveryCoordinator,
  ports: SessionsPorts,
): Promise<ExternalSessionScopeView> {
  assertPersonalCaller(caller);

  const outcome = await ports.projects.read(snapshot => {
    if (store.scopeRevision() !== input.expected_revision) {
      throw sessionsErrors.scope_conflict("读取范围刚刚变动过，请刷新后再试");
    }
    const { seenTargetKeys, preparedWrites } = validateScopeSetWrites(input.sources, ports);
    const previousScopes = new Map(store.decisions.readScopes().map(s => [`${s.entry_id}\0${s.location_key}`, s]));
    const now = nowIso(ports);
    const narrowed: Array<{ entry_id: ExternalToolId; location_key: string }> = [];
    const widened: Array<{ entry_id: ExternalToolId; location_key: string }> = [];

    store.inTransaction(() => {
      for (const write of preparedWrites) {
        const prev = previousScopes.get(`${write.entry_id}\0${write.location_key}`);
        if (prev && prev.allowed && (!write.allowed || (prev.directories.mode === "all" && write.directories.mode === "linked_projects"))) {
          narrowed.push({ entry_id: write.entry_id, location_key: write.location_key });
        } else if (write.allowed && (!prev || !prev.allowed || (prev.directories.mode === "linked_projects" && write.directories.mode === "all"))) {
          widened.push({ entry_id: write.entry_id, location_key: write.location_key });
        }
        store.decisions.upsertReadScope({ ...write, decided_at: now });
      }

      for (const [key, prev] of previousScopes.entries()) {
        if (seenTargetKeys.has(key) || !prev.allowed) continue;
        narrowed.push({ entry_id: prev.entry_id, location_key: prev.location_key });
        store.decisions.upsertReadScope({
          entry_id: prev.entry_id, location_key: prev.location_key, allowed: false,
          directories: prev.directories, connection_id: prev.connection_id, decided_at: now,
        });
      }
      store.bumpScopeRevision();
    });

    const view = buildScopeViewSync(snapshot, caller.project_id ?? undefined, true, store, ports);
    return { view, narrowed, widened };
  });

  for (const item of outcome.narrowed) discovery.cancelSource(item.entry_id, item.location_key);
  ports.searchChanged();
  for (const item of outcome.widened) discovery.enqueue(item.entry_id, item.location_key, true);
  return outcome.view;
}

export async function runProjectAiReadSet(
  input: ExternalSessionProjectAiReadSetInput,
  caller: SessionsCaller,
  store: SessionsStore,
  ports: SessionsPorts,
): Promise<ExternalSessionProjectAiRead> {
  assertPersonalCaller(caller);
  const projectId = caller.project_id;
  if (!projectId) throw sessionsErrors.project_required("请指定目标项目后再更改 AI 读取许可");

  return ports.projects.read(snapshot => {
    const project = snapshot.projects.find(item => item.project_id === projectId);
    if (!project) throw sessionsErrors.project_unavailable("目标项目不存在或已被移除");
    const { workspaces } = resolveDerivedSnapshot(snapshot, store, ports);
    const updated = store.inTransaction(() =>
      store.decisions.setProjectAiRead(projectId, input.allowed, input.expected_revision, caller.actor_id, nowIso(ports)),
    );
    const directories = workspaces.filter(ws => ws.person_project_ids.includes(projectId)).map(ws => ws.canonical_path);
    return {
      project: { project_id: project.project_id, display_name: project.display_name },
      directories, current: true, allowed: updated.allowed, revision: updated.revision, decided_at: updated.decided_at, counts: null,
    };
  });
}

export async function runDiscovery(
  input: ExternalSessionDiscoveryRunInput,
  caller: SessionsCaller,
  store: SessionsStore,
  discovery: DiscoveryCoordinator,
  ports: SessionsPorts,
): Promise<ExternalSessionDiscoveryRunOutput> {
  assertPersonalCaller(caller);
  if (input.entry_id !== undefined) {
    const tool = findTopLevelTool(input.entry_id);
    if (!tool || !hasSessionAdapter(tool.id)) {
      throw sessionsErrors.source_unsupported("该外部工具暂不支持自动发现会话");
    }
    const scopes = store.decisions.readScopes().filter(s => s.entry_id === tool.id && s.allowed && isLocationActiveForTool(tool, s.location_key, ports));
    if (scopes.length === 0) throw sessionsErrors.not_allowed("该外部工具尚未在读取范围中允许读取");
    const queued: ExternalToolId[] = [];
    for (const scope of scopes) {
      if (!isSourceCurrentlyAllowed(scope, tool, ports)) continue;
      discovery.enqueue(scope.entry_id, scope.location_key, true);
      if (!queued.includes(scope.entry_id)) queued.push(scope.entry_id);
    }
    return { queued };
  }

  const queued: ExternalToolId[] = [];
  for (const scope of store.decisions.readScopes()) {
    const tool = findTopLevelTool(scope.entry_id);
    if (!tool || !hasSessionAdapter(scope.entry_id)) continue;
    if (!isSourceCurrentlyAllowed(scope, tool, ports)) continue;
    discovery.enqueue(scope.entry_id, scope.location_key, true);
    if (!queued.includes(scope.entry_id)) queued.push(scope.entry_id);
  }
  return { queued };
}

export async function runAttributionSet(
  input: ExternalSessionAttributionInput,
  caller: SessionsCaller,
  store: SessionsStore,
  ports: SessionsPorts,
): Promise<ExternalSessionRow> {
  assertPersonalCaller(caller);
  const row = await ports.projects.read(snapshot => {
    const session = store.getSession(input.session_key);
    if (!session) throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
    const { dirMap, workspaces, projectMap } = resolveDerivedSnapshot(snapshot, store, ports);
    const scopeMap = new Map(store.decisions.readScopes().map(s => [`${s.entry_id}\0${s.location_key}`, s]));
    if (!isSessionInScopeWithMaps(session, scopeMap, dirMap, workspaces, ports)) {
      throw sessionsErrors.not_found("外部会话不存在或不在读取范围内");
    }

    let targetProjectId: string | null = null;
    let basis: "user_chose" | "suggestion_accepted" | null = null;
    if (input.decision.kind === "project") {
      if (!projectMap.has(input.decision.project_id)) {
        throw sessionsErrors.project_unavailable("目标项目不存在或已被移除");
      }
      targetProjectId = input.decision.project_id;
      basis = input.decision.suggestion_accepted === true ? "suggestion_accepted" : "user_chose";
    }

    store.inTransaction(() => {
      store.decisions.setAttributionDecision({
        session_key: session.session_key, decision: input.decision.kind,
        project_id: targetProjectId, basis, expected_revision: input.expected_revision,
        actor_id: caller.actor_id, decided_at: nowIso(ports),
      });
    });

    const materialized = materializeFullRow(
      session, dirMap, store.decisions.allAttributionDecisions(),
      store.decisions.allSuggestions(), snapshot.bindings, projectMap, store.duplicateLocalNativeKeys(),
    );
    if (materialized.resolved.reported_project_id !== session.reported_project_id) {
      store.updateReportedProjectId(session.session_key, materialized.resolved.reported_project_id);
    }
    return materialized.row;
  });

  ports.searchChanged();
  return row;
}

export async function runConnectorUsages(
  input: ConnectorUsagesInput,
  caller: SessionsCaller,
  store: SessionsStore,
): Promise<{ usages: ConnectorUsage[] }> {
  assertPersonalCaller(caller);
  const usages: ConnectorUsage[] = [];
  for (const scope of store.decisions.readScopes()) {
    if (scope.connection_id !== input.connection_id) continue;
    const tool = findTopLevelTool(scope.entry_id);
    usages.push({
      usage_id: `sessions-scope:${scope.entry_id}:${scope.location_key}`,
      title: `外部会话读取范围：${tool?.display_name ?? scope.entry_id}`,
      detail: scope.allowed ? "当前允许读取" : "已记录（当前未允许读取）",
      enabled: scope.allowed,
      actions: [
        {
          action: {
            capability_id: sessionsActions.scopeRead.capability_id,
            version: sessionsActions.scopeRead.version,
            provider_id: SESSIONS_PROVIDER_ID,
          },
          input: {},
        },
      ],
    });
  }
  return { usages };
}
