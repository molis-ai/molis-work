import { promises as fs } from "node:fs";
import { lstatSync, type Stats } from "node:fs";
import path from "node:path";
import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import { PROJECT_DATABASE_FILENAME } from "@molis-ai/molis-work-storage";
import { catalogErrors } from "./project-catalog-contract.js";
export function managedProjectDirectory(projectsDirectory: string, project: MolisWorkProjectRecord): string {
    const directory = path.join(projectsDirectory, project.project_id);
    const actual = path.resolve(project.database_path);
    if (actual !== path.resolve(directory, PROJECT_DATABASE_FILENAME)) {
      throw catalogErrors.project_storage_invalid("项目目录记录不指向 Molis Work 自己管理的项目数据库，拒绝删除",
      );
    }
    return directory;
  }

export async function exists(filePath: string): Promise<boolean> {
  return (await statOrNull(filePath)) != null;
}

async function statOrNull(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** One selected directory across the asynchronous cleanup interval. A replacement is never adopted as the original. */
export function holdProjectDeletionDirectory(projectsDirectory: string, projectId: string, staged: string, retained: boolean,
  assertCurrent: () => void) {
  const source = path.join(projectsDirectory, projectId);
  if (path.dirname(staged) !== projectsDirectory || !path.basename(staged).startsWith(`.deleting-${projectId}-`))
    throw catalogErrors.project_storage_invalid("原目标暂存目录不在本项目的管理范围");
  const stat = (filename: string): Stats | null => {
    try { const result = lstatSync(filename); if (!result.isDirectory() || result.isSymbolicLink()) throw new Error("directory replaced"); return result; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  };
  let selectedSource = stat(source), selectedStage = stat(staged);
  if ((selectedSource && selectedStage) || (!selectedSource && !selectedStage && retained))
    throw catalogErrors.project_storage_invalid("原目标目录状态不能确认");
  const same = (actual: Stats | null, expected: Stats | null) => actual === null ? expected === null
    : expected !== null && actual.dev === expected.dev && actual.ino === expected.ino;
  const current = () => {
    assertCurrent();
    if (!same(stat(source), selectedSource) || !same(stat(staged), selectedStage))
      throw catalogErrors.project_storage_invalid("已选项目目录在清理期间被替换");
  };
  return {
    assertCurrent: current,
    async stage() {
      current();
      if (!selectedSource) return;
      await fs.rename(source, staged);
      selectedStage = selectedSource; selectedSource = null;
      current();
    },
    async remove() {
      current();
      await fs.rm(staged, { recursive: true, force: true });
      selectedStage = null;
      current();
    },
  };
}
