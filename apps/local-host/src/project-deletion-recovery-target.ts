import path from "node:path";
import { lstatSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { LocalSqliteStorage, clearProjectInExistingTextSearchIndex, inspectExistingSqlitePath } from "@molis-ai/molis-work-storage";
import { ProjectsModule, normalizeProjectWorkspace, readProjectDeletionRecoveryPage, readProjectDeletionCatalogIdentities,
  type ProjectDeletionSourceIdentity } from "@molis-ai/molis-work-module-projects";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { createRuntimeContextModule, createRuntimeProjectBindingValidation } from "@molis-ai/molis-work-module-private-work-context";
import { BUILTIN_PLUGIN_REGISTRY } from "./plugin-registry.js";
import { closeCatalogInitialization } from "./project-deletion-catalog-close.js";
import { assertCurrentCatalog, assertOwnedCatalog } from "./catalog-schema.js";
import { createCatalogCommit } from "./catalog-commit.js";
import { catalogErrors, catalogFailure } from "./project-catalog-contract.js";
import { ManagedProjectDeletion } from "./managed-project-deletion.js";
import type { LocalCatalogPlatform } from "./project-catalog.js";
import { ProjectDeletedHooks, type ProjectDeletedOwner } from "./project-deleted-hooks.js";
import { homeProjectOwners, SEARCH_OWNER } from "./project-deleted-owners.js";
import { decodeProjectDeletionRecovery } from "./project-deletion-recovery.js";
import type { ProjectDeletionRecoveryInspection, ProjectDeletionRecoverySource } from "./project-deletion-recovery-inspection.js";
import { reconcileProjectDeletionHistory, type ProjectDeletionRecoveryGroup } from "./project-deletion-recovery-history.js";
import { managedProjectDirectory } from "./project-file-paths.js";

export type { ProjectDeletionRecoveryGroup, ProjectDeletionSourceRequest } from "./project-deletion-recovery-history.js";
export interface ProjectDeletionCatalogSnapshot {
  receipts: readonly ProjectDeletionRecoverySource[];
  projects: readonly ProjectDeletionSourceIdentity[];
}
export interface ProjectDeletionRecoveryTargetInput {
  homeDirectory: string;
  source: ProjectDeletionRecoveryInspection;
  groups: readonly ProjectDeletionRecoveryGroup[];
  memory: ProjectDeletedOwner;
  projectRuntime?: ProjectDeletedOwner;
  assertCurrent(): void;
  signal?: AbortSignal;
  /** Persist this whole group in the existing restoration marker before accepting any of its target receipts. */
  recordTargets(group: ProjectDeletionRecoveryGroup): Promise<void>;
  /** Advance only these owner-observed facts after their successful COMMIT. Must be synchronous. */
  catalogCommitted(change: { before: ProjectDeletionCatalogSnapshot; after: ProjectDeletionCatalogSnapshot }): void;
}
export interface ProjectDeletionRecoveryTarget {
  restore(sourceDeletionId: string): Promise<{ source_deletion_id: string; target_deletion_id: string; cleanup_state: "pending" | "complete" }>;
  close(): Promise<void>;
}
const invalid = (message: string) => catalogErrors.project_storage_invalid(message);
function synchronous(work: () => void): void {
  const result: unknown = work();
  if (result !== undefined) {
    if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result)
      void Promise.resolve(result).catch(() => undefined);
    throw invalid("目标维护回调必须同步完成");
  }
}

function catalogFile(home: string): string {
  if (!path.isAbsolute(home) || path.resolve(home) !== home) throw invalid("目标必须是明确的绝对 Home 路径");
  const filename = path.join(home, "projects", "catalog.db");
  let at = path.parse(filename).root;
  for (const segment of filename.slice(at.length).split(path.sep)) {
    at = path.join(at, segment);
    const stat = lstatSync(at);
    if (stat.isSymbolicLink() || (at === filename ? !stat.isFile() : !stat.isDirectory())) throw invalid("目标 Catalog 路径不属于原 Home");
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const stat = (() => { try { return lstatSync(filename + suffix); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return null; } })();
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw invalid("目标 Catalog 附属文件不属于原 Home");
  }
  return filename;
}

function snapshot(storage: LocalSqliteStorage): ProjectDeletionCatalogSnapshot {
  const receipts: ProjectDeletionRecoverySource[] = [];
  let after: string | undefined;
  for (;;) {
    const page = readProjectDeletionRecoveryPage(storage.db, { after, limit: 100 });
    receipts.push(...page.items.map(({ recovery_plan, ...record }) => ({ ...record,
      recovery: decodeProjectDeletionRecovery(recovery_plan, record.project_id, record.deletion_id) })));
    if (page.exhausted) break;
    after = page.items[page.items.length - 1]!.deletion_id;
  }
  return { receipts, projects: readProjectDeletionCatalogIdentities(storage.db) };
}

