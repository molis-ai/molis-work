import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { charactersProjectData } from "@molis-ai/molis-work-module-characters";
import { functionsProjectData } from "@molis-ai/molis-work-module-functions";
import { existsSync, rmSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { rm } from "node:fs/promises";
import { purgeProjectMemories } from "@molis-ai/molis-work-service-memory";
import { inspectExistingStoragePath, memoryLedgerHasOnlyPreferences, MEMORY_LEDGER_STORE, TEXT_SEARCH_STORE, clearKnowledgeProject, hasStorageBusinessFiles, homeSqlitePartitionDirectory, homeSqlitePath, openMemoryLedger } from "@molis-ai/molis-work-storage";
import type { ProjectDeletedOwner } from "./project-deleted-hooks.js";
import { ProjectDeletedDeferred } from "./project-deleted-deferred.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { alchemistProjectDirectory } from "./alchemist-paths.js";
import { pluginBuilderProjectOwner } from "./plugin-builder/project-data.js";
import { clearProjectRows } from "./plugin-project-rows.js";
import { purgeAssistantProject } from "./assistant/assistant-project-purge.js";
import { forgetProjectOriginalFiles } from "./material-original-files.js";
import { forgetProjectConnectionBindings } from "./connector-plugin-requests.js";

/** The two owners whose data sits in a running service: what each says in the deletion receipt and, if it has one, in the dialog. */
export const MEMORY_OWNER = { id: "memory", label: "这个项目及其角色的记忆" } as const;
export const SEARCH_OWNER = { id: "search", label: null } as const;

/**
 * Memory is kept in the Agent runtime, which one process of the Home owns: the executor, the resident Web Host. A
 * process that does not run it (the CLI, the uninstaller, a Host that only forwards to the resident Host) cannot clear
 * it and must not start one to try: where the Home has an Agent runtime the step is deferred, to stay pending in the
 * receipt until the executor runs it. Where it has none there is no store, and only the ledger can hold notes about the
 * project.
 */
export function memoryOwnerWithoutService(home: string): ProjectDeletedOwner {
  const plans = new AsyncLocalStorage<{ active: boolean; recreation?: string }>();
  const check = () => {
    if (hasStorageBusinessFiles(agentRuntimeDirectory(home))) throw new ProjectDeletedDeferred("记忆放在 Agent 执行服务里，这个入口不运行它；由运行中的 Molis Work 清理，它会接着做", true);
  };
  return {
    ...MEMORY_OWNER, check,
    async withRecreation(input, work) {
      const frame = { active: true, recreation: input.project_id };
      const current = () => {
        if (!frame.active) throw new ProjectDeletedDeferred("示例空态证明已结束，请重试", true);
        check();
        if (existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)) && !memoryLedgerHasOnlyPreferences({ homeDirectory: home }))
          throw new ProjectDeletedDeferred("已有记忆账注但当前入口不能确认空态，请由运行中的 Molis Work 核对", true);
      };
      current();
      try { return await plans.run(frame, () => work(current)); }
      finally { frame.active = false; }
    },
    async withRecovery(input, work) {
      if (input.original && input.original.kind !== "absent") throw new ProjectDeletedDeferred("原删除计划需要运行时主人恢复", true);
      const frame = { active: true };
      const current = () => {
        if (!frame.active) throw new ProjectDeletedDeferred("原空态证明已结束", true);
        check();
        if (existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)) && !memoryLedgerHasOnlyPreferences({ homeDirectory: home })) throw new ProjectDeletedDeferred("已有记忆账注但当前入口不能确认原件范围，请由记忆主人核对", true);
      };
      current();
      try { return await plans.run(frame, () => work(input.original ?? { version: 1, kind: "absent", project_id: input.project_id, operation_id: input.operation_id },
        { verifyMemory: async () => { current(); }, assertCurrent: current })); }
      finally { frame.active = false; }
    },
    async clear(projectId, receipt) {
      if (receipt) {
        const frame = plans.getStore();
        if (!frame?.active || receipt.recovery.kind !== "absent")
          throw new ProjectDeletedDeferred("原删除计划需要运行时主人恢复", true);
        check();
        if (existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)) && !memoryLedgerHasOnlyPreferences({ homeDirectory: home }))
          throw new ProjectDeletedDeferred("接受计划前运行时范围发生变化，保留原收据核对", true);
        if (existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE))) {
          const ledger = openMemoryLedger({ homeDirectory: home });
          try { ledger.forgetScopes({ project_id: projectId, scopes: [], prefs_keys: [`project:${projectId}`], signal_prefixes: [], marker_keys: [] }); }
          finally { ledger.close(); }
        }
        return;
      }
      check();
      if (!existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE))) return;
      const ledger = openMemoryLedger({ homeDirectory: home });
      try { await purgeProjectMemories({ backend: null, ledger }, projectId); } finally { ledger.close(); }
    },
  };
}

/** The search index is kept up by the Host that runs the search service; a process without it leaves the project's entries to that Host. */
function searchOwnerWithoutService(home: string): ProjectDeletedOwner {
  const check = () => {
    if (existsSync(homeSqlitePath(home, TEXT_SEARCH_STORE))) throw new ProjectDeletedDeferred("搜索索引由运行中的 Molis Work 维护；它会接着清掉这个项目的条目", true);
  };
  return { ...SEARCH_OWNER, check, clear: check };
}

