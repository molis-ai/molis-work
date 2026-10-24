
import type { WorkSessionHttpContext } from "./types.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { workActions } from "../actions.js";

/** Starting a Session in one of the project's folders; the folders themselves (link, repair, unlink, pick) are the Host's project setting. */
export async function handleWorkspaceHttp(context: WorkSessionHttpContext): Promise<boolean> {
  const options = context.projectOptions;
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
      context.respond(error instanceof ActionError ? 400 : 503, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  return false;
}