/** The outer frame compares this fresh committed projection with its expected facts. Control must not recurse into read. */
export function openProjectDeletionCatalogObservation(input: {
  homeDirectory: string; assertCurrent(): void; signal?: AbortSignal;
}): { read(): ProjectDeletionCatalogSnapshot; projectDatabase(projectId: string): string; close(): void } {
  const homeDirectory = input.homeDirectory, filename = catalogFile(homeDirectory), files = inspectExistingSqlitePath(filename);
  const { assertCurrent, signal } = input;
  let closed = false, disposed = false;
  const current = () => {
    if (closed) throw invalid("Catalog 观察已关闭");
    signal?.throwIfAborted(); files.assertCurrent(); synchronous(assertCurrent);
    signal?.throwIfAborted(); files.assertCurrent();
  };
  current();
  const storage = new LocalSqliteStorage(filename, { readonly: true, fileMustExist: true });
  return {
    read() {
      current();
      storage.db.exec("BEGIN");
      try {
        assertOwnedCatalog(storage, "目标 Catalog"); assertCurrentCatalog(storage, "目标 Catalog");
        const value = snapshot(storage);
        current();
        return value;
      } finally { storage.db.exec("ROLLBACK"); }
    },
    projectDatabase(projectId) {
      current(); storage.db.exec("BEGIN");
      try {
        assertOwnedCatalog(storage, "目标 Catalog"); assertCurrentCatalog(storage, "目标 Catalog");
        const projects = new ProjectsModule({ db: storage.db, plugins: BUILTIN_PLUGIN_REGISTRY });
        const project = projects.query.getProject(projectId);
        managedProjectDirectory(path.join(homeDirectory, "projects"), project);
        current(); return project.database_path;
      } finally { storage.db.exec("ROLLBACK"); }
    },
    close() { closed = true; if (!disposed) { storage.close(); disposed = true; } },
  };
}

async function readSource(source: ProjectDeletionRecoveryInspection, current: () => void): Promise<ProjectDeletionRecoverySource[]> {
  const rows: ProjectDeletionRecoverySource[] = [];
  let previous: string | undefined;
  try {
    for (;;) {
      current();
      const page = await source.next({ limit: 100 });
      current();
      rows.push(...structuredClone(page.items));
      if (page.exhausted) return rows;
      const last = page.items.at(-1)?.deletion_id;
      if (!last || last === previous) throw invalid("来源项目删除分页未能穷尽");
      previous = last;
    }
  } finally { await source.close(); current(); }
}

/** Explicit maintenance assembly: existing Catalog owners only; no ordinary Catalog startup or Runtime/service opening. */
export async function openProjectDeletionRecoveryTarget(input: ProjectDeletionRecoveryTargetInput,
  platform: Pick<LocalCatalogPlatform, "createPanels">): Promise<ProjectDeletionRecoveryTarget> {
  const { homeDirectory: home, assertCurrent, signal, recordTargets, catalogCommitted, memory, projectRuntime } = input;
  const saved = structuredClone(input.groups);
  let closed = false, failed = false;
  const current = () => {
    if (closed || failed) throw invalid("目标项目删除维护已关闭或待对账");
    signal?.throwIfAborted(); synchronous(assertCurrent); signal?.throwIfAborted();
  };
  current();
  if (memory.id !== "memory" || !memory.withRecovery || (projectRuntime && projectRuntime.id !== "project-runtime"))
    throw invalid("冷恢复缺少原清理主人");
  const sources = await readSource(input.source, current);
  if (sources.some(row => path.basename(row.project_id) !== row.project_id || row.project_id === "." || row.project_id === ".."
    || row.request_fingerprint !== JSON.stringify({ project_id: row.project_id, delete_confirmed: true })))
    throw invalid("来源项目身份不能指向管理目录之外");
  const filename = catalogFile(home);
  const reader = new LocalSqliteStorage(filename, { readonly: true, fileMustExist: true });
  let before: ProjectDeletionCatalogSnapshot, readerFailure: { error: unknown } | undefined;
  try {
    reader.db.exec("BEGIN");
    assertOwnedCatalog(reader, "目标 Catalog"); assertCurrentCatalog(reader, "目标 Catalog");
    before = snapshot(reader);
    reader.db.exec("ROLLBACK");
  } catch (error) { readerFailure = { error }; throw error; }
  finally { closeCatalogInitialization(reader, readerFailure); }
  current();
  const { groups, fresh } = reconcileProjectDeletionHistory(sources, before.receipts, saved);
  for (const group of fresh) { current(); await recordTargets(structuredClone(group)); current(); }
  const storage = new LocalSqliteStorage(filename, { fileMustExist: true });
  const check = () => { current(); assertOwnedCatalog(storage, "目标 Catalog"); assertCurrentCatalog(storage, "目标 Catalog"); };
  try {
    check();
    const projects = new ProjectsModule({ db: storage.db, plugins: BUILTIN_PLUGIN_REGISTRY });
    if (!isDeepStrictEqual(before, snapshot(storage))) throw invalid("接纳前目标 Catalog 已变化");
    const options = { ...input, homeDirectory: home, memory, projectRuntime, signal,
      catalogCommitted(change: { before: ProjectDeletionCatalogSnapshot; after: ProjectDeletionCatalogSnapshot }) {
        try { synchronous(() => catalogCommitted(change)); }
        catch (error) { failed = true; throw error; }
      } };
    const managed = assembleTarget(storage, projects, platform, options, check);
    let tail: Promise<unknown> = Promise.resolve();
    let storageClosed = false, closing: Promise<void> | undefined;
    return {
      restore(sourceDeletionId) {
        const task = tail.then(() => restoreSource(sourceDeletionId, sources, groups, projects, managed, check));
        tail = task.catch(() => undefined);
        return task;
      },
      close() {
        closed = true;
        if (storageClosed) return Promise.resolve();
        return closing ??= tail.then(() => { storage.close(); storageClosed = true; })
          .finally(() => { closing = undefined; });
      },
    };
  } catch (error) { closeCatalogInitialization(storage, { error }); throw error; }
}

