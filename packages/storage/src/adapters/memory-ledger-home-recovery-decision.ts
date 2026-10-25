import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type { MemoryHomeRecoveryDecision, MemoryHomeRecoveryMemory, MemoryHomeRecoverySession,
  MemoryLedgerRecoveryIdentity } from "@molis-ai/molis-work-contracts/services/memory";
import type { ProjectDeletionRecoveryGroup } from "@molis-ai/molis-work-contracts/modules/projects";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";

type Body = Record<string, unknown>;
export interface MemoryHomeRecoveryRecord { readonly at: string; readonly body: MemoryHomeRecoveryDecision }
export const homeRecoveryKey = (id: string): string => `memory-operation:${id}:home-recovery`;
export function homeRecoveryConflict(): never {
  throw Object.assign(new Error("恢复父决定、原选择或采用快照不相容"), { code: "memory.adoption_conflict" });
}
const text = (value: unknown): string => typeof value === "string" && value.trim().length ? value : homeRecoveryConflict();
const number = (value: unknown, zero = false): number => typeof value === "number" && Number.isSafeInteger(value) && value >= (zero ? 0 : 1) ? value : homeRecoveryConflict();
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : homeRecoveryConflict();
function body(value: unknown, fields: readonly string[]): Body {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) return homeRecoveryConflict();
  return value as Body;
}
function identity(value: unknown): MemoryLedgerRecoveryIdentity {
  const item = body(value, ["scope", "owner"]);
  if (item.scope !== "personal" && item.scope !== "project" && item.scope !== "character") return homeRecoveryConflict();
  return { scope: item.scope, owner: text(item.owner) };
}
function sessionRef(value: unknown) {
  const item = body(value, ["session_id", "runtime_id"]);
  return { session_id: text(item.session_id), runtime_id: text(item.runtime_id) };
}
function preview(value: unknown, state: boolean) {
  const item = body(value, ["session", "version", "runs", "resources", "destroys_key", ...(state ? ["state"] : [])]);
  sessionRef(item.session); number(item.version); number(item.runs, true); number(item.resources, true);
  if (typeof item.destroys_key !== "boolean" || state && item.state !== "active" && item.state !== "archived") homeRecoveryConflict();
  return item;
}
function session(value: unknown): MemoryHomeRecoverySession {
  const item = body(value, ["session", "owner", "source", "target", "business"]), ref = sessionRef(item.session);
  const owner = body(item.owner, ["project_id", "plugin_id", "install_id", "actor_id"]);
  for (const key of ["project_id", "plugin_id", "install_id", "actor_id"]) text(owner[key]);
  const source = body(item.source, ["preview", "phase", "version"]), original = preview(source.preview, false);
  if (source.phase !== "cleaning" && source.phase !== "complete") homeRecoveryConflict();
  number(source.version);
  const target = body(item.target, ["decision", "preview"]), shown = preview(target.preview, true);
  const decision = body(target.decision, ["operation_id", "expected_version", "expected_state"]);
  text(decision.operation_id); number(decision.expected_version);
  if (!isDeepStrictEqual(ref, original.session) || !isDeepStrictEqual(ref, shown.session)
    || decision.expected_version !== shown.version || decision.expected_state !== shown.state) homeRecoveryConflict();
  business(item.business, ref, owner);
  return value as MemoryHomeRecoverySession;
}

function objectRef(value: unknown): Body {
  const ref = body(value, ["module", "id", "version", "revision", "scope", "project_id", "object_type"]);
  if (!["goals", "artifacts", "feed", "private-work-context", "projects", "assistant", "plugins", "agent-host"].includes(text(ref.module))) homeRecoveryConflict();
  text(ref.id); if (ref.version !== null) number(ref.version);
  if (ref.module === "artifacts" && ref.version === null) homeRecoveryConflict();
  if ("revision" in ref) text(ref.revision);
  if ("project_id" in ref && ref.project_id !== null) text(ref.project_id);
  if ("object_type" in ref) text(ref.object_type);
  const scope = body(ref.scope, ["kind", "id"]);
  if (scope.kind !== "personal" && scope.kind !== "team_project") homeRecoveryConflict();
  text(scope.id); return ref;
}

