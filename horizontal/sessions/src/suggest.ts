import { createHash } from "node:crypto";
import type { ActionCallContext, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { EXTERNAL_TOOLS, type ExternalToolEntry, type ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { MODEL_DATA_MAX_CHARS } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import {
  EXTERNAL_SESSION_SUGGEST_MAX_GROUPS,
  EXTERNAL_SESSION_SUGGESTION_REASON_MAX_CHARS,
  sessionsErrors,
  type ExternalSessionAttributionSuggestInput,
  type ExternalSessionAttributionSuggestOutput,
  type ExternalSessionReadScope,
  type ExternalSessionSuggestion,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { canonicalJsonText, redactSecrets } from "@molis-ai/molis-work-plugin-sdk";
import { cutCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { getSessionAdapter } from "./adapters/index.js";
import { canonicalEntryId, prepareLinkedWorkspaces, type PreparedLinkedWorkspace } from "./attribution.js";
import { resolveLocalToolRoot } from "./discovery.js";
import type {
  AdapterSourceContext,
  SessionAttributionSuggester,
  SessionProjectSnapshot,
  SessionSuggestDraft,
  SessionSuggestDraftItem,
  SessionSuggestGroupMaterial,
  SessionSuggestInput,
  SessionSuggestProjectMaterial,
  SessionsPorts,
} from "./ports.js";
import { materializeSuggestion, type SessionsStore, type StoredExternalSessionRow } from "./store.js";

const OPENING_MAX_MESSAGES = 3;
const OPENING_MESSAGE_MAX_CHARS = 300;
const TITLES_MAX_PER_GROUP = 5;
const EVIDENCE_MAX_ITEMS = 4;
const EVIDENCE_TEXT_MAX_CHARS = 200;
const SUGGEST_INPUT_BUDGET_CHARS = Math.min(MODEL_DATA_MAX_CHARS - 8_000, 160_000);

interface PreparedGroup {
  group_id: string;
  directory: string | null;
  sessions: StoredExternalSessionRow[];
  tools: string[];
  titles: string[];
  input_digest: string;
}

interface InitialSuggestionPlan {
  inScopeOrder: string[];
  uncachedGroups: PreparedGroup[];
  cachedResults: Map<string, ExternalSessionSuggestion>;
  projectMaterials: SessionSuggestProjectMaterial[];
  projectIdsByRef: string[];
  scopeMap: Map<string, ExternalSessionReadScope>;
}

function computeGroupInputDigest(
  directory: string | null,
  tools: readonly string[],
  titles: readonly string[],
  projects: readonly SessionSuggestProjectMaterial[],
  promptVersion: number,
): string {
  return createHash("sha256")
    .update(
      canonicalJsonText({
        directory,
        tools: [...tools].sort(),
        titles,
        projects: projects.map(p => ({ name: p.name, directories: [...p.directories].sort() })),
        prompt_version: promptVersion,
      }, "null"),
    )
    .digest("hex")
    .slice(0, 32);
}

function buildProjectMaterials(
  snapshot: SessionProjectSnapshot,
  workspaces: readonly PreparedLinkedWorkspace[],
): { materials: SessionSuggestProjectMaterial[]; projectIdsByRef: string[] } {
  const dirsByProject = new Map<string, string[]>();
  for (const ws of workspaces) {
    for (const pid of ws.person_project_ids) {
      const list = dirsByProject.get(pid) ?? [];
      list.push(ws.canonical_path);
      dirsByProject.set(pid, list);
    }
  }
  const materials: SessionSuggestProjectMaterial[] = [];
  const projectIdsByRef: string[] = [];
  snapshot.projects.forEach((proj, idx) => {
    materials.push({
      ref: idx,
      name: redactSecrets(cutCharacters(proj.display_name, 120)),
      directories: (dirsByProject.get(proj.project_id) ?? []).slice(0, 10),
    });
    projectIdsByRef.push(proj.project_id);
  });
  return { materials, projectIdsByRef };
}

async function readOpeningMessages(
  session: StoredExternalSessionRow,
  scopeConnectionId: string | null,
  ports: SessionsPorts,
  signal: AbortSignal,
): Promise<string[]> {
  const adapter = getSessionAdapter(session.entry_id);
  if (!adapter?.readHistory) return [];
  const tool = (EXTERNAL_TOOLS as readonly (ExternalToolEntry & { id: ExternalToolId })[]).find(
    item => canonicalEntryId(item) === session.entry_id && !item.shares_sessions_with,
  );
  if (!tool) return [];
  const root = tool.surface === "cloud" ? null : resolveLocalToolRoot(tool, ports).root;
  const ctx: AdapterSourceContext = {
    tool, entry_id: session.entry_id, location_key: session.location_key, root, connection_id: scopeConnectionId, ports,
  };
  try {
    const out = await adapter.readHistory(ctx, session.native_id, { limit: 100 }, signal);
    const messages: string[] = [];
    for (const entry of out.entries) {
      if (entry.role !== "you") continue;
      const cleaned = redactSecrets(cutCharacters(entry.text.replace(/\s+/gu, " ").trim(), OPENING_MESSAGE_MAX_CHARS));
      if (cleaned) messages.push(cleaned);
      if (messages.length >= OPENING_MAX_MESSAGES) break;
    }
    return messages;
  } catch (error) {
    if (signal.aborted) throw error;
    return [];
  }
}

function prepareSuggestionGroups(
  input: ExternalSessionAttributionSuggestInput,
  promptVersion: number,
  store: SessionsStore,
  ports: SessionsPorts,
  isSessionInScopeSync: (session: StoredExternalSessionRow, snapshot: SessionProjectSnapshot, workspaces: readonly PreparedLinkedWorkspace[]) => boolean,
): Promise<InitialSuggestionPlan> {
  return ports.projects.read(snapshot => {
    const prepared = prepareLinkedWorkspaces(snapshot, pathValue => ports.directories.identify(pathValue));
    const { materials: projectMaterials, projectIdsByRef } = buildProjectMaterials(snapshot, prepared.workspaces);
    const scopeMap = new Map(store.decisions.readScopes().map(s => [`${s.entry_id}\0${s.location_key}`, s]));

    const inScopeRows: StoredExternalSessionRow[] = [];
    for (const key of input.session_keys) {
      const row = store.getSession(key);
      if (row && isSessionInScopeSync(row, snapshot, prepared.workspaces)) inScopeRows.push(row);
    }

    const groupMap = new Map<string, StoredExternalSessionRow[]>();
    for (const row of inScopeRows) {
      const groupKey = row.directory_key ?? `single:${row.session_key}`;
      const bucket = groupMap.get(groupKey) ?? [];
      bucket.push(row);
      groupMap.set(groupKey, bucket);
    }

    if (groupMap.size > EXTERNAL_SESSION_SUGGEST_MAX_GROUPS) {
      throw sessionsErrors.too_many_groups(`一次最多请求 ${EXTERNAL_SESSION_SUGGEST_MAX_GROUPS} 个目录组的归属建议`);
    }

    const cachedResults = new Map<string, ExternalSessionSuggestion>();
    const uncachedGroups: PreparedGroup[] = [];
    for (const [groupKey, rows] of groupMap.entries()) {
      rows.sort((a, b) => (a.last_activity_at > b.last_activity_at ? -1 : a.last_activity_at < b.last_activity_at ? 1 : 0));
      const directory = rows[0]?.directory_path ?? null;
      const tools = [...new Set(rows.map(r => r.entry_id))];
      const titles: string[] = [];
      for (const r of rows) {
        if (!r.title) continue;
        const clean = redactSecrets(cutCharacters(r.title, 200));
        if (clean && !titles.includes(clean)) {
          titles.push(clean);
          if (titles.length >= TITLES_MAX_PER_GROUP) break;
        }
      }
      const digest = computeGroupInputDigest(directory, tools, titles, projectMaterials, promptVersion);
      const group: PreparedGroup = { group_id: groupKey, directory, sessions: rows, tools, titles, input_digest: digest };

      if (!input.retry && rows.every(row => {
        const existing = store.decisions.getSuggestion(row.session_key);
        return Boolean(existing && existing.status !== "failed" && existing.input_digest === digest && existing.prompt_version === promptVersion);
      })) {
        for (const row of rows) {
          const materialized = materializeSuggestion(store.decisions.getSuggestion(row.session_key), prepared.projectMap);
          if (materialized) cachedResults.set(row.session_key, materialized);
        }
        continue;
      }
      uncachedGroups.push(group);
    }

    return { inScopeOrder: inScopeRows.map(r => r.session_key), uncachedGroups, cachedResults, projectMaterials, projectIdsByRef, scopeMap };
  });
}

async function queryModelForGroups(
  suggester: SessionAttributionSuggester | null,
  initial: InitialSuggestionPlan,
  ports: SessionsPorts,
  signal: AbortSignal,
  beforeDispatch: () => void | Promise<void>,
): Promise<{ draft: SessionSuggestDraft | null; modelFailed: boolean }> {
  if (!suggester) return { draft: null, modelFailed: true };
  const groupMaterials: SessionSuggestGroupMaterial[] = [];
  for (let idx = 0; idx < initial.uncachedGroups.length; idx++) {
    signal.throwIfAborted();
    const group = initial.uncachedGroups[idx]!;
    const lead = group.sessions[0]!;
    const scopeRow = initial.scopeMap.get(`${lead.entry_id}\0${lead.location_key}`);
    const opening = await readOpeningMessages(lead, scopeRow?.connection_id ?? null, ports, signal);
    groupMaterials.push({
      ref: idx,
      tools: group.tools,
      directory: group.directory ? redactSecrets(cutCharacters(group.directory, 300)) : null,
      titles: group.titles,
      opening,
    });
  }

  let suggestInput: SessionSuggestInput = { groups: groupMaterials, projects: initial.projectMaterials };
  if (canonicalJsonText(suggestInput, "null").length > SUGGEST_INPUT_BUDGET_CHARS) {
    suggestInput = {
      groups: groupMaterials.map(g => ({ ...g, opening: g.opening.slice(0, 1) })),
      projects: initial.projectMaterials,
    };
  }
  try {
    const draft = await suggester.suggest(suggestInput, signal, beforeDispatch);
    return { draft, modelFailed: false };
  } catch (error) {
    if (signal.aborted) throw error;
    return { draft: null, modelFailed: true };
  }
}

function sanitizeDraftItem(
  rawItem: SessionSuggestDraftItem | undefined,
  modelFailed: boolean,
  projectIdsByRef: readonly string[],
  projectMap: ReadonlyMap<string, { project_id: string; display_name: string }>,
): {
  status: "ready" | "no_match" | "failed";
  chosenProjectId: string | null;
  alternativeIds: string[];
  reason: string;
  evidence: Array<{ kind: "directory" | "title" | "message"; text: string }>;
} {
  let chosenProjectId: string | null = null;
  const alternativeIds: string[] = [];
  let reason = "";
  const evidence: Array<{ kind: "directory" | "title" | "message"; text: string }> = [];
  let status: "ready" | "no_match" | "failed" = modelFailed ? "failed" : "no_match";
  if (modelFailed || !rawItem) return { status, chosenProjectId, alternativeIds, reason, evidence };

  if (typeof rawItem.project === "number" && Number.isInteger(rawItem.project) && rawItem.project >= 0 && rawItem.project < projectIdsByRef.length) {
    const pid = projectIdsByRef[rawItem.project]!;
    if (projectMap.has(pid)) {
      chosenProjectId = pid;
      status = "ready";
    }
  }
  if (Array.isArray(rawItem.alternatives)) {
    for (const altRef of rawItem.alternatives) {
      if (typeof altRef === "number" && Number.isInteger(altRef) && altRef >= 0 && altRef < projectIdsByRef.length) {
        const pid = projectIdsByRef[altRef]!;
        if (pid !== chosenProjectId && projectMap.has(pid) && !alternativeIds.includes(pid)) alternativeIds.push(pid);
      }
    }
  }
  if (typeof rawItem.reason === "string") {
    reason = cutCharacters(redactSecrets(rawItem.reason.replace(/\s+/gu, " ").trim()), EXTERNAL_SESSION_SUGGESTION_REASON_MAX_CHARS);
  }
  if (Array.isArray(rawItem.evidence)) {
    for (const ev of rawItem.evidence.slice(0, EVIDENCE_MAX_ITEMS)) {
      if (ev && (ev.kind === "directory" || ev.kind === "title" || ev.kind === "message") && typeof ev.text === "string" && ev.text.trim()) {
        evidence.push({ kind: ev.kind, text: cutCharacters(redactSecrets(ev.text.replace(/\s+/gu, " ").trim()), EVIDENCE_TEXT_MAX_CHARS) });
      }
    }
  }
  return { status, chosenProjectId, alternativeIds, reason, evidence };
}

export async function runAttributionSuggest(
  input: ExternalSessionAttributionSuggestInput,
  caller: ActionCallContext & Partial<Pick<ActionExecutionContext, "beforeEffect">>,
  store: SessionsStore,
  ports: SessionsPorts,
  isSessionInScopeSync: (session: StoredExternalSessionRow, snapshot: SessionProjectSnapshot, workspaces: readonly PreparedLinkedWorkspace[]) => boolean,
): Promise<ExternalSessionAttributionSuggestOutput> {
  const signal = caller.signal ?? AbortSignal.any([]);
  const suggester = typeof ports.suggester === "function" ? ports.suggester() : ports.suggester;
  const promptVersion = suggester ? suggester.promptVersion() : 0;

  const initial = await prepareSuggestionGroups(input, promptVersion, store, ports, isSessionInScopeSync);
  if (initial.inScopeOrder.length === 0) return { suggestions: [] };

  if (initial.uncachedGroups.length === 0) {
    return {
      suggestions: initial.inScopeOrder
        .map(key => ({ session_key: key, suggestion: initial.cachedResults.get(key) }))
        .filter((item): item is { session_key: string; suggestion: ExternalSessionSuggestion } => item.suggestion !== undefined),
    };
  }

  const { draft, modelFailed } = await queryModelForGroups(suggester ?? null, initial, ports, signal, () => caller.beforeEffect?.());

  await caller.beforeEffect?.();
  const nowIso = (ports.clock ?? (() => new Date()))().toISOString();

  return ports.projects.read(postSnapshot => {
    signal.throwIfAborted();
    caller.assert_authority_current?.();
    const prepared = prepareLinkedWorkspaces(postSnapshot, pathValue => ports.directories.identify(pathValue));
    const draftByGroup = new Map<number, SessionSuggestDraftItem>();
    if (draft && Array.isArray(draft.items)) {
      for (const item of draft.items) {
        if (typeof item.group === "number" && Number.isInteger(item.group) && item.group >= 0 && item.group < initial.uncachedGroups.length) {
          draftByGroup.set(item.group, item);
        }
      }
    }

    const freshByKey = new Map<string, ExternalSessionSuggestion>(initial.cachedResults);
    store.inTransaction(() => {
      for (let idx = 0; idx < initial.uncachedGroups.length; idx++) {
        const group = initial.uncachedGroups[idx]!;
        const sanitized = sanitizeDraftItem(draftByGroup.get(idx), modelFailed, initial.projectIdsByRef, prepared.projectMap);
        for (const sessionRow of group.sessions) {
          const liveRow = store.getSession(sessionRow.session_key);
          if (!liveRow || !isSessionInScopeSync(liveRow, postSnapshot, prepared.workspaces)) {
            freshByKey.delete(sessionRow.session_key);
            continue;
          }
          const stored = {
            session_key: liveRow.session_key,
            status: sanitized.status,
            project_id: sanitized.status === "ready" ? sanitized.chosenProjectId : null,
            alternatives: sanitized.alternativeIds,
            reason: sanitized.reason,
            evidence: sanitized.evidence,
            input_digest: group.input_digest,
            prompt_version: promptVersion,
            created_at: nowIso,
          };
          store.decisions.upsertSuggestion(stored);
          const materialized = materializeSuggestion(stored, prepared.projectMap);
          if (materialized) freshByKey.set(liveRow.session_key, materialized);
        }
      }

      for (const [sessionKey] of [...freshByKey.entries()]) {
        const liveRow = store.getSession(sessionKey);
        if (!liveRow || !isSessionInScopeSync(liveRow, postSnapshot, prepared.workspaces)) {
          freshByKey.delete(sessionKey);
        }
      }
    });

    return {
      suggestions: initial.inScopeOrder
        .map(key => ({ session_key: key, suggestion: freshByKey.get(key) }))
        .filter((item): item is { session_key: string; suggestion: ExternalSessionSuggestion } => item.suggestion !== undefined),
    };
  });
}
