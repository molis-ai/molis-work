import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectDirectoryActions, type ProjectDirectories, type ProjectDirectoryPage, type SourceKind } from "@molis-ai/molis-work-contracts/modules/projects";
import { isProjectOutputWorkspaceId } from "@molis-ai/molis-work-module-projects";
import type { pickLocalDirectory } from "./directory-picker.js";
import { respondLocalWebRefusal } from "./web-http.js";

/** The page's half of a project's directories; the directories themselves are the project setting's actions (`project-workspace-actions.ts`). */
export interface ProjectWorkspaceHttpContext {
  method: string | undefined;
  pathname: string;
  hasProject: boolean;
  actions: BoundActionClient;
  readBody(): Promise<Record<string, unknown>>;
  respond(status: number, body: unknown): void;
  /** Opens the system folder window on the computer running this host. */
  pickDirectory(): ReturnType<typeof pickLocalDirectory>;
  /** What the page draws besides the directories: the project's default output directory and whether it is made yet (`directoryPage`), from the directories already read for this request. */
  defaultOutput(read: ProjectDirectories): Promise<{ workspace_id: string; made: boolean }>;
}

/**
 * What the settings page draws besides `projects.directories.get@1`: which folder is the default output directory (shown by that name,
 * and offered to set back), whether it is made yet (it is made the first time it is used, SSC-24), and what each source link's folder was.
 * Read for the page only; nothing here is a fact the page could change.
 */
export function directoryPage(directories: ProjectDirectories, defaultOutput: { workspace_id: string; made: boolean }): ProjectDirectoryPage {
  const kind = (source: string): SourceKind => source === defaultOutput.workspace_id ? "former_default_output" : isProjectOutputWorkspaceId(source) ? "other_default_output" : "folder";
  return { default_output_id: defaultOutput.workspace_id, default_output_made: defaultOutput.made,
    source_kinds: Object.fromEntries(directories.source_links.map(link => [link.source_workspace_id, kind(link.source_workspace_id)])) };
}

/** The settings page's changes, each one of `projects.directories.*`, by the name the page posts. */
const CHANGES: Readonly<Record<string, ActionDefinition<never, ProjectDirectories>>> = {
  add_input: projectDirectoryActions.addInput as ActionDefinition<never, ProjectDirectories>,
  remove_input: projectDirectoryActions.removeInput as ActionDefinition<never, ProjectDirectories>,
  set_output: projectDirectoryActions.setOutput as ActionDefinition<never, ProjectDirectories>,
  repair: projectDirectoryActions.repair as ActionDefinition<never, ProjectDirectories>,
  map_source: projectDirectoryActions.mapSource as ActionDefinition<never, ProjectDirectories>,
  unmap_source: projectDirectoryActions.unmapSource as ActionDefinition<never, ProjectDirectories>,
};

async function pickWorkspace(context: ProjectWorkspaceHttpContext) {
  // A body that is not JSON or too large is refused like on every other route, by the Host's exit.
  await context.readBody();
  try {
    const picked = await context.pickDirectory();
    if (picked.status === "picked") context.respond(200, { path: picked.path });
    else if (picked.status === "cancelled") context.respond(200, { cancelled: true });
    else if (picked.status === "busy") context.respond(409, { error: "目录选择窗口已经打开" });
    else context.respond(503, { error: picked.message });
  } catch (error) {
    context.respond(503, { error: error instanceof Error ? error.message : "这台电脑打不开目录选择窗口" });
  }
}

/**
 * GET reads the directories; POST `{ change, input }` makes one change, its input checked by the action's own schema (with
 * `expected_revision`). Both answer the directories as the action does, with `page` for drawing them (`directoryPage`).
 */
async function directories(context: ProjectWorkspaceHttpContext) {
  const answer = async (read: ProjectDirectories) => ({ ...read, page: directoryPage(read, await context.defaultOutput(read)) });
  try {
    if (context.method === "GET") { context.respond(200, await answer(await context.actions.invoke(projectDirectoryActions.get, {}))); return; }
    const body = await context.readBody();
    const definition = typeof body.change === "string" && Object.hasOwn(CHANGES, body.change) ? CHANGES[body.change] : undefined;
    if (!definition || Object.keys(body).some(key => key !== "change" && key !== "input")) { context.respond(400, { error: "目录改动无效" }); return; }
    context.respond(200, await answer(await context.actions.invoke(definition, body.input as never)));
  } catch (error) {
    respondLocalWebRefusal(context, error);
  }
}

function workspaceRoute(method: string | undefined, pathname: string): ((context: ProjectWorkspaceHttpContext) => Promise<void>) | null {
  if (method === "POST" && pathname === "/api/workspaces/pick") return pickWorkspace;
  if ((method === "GET" || method === "POST") && pathname === "/api/project-settings/directories") return directories;
  return null;
}

/**
 * The project's inputs and output as the settings page reads and changes them, and the folder window that picks one. They are a project
 * setting kept by the Home catalog; this only adapts the form to its actions, as the person under the project setting's permission. A
 * refused action answers by its kind and with its code; the folder window's answers (cancelled, busy, unavailable) are results.
 */
export async function handleProjectWorkspaceHttp(context: ProjectWorkspaceHttpContext): Promise<boolean> {
  const route = workspaceRoute(context.method, context.pathname);
  if (!route) return false;
  if (!context.hasProject) {
    context.respond(400, { error: "请先选择 Project" });
    return true;
  }
  await route(context);
  return true;
}
