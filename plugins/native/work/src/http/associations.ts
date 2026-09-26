import type { WorkSessionHttpContext } from "./types.js";
import { MolisWorkSessionError } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { workActions } from "../actions.js";

export async function handleSessionAssociationHttp(context: WorkSessionHttpContext): Promise<boolean> {
  const { method, pathname, readBody, respond, resourcesPromise, projectOptions, hasCurrentGoal } = context;
  const projectSessionAssociationMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/associations$/);
  if (method === "PATCH" && projectSessionAssociationMatch) {
    try {
      const sessionId = decodeURIComponent(projectSessionAssociationMatch[1]);
      const resources = await resourcesPromise;
      const current = resources.registry.get(sessionId);
      if (current.project_id !== projectOptions.project?.project_id) {
        respond( 404, { error: "找不到这条 Session" });
        return true;
      }
      const body = await readBody();
      if (body.user_confirmed !== true) {
        respond( 400, { error: "请先确认这次关系变更" });
        return true;
      }
      const targetProjectId = body.project_id == null
        ? null
        : typeof body.project_id === "string" && body.project_id.trim()
          ? body.project_id.trim()
          : null;
      if (targetProjectId && !projectOptions.projects.some((project) => project.project_id === targetProjectId)) {
        respond( 400, { error: "目标 Project 不存在" });
        return true;
      }
      const requestedGoalId = typeof body.current_goal_id === "string" && body.current_goal_id.trim()
        ? body.current_goal_id.trim()
        : null;
      const goalId = targetProjectId === projectOptions.project?.project_id ? requestedGoalId : null;
      if (goalId && !await hasCurrentGoal(goalId)) {
        respond( 400, { error: "当前 Goal 不属于这个 Project，或已经不在当前 Goal Tree" });
        return true;
      }
      const workspacePath = typeof body.workspace_path === "string" && body.workspace_path.trim()
        ? body.workspace_path.trim()
        : null;
      // The page checks the project list and current Goal tree it shows; the registered action performs the change.
      respond(200, await requireActions(context).invoke(workActions.associations, { session_id: sessionId, project_id: targetProjectId, current_goal_id: goalId, workspace_path: workspacePath }));
    } catch (error) {
      respond(error instanceof MolisWorkSessionError || error instanceof ActionError ? 400 : 503, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  const projectSessionArchiveMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/archive$/);
  if (method === "POST" && projectSessionArchiveMatch) {
    try {
      const sessionId = decodeURIComponent(projectSessionArchiveMatch[1]);
      const resources = await resourcesPromise;
      const current = resources.registry.get(sessionId);
      if (current.project_id !== projectOptions.project?.project_id) {
        respond( 404, { error: "找不到这条 Session" });
        return true;
      }
      const body = await readBody();
      if (body.user_confirmed !== true || typeof body.archived !== "boolean") {
        respond( 400, { error: "请确认归档或恢复这条 Session 记录" });
        return true;
      }
      respond(200, await requireActions(context).invoke(workActions.archive, { session_id: sessionId, archived: body.archived }));
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
