import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import { LEGACY_PROJECT_DATABASE_FILENAME, PROJECT_DATABASE_FILENAME } from "@molis-ai/molis-work-storage";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
export function managedProjectDirectory(projectsDirectory: string, project: MolisWorkProjectRecord): string {
    const directory = path.join(projectsDirectory, project.project_id);
    const actual = path.resolve(project.database_path);
    const owned = [PROJECT_DATABASE_FILENAME, LEGACY_PROJECT_DATABASE_FILENAME]
      .map((filename) => path.resolve(directory, filename));
    if (!owned.includes(actual)) {
      throw new MolisWorkProjectCatalogError(
        "catalog.project_storage_invalid",
        "项目目录记录不指向 Molis Work 自己管理的项目数据库，拒绝删除",
      );
    }
    return directory;
  }

export function isWithin(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function exists(filePath: string): Promise<boolean> {
  return (await statOrNull(filePath)) != null;
}

export async function statOrNull(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
