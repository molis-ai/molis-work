import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

/** This store in the Home's store registry: `artifacts/projects/<project>/originals/<sha256>`. The module keeps the reading and writing (`modules/artifacts`). */
export const ARTIFACTS_HOME_STORE: NonNullable<PluginRegistration["home_store"]> = { path: "artifacts" };

/** The project is deleted: its stored originals go. Idempotent; works on the files, so any process on the Home can run it. */
async function purgeArtifactOriginals(home: string, projectId: string): Promise<void> {
  if (!projectId) throw new Error("project id required");
  await rm(join(home, ARTIFACTS_HOME_STORE.path, "projects", encodeURIComponent(projectId).replaceAll(".", "%2E")), { recursive: true, force: true });
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const artifactsProjectData: ProjectDataDeclaration = { label: "成果库保存的大文件原件", purge: purgeArtifactOriginals };
