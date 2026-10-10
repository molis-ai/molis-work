import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { functionsProjectData } from "@molis-ai/molis-work-module-functions";
import { sessionsProjectData } from "@molis-ai/molis-work-module-private-work-context";
import { createSessionLedger } from "./session-registry.js";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { purgeProjectMemories } from "@molis-ai/molis-work-service-memory";
import { MEMORY_LEDGER_STORE, TEXT_SEARCH_STORE, homeSqlitePath, openMemoryLedger } from "@molis-ai/molis-work-storage";
import type { ProjectDeletedOwner } from "./project-deleted-hooks.js";
import { ProjectDeletedDeferred } from "./project-deleted-deferred.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { alchemistProjectDirectory } from "./alchemist-paths.js";
import { pluginBuilderProjectOwner } from "./plugin-builder/project-data.js";
import { purgeAssistantProject } from "./assistant/assistant-project-purge.js";

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
  const check = () => {
    if (existsSync(agentRuntimeDirectory(home))) throw new ProjectDeletedDeferred("记忆放在 Agent 执行服务里，这个入口不运行它；由运行中的 Molis Work 清理，它会接着做", true);
  };
  return {
    ...MEMORY_OWNER, check,
    async clear(projectId) {
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
 * The owners of a project's data in the Home that are plain files, as the packages that keep them declare it: each
 * built-in plugin says on its catalog entry (`project_data`) what it keeps and how to clear it, and the Functions module,
 * and the modules that are no plugin (Functions, the Sessions registry) export the same. The Host names none of them; a plugin added to the catalog with a declaration
 * is cleared by the next deletion. They run in the order the declarations ask (`order`, then catalog order), which is the
 * order the confirmation dialog lists them in.
 */
function declaredProjectOwners(home: string): ProjectDeletedOwner[] {
  const declared: Array<{ id: string; data: ProjectDataDeclaration; survivesRebuild?: true }> = [
    ...BUILTIN_PLUGIN_CATALOG.flatMap(entry => entry.project_data ? [{ id: entry.project_plugin_id, data: entry.project_data }] : []),
    { id: "functions", data: functionsProjectData },
    // The demo's reset keeps its panels and Runtime bindings, so the Sessions they name stay with them.
    { id: "sessions", data: sessionsProjectData(db => createSessionLedger(db)), survivesRebuild: true },
  ];
  return declared.map((item, position) => ({ ...item, position }))
    .sort((a, b) => (a.data.order ?? Number.MAX_SAFE_INTEGER) - (b.data.order ?? Number.MAX_SAFE_INTEGER) || a.position - b.position)
    .map(({ id, data, survivesRebuild }) => ({ id, label: data.label, ...(survivesRebuild ? { survivesRebuild } : {}), clear: projectId => data.purge(home, projectId) }));
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
    { id: "alchemist", label: "炼金术士的研究空间", clear: projectId => rm(alchemistProjectDirectory(home, projectId), { recursive: true, force: true }) },
    pluginBuilderProjectOwner(home),
    // Without a running Assistant nothing is queued or running for these works, so their rows are all there is to clear.
    { id: "assistant", label: "助理在这个项目里的工作", clear: async projectId => { await purgeAssistantProject(home, projectId); } },
    // Their services exist only in a Host: here they wait for it (the Host's own owners take these ids over while it runs).
    memoryOwnerWithoutService(home),
    searchOwnerWithoutService(home),
  ];
}
