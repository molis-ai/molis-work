import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectWorkspaceActions } from "@molis-ai/molis-work-contracts/modules/projects";
import type { pickLocalDirectory } from "./directory-picker.js";
import { decodeLocalWebPathPart, respondLocalWebRefusal } from "./web-http.js";

/** The page's half of a project's folder membership; the membership itself is the project setting's actions (`project-workspace-actions.ts`). */
export interface ProjectWorkspaceHttpContext {
  method: string | undefined;
  pathname: string;
  hasProject: boolean;
  actions: BoundActionClient;
  readBody(): Promise<Record<string, unknown>>;
  respond(status: number, body: unknown): void;
  /** Opens the system folder window on the computer running this host. */
  pickDirectory(): ReturnType<typeof pickLocalDirectory>;
}

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

async function addWorkspace(context: ProjectWorkspaceHttpContext) {
  const body = await context.readBody();
  const workspacePath = typeof body.workspace_path === "string" ? body.workspace_path.trim() : "";
  if (body.user_confirmed !== true || !workspacePath) {
    context.respond(400, { error: "请选择目录并确认关联当前 Project" });
    return;
  }
  try {
    context.respond(201, await context.actions.invoke(projectWorkspaceActions.add, { workspace_path: workspacePath }));
  } catch (error) {
    respondLocalWebRefusal(context, error);
  }
}

async function repairWorkspace(context: ProjectWorkspaceHttpContext, encodedWorkspaceId: string) {
  const body = await context.readBody();
  const nextPath = typeof body.workspace_path === "string" ? body.workspace_path.trim() : "";
  if (body.user_confirmed !== true || !nextPath) {
    context.respond(400, { error: "请输入新的绝对路径并确认修复" });
    return;
  }
  try {
    const workspaceId = decodeLocalWebPathPart(encodedWorkspaceId);
    context.respond(200, await context.actions.invoke(projectWorkspaceActions.repair, { workspace_id: workspaceId, workspace_path: nextPath }));
  } catch (error) {
    respondLocalWebRefusal(context, error);
  }
}

async function unlinkWorkspace(context: ProjectWorkspaceHttpContext, encodedWorkspaceId: string) {
  const body = await context.readBody();
  if (body.user_confirmed !== true) {
    context.respond(400, { error: "请确认解除当前 Project 的工作目录关系" });
    return;
  }
  try {
    const workspaceId = decodeLocalWebPathPart(encodedWorkspaceId);
    context.respond(200, await context.actions.invoke(projectWorkspaceActions.unlink, { workspace_id: workspaceId }));
  } catch (error) {
    respondLocalWebRefusal(context, error);
  }
}

/** The handler for this request, with the folder id its path names; null when the request is not one of these four. */
function workspaceRoute(method: string | undefined, pathname: string): ((context: ProjectWorkspaceHttpContext) => Promise<void>) | null {
  if (method === "POST" && pathname === "/api/workspaces/pick") return pickWorkspace;
  if (method === "POST" && pathname === "/api/workspaces") return addWorkspace;
  const repair = method === "PATCH" ? pathname.match(/^\/api\/workspaces\/([^/]+)\/path$/) : null;
  if (repair) return (context) => repairWorkspace(context, repair[1]);
  const unlink = method === "POST" ? pathname.match(/^\/api\/workspaces\/([^/]+)\/unlink$/) : null;
  if (unlink) return (context) => unlinkWorkspace(context, unlink[1]);
  return null;
}

/**
 * Linking, repairing and unlinking the project's folders, and the folder window that picks one. A folder is a project
 * setting kept by the Home catalog; this only adapts the form to its actions. Starting a Session in a folder stays with Work.
 * A refused action answers by its kind and with its code; the folder window's answers (cancelled, busy, unavailable) are results.
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
