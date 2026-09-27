import type { WorkSessionHttpContext } from "./types.js";
import { MolisWorkSessionError } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { workActions } from "../actions.js";

export async function handleSessionCreateHttp(context: WorkSessionHttpContext): Promise<boolean> {
  const { method, pathname, readBody, respond, hasCurrentGoal, workspace } = context;
  if (method === "POST" && pathname === "/api/sessions/discover") {
    const body = await readBody();
    const runtimeId = typeof body.runtime_id === "string" ? body.runtime_id.trim() : "";
    if (!runtimeId) {
      respond( 400, { error: "请选择要同步的 Runtime" });
      return true;
    }
    // Forwarded to the registered action; the status still follows the runtime's own answer.
    try {
      const result = await requireActions(context).invoke(workActions.discover, { runtime_id: runtimeId });
      respond(result.status === "ok" ? 200 : result.status === "unsupported" ? 409 : 503, result);
    } catch (error) {
      respond(error instanceof ActionError ? 400 : 503, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  if (method === "POST" && pathname === "/api/sessions") {
    try {
      const body = await readBody();
      if (body.user_confirmed !== true) {
        respond( 400, { error: "请先确认这次 Session 写入" });
        return true;
      }
      const runtimeId = typeof body.runtime_id === "string" ? body.runtime_id.trim() : "";
      const action = body.action === "create" ? "create" : body.action === "link" ? "link" : null;
      const currentGoalId = typeof body.current_goal_id === "string" && body.current_goal_id.trim()
        ? body.current_goal_id.trim()
        : null;
      
      if (currentGoalId && !await hasCurrentGoal(currentGoalId)) {
        respond( 400, { error: "当前 Goal 不属于这个 Project，或已经不在当前 Goal Tree" });
        return true;
      }
      if (!runtimeId || !action) {
        respond( 400, { error: "请选择 Runtime 和添加方式" });
        return true;
      }
      let workspaceId = typeof body.workspace_id === "string" && body.workspace_id.trim()
        ? body.workspace_id.trim()
        : null;
      let workspacePath = typeof body.workspace_path === "string" && body.workspace_path.trim()
        ? body.workspace_path.trim()
        : null;
      if (workspaceId) {
        const selectedWorkspace = await workspace.read(workspaceId);
        if (!selectedWorkspace) {
          respond( 404, { error: "找不到当前 Project 的这个工作目录" });
          return true;
        }
        if (workspacePath && workspacePath !== selectedWorkspace.path) {
          respond( 409, { error: "工作目录 ID 与路径不一致，请重新选择" });
          return true;
        }
        if (action === "create" && (selectedWorkspace.state !== "healthy" || !workspace.exists(selectedWorkspace.path))) {
          respond( 409, { error: "工作目录当前不可用，请选择其他运行位置" });
          return true;
        }
        workspaceId = selectedWorkspace.id;
        workspacePath = selectedWorkspace.path;
      } else if (workspacePath) {
        const normalized = workspace.normalize(workspacePath);
        if (!normalized) {
          respond( 400, { error: "工作目录必须是绝对路径" });
          return true;
        }
        workspaceId = normalized.workspace_id;
        workspacePath = normalized.canonical_path;
        if (action === "create") {
          let usableDirectory = false;
          try {
            usableDirectory = workspace.isDirectory(workspacePath);
          } catch {}
          if (!usableDirectory) {
            respond( 409, { error: "工作目录当前不可访问，请选择一个存在的文件夹" });
            return true;
          }
        }
      }
      const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
      // The page resolved and checked the working folder it shows; the registered action performs the change.
      const created = await requireActions(context).invoke(workActions.create, { runtime_id: runtimeId, action,
        ...(action === "link" ? { native_runtime_session_id: typeof body.native_runtime_session_id === "string" ? body.native_runtime_session_id : "" } : {}),
        current_goal_id: currentGoalId, workspace_id: workspaceId, workspace_path: workspacePath, title });
      respond(201, created);
    } catch (error) {
      respond(error instanceof MolisWorkSessionError || error instanceof ActionError ? 400 : 503, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  return false;
}

function requireActions(context: WorkSessionHttpContext) {
  if (!context.actions) throw new Error("Session 服务尚未接通动作调用");
  return context.actions;
}