/** Only persisted shape and parent linkage; each business owner still checks its own current records and permissions. */
function business(value: unknown, ref: ReturnType<typeof sessionRef>, owner: Body): void {
  const item = body(value, ["kind", "selection"]);
  if (item.kind !== "coding" && item.kind !== "assistant") homeRecoveryConflict();
  const selection = body(item.selection, ["session", "owner", ...(item.kind === "coding" ? ["installation_generation", "sessions", "waits"] : ["works"])]);
  if (!isDeepStrictEqual(selection.session, ref) || !isDeepStrictEqual(selection.owner, owner)) homeRecoveryConflict();
  if (item.kind === "coding") {
    text(selection.installation_generation);
    const keys: string[] = [];
    for (const [name, id] of [["sessions", "session_id"], ["waits", "wait_id"]] as const) {
      const ids = list(selection[name]).map(raw => {
        const entry = body(raw, [id, "keys", ...(name === "sessions" ? ["created_at"] : [])]);
        if (name === "sessions") text(entry.created_at);
        keys.push(...list(entry.keys).map(text)); return text(entry[id]);
      });
      unique(ids);
    }
    unique(keys); return;
  }
  const relations: string[] = [];
  const works = list(selection.works).map(raw => {
    const work = body(raw, ["work_id", "actor_id", "project_id", "revision", "created_at", "relations"]);
    text(work.work_id); text(work.actor_id); text(work.created_at); number(work.revision);
    if (work.actor_id !== owner.actor_id) homeRecoveryConflict();
    if (work.project_id !== null) text(work.project_id);
    for (const raw of list(work.relations)) {
      const edge = body(raw, ["key", "revision", "type", "source", "target"]);
      text(edge.key); number(edge.revision); text(edge.type);
      const source = objectRef(edge.source); objectRef(edge.target);
      if (source.module !== "assistant" || source.id !== work.work_id || (source.project_id ?? null) !== work.project_id) homeRecoveryConflict();
      relations.push(JSON.stringify([edge.key, edge.revision]));
    }
    return text(work.work_id);
  });
  unique(works); unique(relations);
}
function memory(value: unknown, sessions: readonly MemoryHomeRecoverySession[]): MemoryHomeRecoveryMemory {
  const item = body(value, ["identity", "source", "target"]), where = identity(item.identity);
  const target = body(item.target, ["ref", "mode", "expected_version", "operation_id", "selection"]);
  const ref = body(target.ref, ["kind", "id", "revision"]);
  if (ref.kind !== "memory" && ref.kind !== "memory-candidate" || ref.revision !== 1) homeRecoveryConflict();
  text(ref.id);
  if (target.mode === "already-cleared") {
    if ("expected_version" in target || "operation_id" in target || "selection" in target) homeRecoveryConflict();
  } else if (target.mode === "present-purge") {
    number(target.expected_version); text(target.operation_id);
    if ("selection" in target) { const selection = body(target.selection, ["session", "operation_id"]); sessionRef(selection.session); text(selection.operation_id); }
  } else homeRecoveryConflict();
  const source = body(item.source, ["kind", "actor_id", "operation_id", "expected_version", "session"]);
  if (source.kind === "forgotten") {
    if (Object.keys(source).length !== 1 || ref.kind !== "memory") homeRecoveryConflict();
  } else if (source.kind === "session-termination") {
    if (Object.keys(source).length !== 2) homeRecoveryConflict();
    const linked = sessions.find(entry => isDeepStrictEqual(entry.session, sessionRef(source.session)));
    if (!linked || where.scope === "personal" && where.owner !== linked.owner.actor_id
      || where.scope === "project" && where.owner !== linked.owner.project_id) homeRecoveryConflict();
    if (target.mode === "present-purge") {
      const selection = body(target.selection, ["session", "operation_id"]);
      if (!isDeepStrictEqual(selection.session, linked.session) || selection.operation_id !== linked.target.decision.operation_id) homeRecoveryConflict();
    }
  } else if (source.kind === "original-purge" || source.kind === "merge-drop" || source.kind === "confirmed-plan") {
    const global = source.kind === "confirmed-plan" && source.actor_id === "";
    if (Object.keys(source).length !== 4 || "session" in source || !global && where.scope === "personal" && source.actor_id !== where.owner
      || source.kind !== "confirmed-plan" && ref.kind !== "memory") homeRecoveryConflict();
    if (!global) text(source.actor_id);
    text(source.operation_id); number(source.expected_version);
  } else homeRecoveryConflict();
  return value as MemoryHomeRecoveryMemory;
}
function group(value: unknown): ProjectDeletionRecoveryGroup {
  const item = body(value, ["project_id", "sources", "targets", "disposal"]), project = text(item.project_id);
  for (const raw of list(item.sources)) {
    const source = body(raw, ["deletion_id", "project_id", "actor_id", "idempotency_key", "request_fingerprint"]);
    for (const key of ["deletion_id", "project_id", "actor_id", "idempotency_key", "request_fingerprint"]) text(source[key]);
    if (source.project_id !== project) homeRecoveryConflict();
  }
  for (const raw of list(item.targets)) { const target = body(raw, ["source_deletion_id", "target_deletion_id"]); text(target.source_deletion_id); text(target.target_deletion_id); }
  const disposal = body(item.disposal, ["primary_target", "dependent_targets"]);
  if (disposal.primary_target !== null) text(disposal.primary_target);
  for (const id of list(disposal.dependent_targets)) text(id);
  // Catalog's reconcileProjectDeletionHistory owns the mapping's business consistency.
  return value as ProjectDeletionRecoveryGroup;
}
const unique = (values: readonly string[]) => { if (new Set(values).size !== values.length) homeRecoveryConflict(); };
const scopeKey = (where: MemoryLedgerRecoveryIdentity) => JSON.stringify([where.scope, where.owner]);

