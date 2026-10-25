import path from "node:path";
import { existsSync } from "node:fs";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { ProjectSessionDeletionPlan } from "@molis-ai/molis-work-service-agent-host";
import type { ProjectMemoryPurgePlan } from "@molis-ai/molis-work-service-memory";
import { BUILTIN_PLUGIN_REGISTRY } from "./plugin-registry.js";
import { assertCurrentCatalog, assertOwnedCatalog } from "./catalog-schema.js";
import { catalogErrors } from "./project-catalog-contract.js";
import type { ProjectDeletionRecord } from "@molis-ai/molis-work-contracts/modules/projects";

/** Internal Catalog record, never accepted from an Action or HTTP payload. No conversation or Memory text. */
export type ProjectDeletionRecovery = { version: 1; project_id: string; operation_id: string } & (
  { kind: "absent" } | { kind: "runtime"; sessions: ProjectSessionDeletionPlan; memory: ProjectMemoryPurgePlan });
export interface ProjectDeletionPreparation {
  project_id: string; operation_id: string; original?: ProjectDeletionRecovery;
  /** A completed receipt proves only its original selected objects, never a later project with the same id. */
  verification?: "original";
}
export interface ProjectDeletionMemoryProof {
  verifyMemory(): Promise<void>;
  verifyOriginal?(): Promise<void>;
  assertCurrent(): void;
}
export type WithProjectDeletionRecovery = <T>(input: ProjectDeletionPreparation,
  work: (plan: ProjectDeletionRecovery, proof: ProjectDeletionMemoryProof) => Promise<T>) => Promise<T>;
/** Catalog-decoded original facts, never a request flag or a reusable permission token. */
export interface ProjectRecreation {
  project_id: string;
  deletions: readonly (ProjectDeletionRecord & { recovery: ProjectDeletionRecovery })[];
}
export type WithProjectRecreation = <T>(input: ProjectRecreation, work: (assertCurrent: () => void) => Promise<T>) => Promise<T>;

const invalid = () => catalogErrors.project_storage_invalid("原项目删除计划缺失或形状不符，保留收据等待停写维护");
const object = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value as Record<string, unknown>;
};
const text = (value: unknown) => { if (typeof value !== "string" || !value.trim()) throw invalid(); };
const number = (value: unknown, minimum = 1) => { if (!Number.isSafeInteger(value) || (value as number) < minimum) throw invalid(); };
const rows = (value: unknown): unknown[] => { if (!Array.isArray(value)) throw invalid(); return value; };
const session = (value: unknown) => { const row = object(value, ["runtime_id", "session_id"]); if (row.runtime_id !== "prologue") throw invalid(); text(row.session_id); return row.session_id as string; };

/** The persisted boundary is decoded once. AgentHost still validates the original owner/decision before effects. */
export function decodeProjectDeletionRecovery(saved: string | null, projectId: string, operationId: string): ProjectDeletionRecovery {
  text(projectId); text(operationId);
  if (!saved) throw invalid();
  let input: unknown;
  try { input = JSON.parse(saved); } catch { throw invalid(); }
  const plan = object(input, ["version", "kind", "project_id", "operation_id", "sessions", "memory"]);
  if (plan.version !== 1 || plan.project_id !== projectId || plan.operation_id !== operationId) throw invalid();
  if (plan.kind === "absent") { if (plan.sessions !== undefined || plan.memory !== undefined) throw invalid(); return input as ProjectDeletionRecovery; }
  if (plan.kind !== "runtime") throw invalid();
  const sessions = object(plan.sessions, ["project_id", "operation_id", "sessions"]);
  if (sessions.project_id !== projectId || sessions.operation_id !== operationId) throw invalid();
  const sessionIds = new Set<string>();
  for (const value of rows(sessions.sessions)) {
    const item = object(value, ["session", "owner", "decision", "preview", "state", "indexed", "parent_run"]);
    const sessionId = session(item.session);
    if (sessionIds.has(sessionId)) throw invalid();
    sessionIds.add(sessionId);
    const owner = object(item.owner, ["project_id", "plugin_id", "install_id", "actor_id"]);
    for (const key of ["project_id", "plugin_id", "install_id", "actor_id"]) text(owner[key]);
    const decision = object(item.decision, ["operation_id", "expected_version", "expected_state"]);
    text(decision.operation_id); number(decision.expected_version);
    if (!["active", "archived"].includes(decision.expected_state as string)) throw invalid();
    const preview = object(item.preview, ["session", "version", "state", "runs", "resources", "destroys_key"]);
    if (session(preview.session) !== sessionId || preview.version !== decision.expected_version || preview.state !== decision.expected_state) throw invalid();
    number(preview.version); number(preview.runs, 0); number(preview.resources, 0);
    if (!["active", "archived"].includes(preview.state as string) || typeof preview.destroys_key !== "boolean"
      || typeof item.indexed !== "boolean" || !["active", "archived", "purged"].includes(item.state as string)) throw invalid();
    if (item.parent_run !== undefined) { const parent = object(item.parent_run, ["session_id", "run_id"]); text(parent.session_id); text(parent.run_id); }
  }
  const memory = object(plan.memory, ["project_id", "actor_id", "operation_id", "scopes"]);
  if (memory.project_id !== projectId || memory.operation_id !== operationId) throw invalid();
  text(memory.actor_id);
  for (const value of rows(memory.scopes)) {
    const scope = object(value, ["scope", "owner", "memories", "candidates", "sources"]);
    if (!["personal", "project", "character"].includes(scope.scope as string)) throw invalid();
    text(scope.owner);
    for (const [name, id] of [["memories", "memory_id"], ["candidates", "candidate_id"]] as const) for (const target of rows(scope[name])) {
      const item = object(target, [id, "version"]); text(item[id]); number(item.version);
    }
    for (const target of rows(scope.sources)) { const item = object(target, ["event_id", "version"]); text(item.event_id); text(item.version); }
  }
  return input as ProjectDeletionRecovery;
}

/** Current persisted admission fact, read through the Catalog/Projects owner without creating or changing a database. */
export function projectDeletionPending(home: string, projectId: string, sessionId?: string): boolean {
  const filename = path.join(home, "projects", "catalog.db");
  if (!existsSync(filename)) return false;
  const storage = new LocalSqliteStorage(filename, { readonly: true });
  try {
    assertOwnedCatalog(storage, filename); assertCurrentCatalog(storage, filename);
    const projects = new ProjectsModule({ db: storage.db, plugins: BUILTIN_PLUGIN_REGISTRY });
    for (const receipt of projects.lifecycle.pendingDeletions()) {
      if (receipt.project_id === projectId) return true;
      if (!sessionId || !receipt.recovery_plan) continue;
      const plan = decodeProjectDeletionRecovery(receipt.recovery_plan, receipt.project_id, receipt.deletion_id);
      if (plan.kind === "runtime" && plan.sessions.sessions.some(item => item.session.session_id === sessionId)) return true;
    }
    return false;
  } finally { storage.close(); }
}
