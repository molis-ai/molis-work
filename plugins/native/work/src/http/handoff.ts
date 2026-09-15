import type { WorkSessionHttpContext } from "./types.js";
import { MolisWorkSessionError } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { publicSessionRecord, publicSessionHandoff } from "./public-records.js";

export async function handleSessionHandoffHttp(context: WorkSessionHttpContext): Promise<boolean> {
  const { method, pathname, readBody, respond, resourcesPromise, projectOptions, readGoalContract } = context;
  const projectSessionHandoffPrepareMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/handoffs$/);
  if (method === "POST" && projectSessionHandoffPrepareMatch) {
    try {
      const sessionId = decodeURIComponent(projectSessionHandoffPrepareMatch[1]);
      const resources = await resourcesPromise;
      const source = resources.registry.get(sessionId);
      if (source.project_id !== projectOptions.project?.project_id) {
        respond( 404, { error: "找不到当前 Project 的这条来源 Session" });
        return true;
      }
      if (!source.current_goal_id) {
        respond( 409, { error: "请先为来源 Session 选择当前 Goal，再创建 Handoff" });
        return true;
      }
      const body = await readBody();
      const targetRuntimeId = typeof body.target_runtime_id === "string" ? body.target_runtime_id.trim() : "";
      if (!targetRuntimeId) {
        respond( 400, { error: "请选择目标 Runtime" });
        return true;
      }
      const contract = readGoalContract(source.current_goal_id);
      const result = await resources.handoff.prepare({
        source_session_id: source.session_id,
        project_id: projectOptions.project!.project_id,
        project_name: projectOptions.project!.display_name,
        target_runtime_id: targetRuntimeId,
        target_workspace_id: typeof body.target_workspace_id === "string" ? body.target_workspace_id : null,
        target_workspace_path: typeof body.target_workspace_path === "string"
          ? body.target_workspace_path.trim() || null
          : source.workspace_path,
        actor_id: "web-user",
        goal_contract: contract,
      });
      respond( 201, {
        handoff: publicSessionHandoff(result.handoff, true),
        reused: result.reused,
        source: publicSessionRecord(source),
        goal: {
          goal_id: contract.goal.goal_id,
          title: contract.goal.title,
          outcome: contract.goal.outcome,
          work_state: contract.event_facts?.work_status
            ?? (contract.goal.trashed_at ? "trashed" : contract.goal.archived_at ? "archived" : "open"),
        },
      });
    } catch (error) {
      respond( error instanceof MolisWorkSessionError ? 400 : 503, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  const sessionHandoffMutationMatch = pathname.match(
    /^\/api\/session-handoffs\/([^/]+)(?:\/(send|cancel))?$/,
  );
  if (sessionHandoffMutationMatch) {
    let packageId: string;
    try {
      packageId = decodeURIComponent(sessionHandoffMutationMatch[1]);
    } catch {
      respond( 400, { error: "Handoff package ID 无效" });
      return true;
    }
    const resources = await resourcesPromise;
    let current;
    try {
      current = resources.registry.getHandoff(packageId);
    } catch {
      respond( 404, { error: "找不到这条 Handoff package" });
      return true;
    }
    if (current.source_project_id !== projectOptions.project?.project_id) {
      respond( 404, { error: "找不到这条 Handoff package" });
      return true;
    }
    if (method === "PATCH" && !sessionHandoffMutationMatch[2]) {
      try {
        const body = await readBody();
        const handoff = resources.handoff.update({
          package_id: current.package_id,
          target_runtime_id: typeof body.target_runtime_id === "string" ? body.target_runtime_id : "",
          ...(typeof body.target_workspace_id === "string"
            ? { target_workspace_id: body.target_workspace_id }
            : {}),
          target_workspace_path: typeof body.target_workspace_path === "string"
            ? body.target_workspace_path.trim() || null
            : null,
          content: typeof body.content === "string" ? body.content : "",
          actor_id: "web-user",
          user_confirmed: false,
        });
        respond( 200, { handoff: publicSessionHandoff(handoff, true) });
      } catch (error) {
        respond( error instanceof MolisWorkSessionError ? 400 : 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    if (method === "POST" && sessionHandoffMutationMatch[2] === "send") {
      try {
        const body = await readBody();
        const result = await resources.handoff.send({
          package_id: current.package_id,
          target_runtime_id: typeof body.target_runtime_id === "string" ? body.target_runtime_id : "",
          ...(typeof body.target_workspace_id === "string"
            ? { target_workspace_id: body.target_workspace_id }
            : {}),
          target_workspace_path: typeof body.target_workspace_path === "string"
            ? body.target_workspace_path.trim() || null
            : null,
          content: typeof body.content === "string" ? body.content : "",
          actor_id: "web-user",
          user_confirmed: body.user_confirmed === true,
        });
        const status = result.handoff.state === "sent" ? 201 : 502;
        respond( status, {
          handoff: publicSessionHandoff(result.handoff, true),
          destination_session: result.destination_session
            ? publicSessionRecord(result.destination_session)
            : null,
          ...(status === 502 ? { error: result.handoff.error_message } : {}),
        });
      } catch (error) {
        respond( error instanceof MolisWorkSessionError ? 400 : 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    if (method === "POST" && sessionHandoffMutationMatch[2] === "cancel") {
      try {
        const handoff = resources.handoff.cancel(current.package_id);
        respond( 200, { handoff: publicSessionHandoff(handoff, false) });
      } catch (error) {
        respond( error instanceof MolisWorkSessionError ? 400 : 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    respond( 405, { error: "Handoff 操作不支持这个请求方法" });
    return true;
  }

  return false;
}
