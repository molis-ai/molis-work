import { purgePagesProject } from "@molis-ai/molis-work-plugin-pages";
import { purgeFormProject } from "@molis-ai/molis-work-plugin-form";
import { purgeDatasetProject } from "@molis-ai/molis-work-plugin-dataset";
import { purgePptProject } from "@molis-ai/molis-work-plugin-ppt";
import { purgeWorkflowsProject } from "@molis-ai/molis-work-plugin-workflows";
import { purgeTodoProject } from "@molis-ai/molis-work-plugin-todo";
import { purgeLingguangProject } from "@molis-ai/molis-work-plugin-lingguang";
import { purgeImagesProject } from "@molis-ai/molis-work-plugin-images";
import { purgeFunctionsProject } from "@molis-ai/molis-work-module-functions";
import type { ProjectDeletedOwner } from "./project-deleted-hooks.js";

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
  ];
}
