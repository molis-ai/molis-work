import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import type { ProjectDirectories, ProjectDirectory } from "@molis-ai/molis-work-contracts/modules/projects";

/**
 * A project's inputs and output changed over HTTP as the settings page changes them: `GET|POST /api/project-settings/directories`, each
 * change one of `projects.directories.*`, committed from the revision read just before it. A folder only added is an input (read only);
 * writing, running a terminal or a Character in it needs it to be the project's one output (specs/shared-sources-and-surfaces SSC-15, SSC-17).
 */
export interface DirectoriesWeb {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export type DirectoryChangeName = "add_input" | "remove_input" | "set_output" | "repair" | "map_source" | "unmap_source" | "set_instructions";

type Reply = { status: number; body: unknown };

/** A `DirectoriesWeb` over a test's own `request(url, method, body)`, which answers status and body: a refusal fails the test. */
export function directoriesWebOf(request: (url: string, method?: string, body?: unknown) => Promise<Reply>): DirectoriesWeb {
  const ok = async <T>(reply: Promise<Reply>, what: string) => {
    const { status, body } = await reply;
    assert.equal(status, 200, `${what}: ${JSON.stringify(body)}`);
    return body as T;
  };
  return {
    get: <T>(path: string) => ok<T>(request(path), `GET ${path}`),
    post: <T>(path: string, body: unknown) => ok<T>(request(path, "POST", body), `POST ${path} ${JSON.stringify(body)}`),
  };
}

export const projectDirectoriesPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/api/project-settings/directories`;

export const readProjectDirectories = (web: DirectoriesWeb, projectId: string) => web.get<ProjectDirectories>(projectDirectoriesPath(projectId));

/** One change from the revision read now, as the settings page makes it. */
export async function changeProjectDirectories(web: DirectoriesWeb, projectId: string, change: DirectoryChangeName, input: Record<string, unknown>): Promise<ProjectDirectories> {
  const { revision } = await readProjectDirectories(web, projectId);
  return web.post<ProjectDirectories>(projectDirectoriesPath(projectId), { change, input: { ...input, expected_revision: revision } });
}

/** The project's one output directory. */
export function projectOutputOf(directories: ProjectDirectories): ProjectDirectory {
  const outputs = directories.directories.filter(item => item.roles.includes("output"));
  assert.equal(outputs.length, 1, JSON.stringify(directories));
  return outputs[0]!;
}

/** The folder at `workspacePath` among the project's directories. */
export async function projectFolderAt(directories: ProjectDirectories, workspacePath: string): Promise<ProjectDirectory> {
  const canonical = await realpath(workspacePath);
  const folder = directories.directories.find(item => item.canonical_path === canonical);
  assert.ok(folder, `${canonical} is one of the project's directories: ${JSON.stringify(directories)}`);
  return folder;
}

/** Makes the folder at `workspacePath` the project's output (linking it if it is not yet one of its folders) and answers it. */
export async function setProjectOutputFolder(web: DirectoriesWeb, projectId: string, workspacePath: string): Promise<ProjectDirectory> {
  const after = await changeProjectDirectories(web, projectId, "set_output", { workspace_path: workspacePath });
  const output = projectOutputOf(after);
  assert.equal(output.canonical_path, await realpath(workspacePath), JSON.stringify(after));
  return output;
}

/** Adds the folder at `workspacePath` as an input and answers it. */
export async function addProjectInputFolder(web: DirectoriesWeb, projectId: string, workspacePath: string): Promise<ProjectDirectory> {
  const folder = await projectFolderAt(await changeProjectDirectories(web, projectId, "add_input", { workspace_path: workspacePath }), workspacePath);
  assert.ok(folder.roles.includes("input"), JSON.stringify(folder));
  return folder;
}
