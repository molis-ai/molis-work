import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { artifactsProjectData } from "@molis-ai/molis-work-module-artifacts";
import { charactersProjectData } from "@molis-ai/molis-work-module-characters";
import { functionsProjectData } from "@molis-ai/molis-work-module-functions";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { purgeProjectMemories } from "@molis-ai/molis-work-service-memory";
import { MEMORY_LEDGER_STORE, TEXT_SEARCH_STORE, clearKnowledgeProject, hasStorageBusinessFiles, homeSqlitePartitionDirectory, homeSqlitePath, openMemoryLedger } from "@molis-ai/molis-work-storage";
import type { ProjectDeletedOwner } from "./project-deleted-hooks.js";
import { ProjectDeletedDeferred } from "./project-deleted-deferred.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { alchemistProjectDirectory } from "./alchemist-paths.js";
import { pluginBuilderProjectOwner } from "./plugin-builder/project-data.js";
import { clearProjectRows } from "./plugin-project-rows.js";
import { partitionLabel } from "./plugin-project-cleanup.js";
import { purgeAssistantProject } from "./assistant/assistant-project-purge.js";
import { forgetProjectOriginalFiles } from "./material-original-files.js";
import { forgetProjectConnectionBindings } from "./connector-plugin-requests.js";
import { forgetOrphanedInstallationBindings } from "./plugin-installation-cleanup.js";

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
    if (hasStorageBusinessFiles(agentRuntimeDirectory(home))) throw new ProjectDeletedDeferred("记忆放在 Agent 执行服务里，这个入口不运行它；由运行中的 Molis Work 清理，它会接着做", true);
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
 * The owners of a project's data in the Home that are plain files, as the packages that keep them declare it. A built-in plugin's
 * library says which of its rows belong to a project (`databases.home.project_rows` in its Manifest) and the platform deletes those
 * rows itself, with the files of its own (`owner_files`) the rows name, running no code of the plugin's (PG-024); a library
 * partitioned by project goes whole. Both come from the catalog without the Host naming the plugin. The modules that are no plugin,
 * Functions, Characters and the 成果库's originals, export a declaration of what they keep (`ProjectDataDeclaration`), and the Host
 * names them here. They run in the order the declarations
 * ask (`order`, then catalog order), which is the order the confirmation dialog lists them in.
 */
type DeclaredOwner = Pick<ProjectDeletedOwner, "id" | "label_values" | "words_of"> & { label: string; order?: number; clear: (projectId: string) => void | Promise<void> };

function declaredProjectOwners(home: string): ProjectDeletedOwner[] {
  const declared: DeclaredOwner[] = [
    ...PLATFORM_PLUGIN_REGISTRATIONS.flatMap((entry): DeclaredOwner[] => {
      const library = entry.manifest.databases?.home, pluginId = entry.manifest.plugin_id;
      if (library?.project_rows) {
        return [{ id: entry.project_plugin_id, label: library.project_rows.label, order: library.project_rows.order, words_of: pluginId,
          clear: (projectId: string) => clearProjectRows(home, library, pluginId, projectId, entry.manifest.owner_files) }];
      }
      if (!entry.runtime || library?.partition !== "project") return [];
      const store = library.store_name;
      return [{ id: entry.project_plugin_id, ...partitionLabel(entry.manifest.name), words_of: pluginId,
        clear: (projectId: string) => rm(homeSqlitePartitionDirectory(home, store, projectId), { recursive: true, force: true }) }];
    }),
    // Characters keeps its native runs by project in a library of the Home; the drafts it also keeps are the person's and stay.
    ownerOf(home, "characters", charactersProjectData),
    // The 成果库's originals, kept by the module that writes them (the receipt's id is the one the plugin's entry gave it).
    ownerOf(home, "artifacts", artifactsProjectData),
    ownerOf(home, "functions", functionsProjectData),
  ];
  return declared.map((item, position) => ({ ...item, position }))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.position - b.position)
    .map(({ id, label, label_values, clear, words_of }) => ({ id, label, clear, ...(label_values ? { label_values } : {}), ...(words_of ? { words_of } : {}) }));
}

/** A module of the Host's own: its label is in the Host's words. */
function ownerOf(home: string, id: string, data: ProjectDataDeclaration) {
  return { id, label: data.label, order: data.order, clear: (projectId: string) => data.purge(home, projectId) };
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
    // Project knowledge's cards (what the person edited on them, and what organizing used) are a plain library any process clears.
    { id: "knowledge", label: "项目资料的卡片与整理记录", clear: projectId => { clearKnowledgeProject(home, projectId); } },
    // Where a project's plugins may read an imported file again: only the Host's record of the place goes, never the person's file.
    { id: "plugin-originals", label: null, clear: projectId => { forgetProjectOriginalFiles(home, projectId); } },
    // Which account a plugin uses for each of its records in the project (`per_record` slots); the accounts are the person's and stay.
    { id: "plugin-connections", label: null, clear: projectId => { forgetProjectConnectionBindings(home, projectId); forgetOrphanedInstallationBindings(home); } },
    // Their services exist only in a Host: here they wait for it (the Host's own owners take these ids over while it runs).
    memoryOwnerWithoutService(home),
    searchOwnerWithoutService(home),
  ];
}
