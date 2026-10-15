import { type CodingActivation, selected } from "./route-activation.js";
import { bodyOf } from "./route-selections.js";
import { text } from "./run-inputs.js";
import { parseFilePath, writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Coding routes for parallel writers: their directories, integrating a child's result, and stopping or judging a child. */

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  (a) => {
    const { route } = a;
    return route("coding.writer-directories", async (request, api) => ({ directories: await api!.invoke(writerDirectoryCapabilities.list, { workspace_id: text(request.params.workspaceId, "主工作区") }) }));
  },
  (a) => {
    const { route } = a;
    return route("coding.prepare-writer-directory", async (request, api) => api!.invoke(writerDirectoryCapabilities.prepare, { workspace_id: text(request.params.workspaceId, "主工作区"), operation_id: text(bodyOf(request).operation_id, "操作标识", 80) }));
  },
  (a) => {
    const { route } = a;
    return [false, true].map(prepare => route(prepare ? "coding.prepare-integration" : "coding.read-integration", async (request, api, execution) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id || record.runtime_id !== "prologue") throw new Error("此会话没有可整合的原子任务");
      const source = { session_id: record.runtime_session_id, run_id: text(request.params.runId, "原执行"), subagent_id: text(request.params.childId, "原子任务") };
      if (!prepare) return api!.invoke(writerIntegrationCapabilities.read, source);
      const body = bodyOf(request);
      if (!Array.isArray(body.files)) throw new Error("请选择原成果文件");
      const files = body.files.map(file => ({ path: parseFilePath(file.path), revision: text(file.revision, "审查版本"),
        ...(typeof file.resolution === "string" ? { resolution: file.resolution.length <= 262_144 ? file.resolution : (() => { throw new Error("合并结果过长"); })() } : {}) }));
      return api!.invoke(writerIntegrationCapabilities.prepare, { ...source, operation_id: text(body.operation_id, "操作标识", 80), files });
    }));
  },
  (a) => {
    const { context, route } = a;
    return route("coding.control-subagent", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      if (!record.runtime_session_id) throw new Error("此会话没有执行记录");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const run = { session_id: record.runtime_session_id, run_id: text(request.params.runId, "原执行") };
      const children = await api!.invoke(agent.listSubagents, [session, run]);
      const child = children.find(child => child.subagent_id === request.params.childId);
      if (!child) throw new Error("子任务不属于这轮执行");
      if (body.action === "stop") await api!.invoke(agent.cancelSubagent, [session, run, child.subagent_id, request.actor_id]);
      else {
        if (!["accepted", "needs-work"].includes(String(body.action)) || child.state !== "completed") throw new Error("只有已结束的成功执行可以评价结果，失败或中断需先核对");
        const notes = typeof body.notes === "string" ? body.notes.trim() : "";
        if (notes.length > 4000 || body.action === "needs-work" && !notes) throw new Error("返工需写明原因，说明最多 4000 字符");
        await beforeWrite(); beforeWrite.assert_current();
        const key = `subagent-verdict:${record.session_id}:${run.run_id}:${child.subagent_id}`;
        const previous = context.services!.storage!.get(key);
        const revision = typeof previous === "string" ? JSON.parse(previous).revision : 0;
        if (body.expected_revision !== revision) throw new Error("评价已变化，请重新查看后提交");
        context.services!.storage!.set(key, JSON.stringify({ revision: revision + 1, status: body.action, notes, actor: request.actor_id, at: new Date().toISOString() }));
      }
      return { ok: true };
    });
  },
];

/** The writer routes of one activation. */
export const writersRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