function assembleTarget(storage: LocalSqliteStorage, projects: ProjectsModule, platform: Pick<LocalCatalogPlatform, "createPanels">,
  input: ProjectDeletionRecoveryTargetInput, current: () => void): ManagedProjectDeletion {
  const hooks = new ProjectDeletedHooks();
  for (const owner of homeProjectOwners(input.homeDirectory)) hooks.register(owner);
  hooks.register(input.memory);
  if (input.projectRuntime) hooks.register(input.projectRuntime);
  hooks.register({ ...SEARCH_OWNER, clear(projectId) { clearProjectInExistingTextSearchIndex({ homeDirectory: input.homeDirectory,
    projectId, assertCurrent: current, signal: input.signal }); } });
  const validation = createRuntimeProjectBindingValidation({ normalizeProjectWorkspace });
  const ledger = createContextLedger(storage.db, { initializeSchema: false,
    authorize(access) { current(); return access.scope.kind === "personal" && access.scope.id === "private-work-context"; } });
  const contexts = createRuntimeContextModule({ db: storage.db, ledger, projects, validation });
  const panels = platform.createPanels(storage.db, { errorFactory: catalogFailure, context: {
    assertProject(projectId) { current(); projects.query.getProject(projectId); },
    bind() { throw invalid("项目删除冷入口不允许新增绑定"); },
    appendProjectEvent(projectId, type, actorId, payload) { current(); projects.lifecycle.appendEvent(projectId, type, actorId, payload); },
  } });
  const commit = createCatalogCommit(storage.db, current, {
    read: () => snapshot(storage),
    committed: change => synchronous(() => input.catalogCommitted(change)),
  });
  return new ManagedProjectDeletion(projects, path.join(input.homeDirectory, "projects"), {
    removeBindings(projectId, actorId, at) { current(); return contexts.removeProjectFacts(projectId, actorId, at); },
    removePanels(projectId) { current(); panels.deleteForProject(projectId); },
  }, validation, commit, hooks, { assertCurrent: current });
}

async function restoreSource(sourceId: string, sources: readonly ProjectDeletionRecoverySource[], groups: readonly ProjectDeletionRecoveryGroup[],
  projects: ProjectsModule, managed: ManagedProjectDeletion, current: () => void) {
  current();
  const source = sources.find(row => row.deletion_id === sourceId), group = groups.find(row => row.sources.some(item => item.deletion_id === sourceId));
  const ref = group?.targets.find(row => row.source_deletion_id === sourceId);
  if (!source || !group || !ref) throw invalid("来源删除不在已穷尽的原接纳组内");
  const dependent = group.disposal.dependent_targets.includes(ref.target_deletion_id);
  if (dependent) {
    const primary = projects.lifecycle.getDeletion(group.disposal.primary_target!);
    await managed.verifyOriginalDeletion(primary);
    current();
  }
  const result = await managed.restoreProjectDeletion({ deletion_id: ref.target_deletion_id, project_id: source.project_id,
    actor_id: source.actor_id, idempotency_key: source.idempotency_key, request_fingerprint: source.request_fingerprint,
    owner_ids: source.owner_steps.map(step => step.owner_id), require_empty: dependent });
  current();
  return { source_deletion_id: sourceId, target_deletion_id: ref.target_deletion_id, cleanup_state: result.cleanup_state };
}
