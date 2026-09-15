import type { WorkSessionHttpContext } from "./types.js";
import { MolisWorkSessionError } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { publicSessionRecord } from "./public-records.js";

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
      if (goalId && !hasCurrentGoal(goalId)) {
        respond( 400, { error: "当前 Goal 不属于这个 Project，或已经不在当前 Goal Tree" });
        return true;
      }
      const workspacePath = typeof body.workspace_path === "string" && body.workspace_path.trim()
        ? body.workspace_path.trim()
        : null;
      const session = resources.registry.updateAssociations({
        session_id: sessionId,
        actor_id: "web-user",
        user_confirmed: true,
        project_id: targetProjectId,
        current_goal_id: goalId,
        workspace_id: workspacePath === current.workspace_path ? current.workspace_id : null,
        workspace_path: workspacePath,
      });
      respond( 200, { session: publicSessionRecord(session) });
    } catch (error) {
      respond( error instanceof MolisWorkSessionError ? 400 : 503, {
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
      const session = resources.registry.setStatus({
        session_id: sessionId,
        actor_id: "web-user",
        user_confirmed: true,
        status: body.archived ? "closed" : "active",
      });
      respond( 200, { session: publicSessionRecord(session) });
    } catch (error) {
      respond( error instanceof MolisWorkSessionError ? 400 : 503, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  return false;
}
