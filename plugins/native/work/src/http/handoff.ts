import type { WorkSessionHttpContext } from "./types.js";
import { MolisWorkSessionError } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { workActions } from "../actions.js";

export async function handleSessionHandoffHttp(context: WorkSessionHttpContext): Promise<boolean> {
  const { method, pathname, readBody, respond, resourcesPromise, projectOptions } = context;
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
      // The registered action reads the Goal through its owner and prepares the package.
      respond(201, await requireActions(context).invoke(workActions.handoffPrepare, { session_id: source.session_id, target_runtime_id: targetRuntimeId,
        ...(typeof body.target_workspace_id === "string" ? { target_workspace_id: body.target_workspace_id } : {}),
        ...(typeof body.target_workspace_path === "string" ? { target_workspace_path: body.target_workspace_path.trim() || null } : {}),
        project_name: projectOptions.project!.display_name }));
    } catch (error) {
      respond( error instanceof MolisWorkSessionError || error instanceof ActionError ? 400 : 503, {
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
        respond(200, await requireActions(context).invoke(workActions.handoffUpdate, target(current.package_id, body)));
      } catch (error) {
        respond( error instanceof MolisWorkSessionError || error instanceof ActionError ? 400 : 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    if (method === "POST" && sessionHandoffMutationMatch[2] === "send") {
      try {
        const body = await readBody();
        if (body.user_confirmed !== true) { respond(400, { error: "请确认后再发送交接包" }); return true; }
        const result = await requireActions(context).invoke(workActions.handoffSend, target(current.package_id, body)) as { handoff: { state: string; error_message?: string | null } };
        const status = result.handoff.state === "sent" ? 201 : 502;
        respond(status, { ...result, ...(status === 502 ? { error: result.handoff.error_message } : {}) });
      } catch (error) {
        respond( error instanceof MolisWorkSessionError || error instanceof ActionError ? 400 : 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    if (method === "POST" && sessionHandoffMutationMatch[2] === "cancel") {
      try {
        respond(200, await requireActions(context).invoke(workActions.handoffCancel, { package_id: current.package_id }));
      } catch (error) {
        respond( error instanceof MolisWorkSessionError || error instanceof ActionError ? 400 : 503, {
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

const target = (packageId: string, body: Record<string, unknown>) => ({ package_id: packageId,
  target_runtime_id: typeof body.target_runtime_id === "string" ? body.target_runtime_id : "",
  ...(typeof body.target_workspace_id === "string" ? { target_workspace_id: body.target_workspace_id } : {}),
  target_workspace_path: typeof body.target_workspace_path === "string" ? body.target_workspace_path.trim() || null : null,
  content: typeof body.content === "string" ? body.content : "" });

function requireActions(context: WorkSessionHttpContext) {
  if (!context.actions) throw new Error("Session 服务尚未接通动作调用");
  return context.actions;
}
