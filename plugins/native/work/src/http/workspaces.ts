import { PrivateWorkContextError as MolisWorkSessionError } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { WorkSessionHttpContext } from "./types.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { workActions } from "../actions.js";
import { projectWorkspaceActions } from "@molis-ai/molis-work-contracts/modules/projects";

const actions = (context: WorkSessionHttpContext) => {
  if (!context.actions) throw new Error("Session 服务尚未接通动作调用");
  return context.actions;
};
/** The same answers the page had before: unknown folder 404, a change that had to roll back or needs recovery 503. */
function respondMembershipError(context: WorkSessionHttpContext, error: unknown): void {
  const code = error instanceof ActionError ? error.code : "";
  context.respond(code === "projects.workspace_not_found" ? 404
    : error instanceof MolisWorkSessionError || code.startsWith("workspace.") || code === "actions.service_unavailable" || code === "actions.unredeemed" ? 503 : 400,
  { error: error instanceof Error ? error.message : String(error) });
}

/** Folder membership is a project setting kept by the Home catalog and changed through its actions; Work owns the page flow and the confirmed launch. */
export async function handleWorkspaceHttp(context: WorkSessionHttpContext): Promise<boolean> {
  const options = context.projectOptions;
  if (context.method === "POST" && context.pathname === "/api/workspaces/pick") {
    if (!options.project) {
      context.respond(400, { error: "请先选择 Project" });
      return true;
    }
    try {
      await context.readBody();
    } catch (error) {
      context.respond(400, { error: error instanceof Error ? error.message : "请求不是有效 JSON" });
      return true;
    }
    try {
      const picked = await context.pickDirectory();
      if (picked.status === "picked") context.respond(200, { path: picked.path });
      else if (picked.status === "cancelled") context.respond(200, { cancelled: true });
      else if (picked.status === "busy") context.respond(409, { error: "目录选择窗口已经打开" });
      else context.respond(503, { error: picked.message });
    } catch (error) {
      context.respond(503, { error: error instanceof Error ? error.message : "这台电脑打不开目录选择窗口" });
    }
    return true;
  }
  if (context.method === "POST" && context.pathname === "/api/workspaces") {
    if (!options.project) {
      context.respond(400, { error: "请先选择 Project" });
      return true;
    }
    const body = await context.readBody();
    const workspacePath = typeof body.workspace_path === "string" ? body.workspace_path.trim() : "";
    if (body.user_confirmed !== true || !workspacePath) {
      context.respond(400, { error: "请选择目录并确认关联当前 Project" });
      return true;
    }
    try {
      context.respond(201, await actions(context).invoke(projectWorkspaceActions.add, { workspace_path: workspacePath }));
    } catch (error) {
      context.respond(400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  const projectWorkspaceRepairMatch = context.pathname.match(/^\/api\/workspaces\/([^/]+)\/path$/);
  if (context.method === "PATCH" && projectWorkspaceRepairMatch) {
    if (!options.project) {
      context.respond(400, { error: "请先选择 Project" });
      return true;
    }
    const body = await context.readBody();
    const workspaceId = decodeURIComponent(projectWorkspaceRepairMatch[1]);
    const nextPath = typeof body.workspace_path === "string" ? body.workspace_path.trim() : "";
    if (body.user_confirmed !== true || !nextPath) {
      context.respond(400, { error: "请输入新的绝对路径并确认修复" });
      return true;
    }
    try {
      context.respond(200, await actions(context).invoke(projectWorkspaceActions.repair, { workspace_id: workspaceId, workspace_path: nextPath }));
    } catch (error) {
      respondMembershipError(context, error);
    }
    return true;
  }
  const projectWorkspaceUnlinkMatch = context.pathname.match(/^\/api\/workspaces\/([^/]+)\/unlink$/);
  if (context.method === "POST" && projectWorkspaceUnlinkMatch) {
    if (!options.project) {
      context.respond(400, { error: "请先选择 Project" });
      return true;
    }
    const body = await context.readBody();
    const workspaceId = decodeURIComponent(projectWorkspaceUnlinkMatch[1]);
    if (body.user_confirmed !== true) {
      context.respond(400, { error: "请确认解除当前 Project 的工作目录关系" });
      return true;
    }
    try {
      context.respond(200, await actions(context).invoke(projectWorkspaceActions.unlink, { workspace_id: workspaceId }));
    } catch (error) {
      respondMembershipError(context, error);
    }
    return true;
  }
  const projectWorkspaceLaunchMatch = context.pathname.match(/^\/api\/workspaces\/([^/]+)\/sessions$/);
  if (context.method === "POST" && projectWorkspaceLaunchMatch) {
    if (!options.project) {
      context.respond(400, { error: "请先选择 Project" });
      return true;
    }
    const body = await context.readBody();
    const workspaceId = decodeURIComponent(projectWorkspaceLaunchMatch[1]);
    if (body.user_confirmed !== true) {
      context.respond(400, { error: "请确认 Runtime、Project、Goal 和工作目录后再启动" });
      return true;
    }
    const current = await context.workspace.read(workspaceId);
    if (!current) {
      context.respond(404, { error: "找不到当前 Project 的这条工作目录" });
      return true;
    }
    if (current.state !== "healthy" || !context.workspace.exists(current.path)) {
      context.respond(409, { error: "工作目录当前不可用，请先修复路径或冲突" });
      return true;
    }
    const runtimeId = typeof body.runtime_id === "string" ? body.runtime_id.trim() : "";
    const currentGoalId = typeof body.current_goal_id === "string" && body.current_goal_id.trim()
      ? body.current_goal_id.trim()
      : null;
    if (!runtimeId) {
      context.respond(400, { error: "请选择 Runtime" });
      return true;
    }
    if (currentGoalId && !await context.hasCurrentGoal(currentGoalId)) {
      context.respond(400, { error: "当前 Goal 不属于这个 Project，或已经不在当前 Goal Tree" });
      return true;
    }
    try {
      // Launching in a workspace is the same registered session creation, with the folder this page checked.
      if (!context.actions) throw new Error("Session 服务尚未接通动作调用");
      context.respond(201, await context.actions.invoke(workActions.create, { runtime_id: runtimeId, action: "create", current_goal_id: currentGoalId,
        workspace_id: current.id, workspace_path: current.path, title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : null }));
    } catch (error) {
      context.respond(error instanceof MolisWorkSessionError || error instanceof ActionError ? 400 : 503, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  return false;
}