/** The single decoder at the persisted parent boundary; never an SDK/Catalog plan decoder. */
export function decodeMemoryHomeRecoveryDecision(value: unknown, operationId: string): MemoryHomeRecoveryDecision {
  const item = body(value, ["kind", "operation_id", "phase", "known_scopes", "memories", "sessions", "barriers", "project_groups"]);
  if (item.kind !== "home-recovery" || text(item.operation_id) !== text(operationId) || item.phase !== "pending" && item.phase !== "committed") homeRecoveryConflict();
  const scopes = list(item.known_scopes).map(identity), sessions = list(item.sessions).map(session);
  const memories = list(item.memories).map(value => memory(value, sessions)), groups = list(item.project_groups).map(group);
  unique(scopes.map(scopeKey)); unique(sessions.map(entry => JSON.stringify([entry.session.runtime_id, entry.session.session_id])));
  unique(memories.map(entry => JSON.stringify([entry.target.ref.kind, entry.target.ref.id]))); unique(groups.map(entry => entry.project_id));
  const known = new Set(scopes.map(scopeKey));
  const requireScope = (where: MemoryLedgerRecoveryIdentity) => { if (!known.has(scopeKey(where))) homeRecoveryConflict(); };
  for (const entry of memories) requireScope(entry.identity);
  for (const entry of sessions) {
    const personalAssistant = entry.business.kind === "assistant" && entry.owner.project_id === ASSISTANT_PERSONAL_OWNER;
    if (personalAssistant && (entry.session.runtime_id !== "prologue" || entry.owner.plugin_id !== ASSISTANT_PLUGIN_ID
      || entry.owner.install_id !== ASSISTANT_INSTALL_ID)) homeRecoveryConflict();
    requireScope(personalAssistant ? { scope: "personal", owner: entry.owner.actor_id } : { scope: "project", owner: entry.owner.project_id });
  }
  for (const entry of groups) requireScope({ scope: "project", owner: entry.project_id });
  const barriers = list(item.barriers).map(raw => {
    const barrier = body(raw, ["actor_id", "identity", "sources"]), actor = text(barrier.actor_id), where = identity(barrier.identity);
    requireScope(where); if (where.scope === "personal" && where.owner !== actor) homeRecoveryConflict();
    const sources = list(barrier.sources).map(raw => {
      const source = body(raw, ["event_id", "version"]); text(source.event_id); if ("version" in source) text(source.version);
      return JSON.stringify([source.event_id, source.version]);
    });
    unique(sources); return JSON.stringify([actor, scopeKey(where)]);
  });
  unique(barriers);
  return value as MemoryHomeRecoveryDecision;
}

/** Read all parent records so another pending or corrupt parent cannot be hidden by a selected key. */
export function memoryHomeRecoveryRecords(db: DatabaseSync): MemoryHomeRecoveryRecord[] {
  return db.prepare("SELECT actor_id,key,at,body FROM memory_markers WHERE key LIKE 'memory-operation:%:home-recovery' ORDER BY key,actor_id").all().map(row => {
    if (row.actor_id !== "") homeRecoveryConflict();
    let value: unknown;
    try { value = JSON.parse(text(row.body)); } catch { return homeRecoveryConflict(); }
    const key = text(row.key), id = key.slice("memory-operation:".length, -":home-recovery".length);
    return { at: text(row.at), body: decodeMemoryHomeRecoveryDecision(value, id) };
  });
}