/**
 * The owners of a project's data in the Home that are plain files, as the packages that keep them declare it. A built-in plugin's
 * library says which of its rows belong to a project (`databases.home.project_rows` in its Manifest) and the platform deletes those
 * rows itself, running no code of the plugin's (PG-024); a plugin whose data is more than rows (Images, BL-615) still says on its
 * catalog entry (`project_data`) how to clear it. Both come from the catalog without the Host naming the plugin. The modules that are no
 * plugin, Functions and Characters, export the same declaration, and the Host names them here. They run in the order the declarations
 * ask (`order`, then catalog order), which is the order the confirmation dialog lists them in.
 */
function declaredProjectOwners(home: string): ProjectDeletedOwner[] {
  const declared: Array<{ id: string; label: string; order?: number; clear: ProjectDeletedOwner["clear"] }> = [
    ...PLATFORM_PLUGIN_REGISTRATIONS.flatMap(entry => {
      const library = entry.manifest.databases?.home, pluginId = entry.manifest.plugin_id;
      if (library?.project_rows) {
        return [{ id: entry.project_plugin_id, label: library.project_rows.label, order: library.project_rows.order,
          clear: (projectId: string, _deletion: Parameters<ProjectDeletedOwner["clear"]>[1], control: Parameters<ProjectDeletedOwner["clear"]>[2]) => clearProjectRows(home, library, pluginId, projectId, control) }];
      }
      if (!entry.project_data) return [];
      const partitioned = entry.runtime && library?.partition === "project" ? library.store_name : undefined;
      return [ownerOf(home, entry.project_plugin_id, entry.project_data, partitioned)];
    }),
    // Characters keeps its native runs by project in a library of the Home; the drafts it also keeps are the person's and stay.
    ownerOf(home, "characters", charactersProjectData),
    ownerOf(home, "functions", functionsProjectData),
  ];
  return declared.map((item, position) => ({ ...item, position }))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.position - b.position)
    .map(({ id, label, clear }) => ({ id, label, clear }));
}

function ownerOf(home: string, id: string, data: ProjectDataDeclaration, partitioned?: string) {
  return { id, label: data.label, order: data.order, clear: partitioned ? removePartition(home, data, partitioned) : purgeOf(home, id, data) };
}

function purgeOf(home: string, id: string, data: ProjectDataDeclaration): ProjectDeletedOwner["clear"] {
  if (!data.purge) throw new Error(`${id} 的项目数据没有清理办法（purge）`);
  return (projectId, _deletion, control) => { control?.assertCurrent(); return data.purge!(home, projectId, control); };
}

/**
 * A Home plugin whose library is partitioned by project, cleared without its instance running here: its own `purge`, if it has one,
 * then the project's library goes. The running instance's owner (`plugin-project-cleanup.ts`) replaces this one while it runs.
 */
function removePartition(home: string, data: ProjectDataDeclaration, store: string): ProjectDeletedOwner["clear"] {
  return async (projectId, _deletion, control) => {
    control?.assertCurrent();
    const directory = homeSqlitePartitionDirectory(home, store, projectId);
    const target = control ? inspectExistingStoragePath(directory, "directory") : undefined;
    await data.purge?.(home, projectId, control);
    control?.assertCurrent();
    target?.assertCurrent();
    if (control) rmSync(directory, { recursive: true, force: true });
    else await rm(directory, { recursive: true, force: true });
  };
}

/**
 * The owners whose data of a project is plain files in the Home: the personal libraries partitioned by `project_id`.
 * Any process on the Home can clear them, so every catalog starts with these; owners that need a running service
 * (runtimes, the search index, the Agent runtime) register themselves when that service exists. Each library's own
 * package says what it deletes and what the confirmation dialog calls its data; this lists only the owners that are
 * part of the Host itself.
 */
export function homeProjectOwners(home: string): ProjectDeletedOwner[] {
  return [
    ...declaredProjectOwners(home),
    // Without a running Host there is no studio to close, only its directory to remove; the Host's own owner replaces this one.
    { id: "alchemist", label: "炼金术士的研究空间", clear: (projectId, _deletion, control) => { control?.assertCurrent(); const directory = alchemistProjectDirectory(home, projectId);
      if (control) { inspectExistingStoragePath(directory, "directory").assertCurrent(); return rmSync(directory, { recursive: true, force: true }); }
      return rm(directory, { recursive: true, force: true }); } },
    pluginBuilderProjectOwner(home),
    // Without a running Assistant nothing is queued or running for these works, so their rows are all there is to clear.
    { id: "assistant", label: "助理在这个项目里的工作", clear: async (projectId, _deletion, control) => { await purgeAssistantProject(home, projectId, undefined, control); } },
    // Project knowledge's cards (what the person edited on them, and what organizing used) are a plain library any process clears.
    { id: "knowledge", label: "项目资料的卡片与整理记录", clear: (projectId, _deletion, control) => { clearKnowledgeProject(home, projectId, control); } },
    // Where a project's plugins may read an imported file again: only the Host's record of the place goes, never the person's file.
    { id: "plugin-originals", label: null, clear: (projectId, _deletion, control) => { forgetProjectOriginalFiles(home, projectId, control); } },
    // Which account a plugin uses for each of its records in the project (`per_record` slots); the accounts are the person's and stay.
    { id: "plugin-connections", label: null, clear: (projectId, _deletion, control) => { forgetProjectConnectionBindings(home, projectId, control); } },
    // Their services exist only in a Host: here they wait for it (the Host's own owners take these ids over while it runs).
    memoryOwnerWithoutService(home),
    searchOwnerWithoutService(home),
  ];
}
