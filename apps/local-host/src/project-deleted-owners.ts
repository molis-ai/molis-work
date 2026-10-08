import { purgePagesProject } from "@molis-ai/molis-work-plugin-pages";
import { purgeFormProject } from "@molis-ai/molis-work-plugin-form";
import { purgeDatasetProject } from "@molis-ai/molis-work-plugin-dataset";
import { purgePptProject } from "@molis-ai/molis-work-plugin-ppt";
import { purgeWorkflowsProject } from "@molis-ai/molis-work-plugin-workflows";
import { purgeTodoProject } from "@molis-ai/molis-work-plugin-todo";
import { purgeLingguangProject } from "@molis-ai/molis-work-plugin-lingguang";
import { purgeImagesProject } from "@molis-ai/molis-work-plugin-images";
import { purgeFunctionsProject } from "@molis-ai/molis-work-module-functions";
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
 * The owners whose data of a project is plain files in the Home: the personal libraries partitioned by `project_id`.
 * Any process on the Home can clear them, so every catalog starts with these; owners that need a running service
 * (runtimes, the search index, the Agent runtime) register themselves when that service exists. Each library's own
 * package says what it deletes; this only names the owner and what the confirmation dialog calls its data.
 */
export function homeProjectOwners(home: string): ProjectDeletedOwner[] {
  return [
    { id: "pages", label: "Pages 文稿与文件夹", clear: projectId => purgePagesProject(home, projectId) },
    { id: "form", label: "Forms 问卷及收到的全部回答", clear: projectId => purgeFormProject(home, projectId) },
    { id: "dataset", label: "Dataset 数据表", clear: projectId => purgeDatasetProject(home, projectId) },
    { id: "ppt", label: "PPT 演示稿", clear: projectId => purgePptProject(home, projectId) },
    { id: "workflows", label: "工作流程及其运行记录", clear: projectId => purgeWorkflowsProject(home, projectId) },
    { id: "todo", label: "放在这个项目里的待办", clear: projectId => purgeTodoProject(home, projectId) },
    { id: "functions", label: "判断规则在这个项目里的场景绑定和判断记录", clear: projectId => purgeFunctionsProject(home, projectId) },
    { id: "lingguang", label: "灵光里的想法与对话", clear: projectId => purgeLingguangProject(home, projectId) },
    { id: "images", label: "图片生成记录和已生成的图片", clear: projectId => purgeImagesProject(home, projectId) },
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
