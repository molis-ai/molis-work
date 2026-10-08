import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { DATASET_STORE_BASELINE } from "./store.js";

/**
 * The project is deleted: its datasets go with their saved versions and the receipts of datasets made into it. Works
 * on the library's file, so any process on the Home can run it; running it again finds nothing.
 */
export function purgeDatasetProject(homeDirectory: string, projectId: string): void {
  clearInExistingHomeSqlite(homeDirectory, "dataset", DATASET_STORE_BASELINE, (db) => {
    db.prepare("DELETE FROM dataset_versions WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id = ?)").run(projectId);
    db.prepare("DELETE FROM datasets WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM dataset_receipts WHERE project_id = ?").run(projectId);
  });
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const datasetProjectData: ProjectDataDeclaration = { label: "Dataset 数据表", order: 30, purge: purgeDatasetProject };
