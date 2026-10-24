import { type CodingActivation, selected } from "./route-activation.js";
import { bodyOf } from "./route-selections.js";
import { text } from "./run-inputs.js";
import { supports } from "./runtime-choice.js";
import { parseFilePath, writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingFailure } from "./words.js";
import { codingActions, codingActionControl } from "./route-entry.js";

/** Coding routes for parallel writers: their directories, integrating a child's result, and stopping or judging a child. */

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  // The writers' directories and integrating a child's result are the Host's actions, offered to plugins only (PG-035).
  (a) => {
    const { context, route } = a;
    return route("coding.writer-directories", async (request, _api, _execution, beforeWrite) => ({ directories: await context.services!.actions!.invoke(writerDirectoryCapabilities.list,
      { workspace_id: text(request.params.workspaceId, "coding.field.main-workspace") }, codingActionControl(beforeWrite)) }));
  },
  (a) => {
    const { context, route } = a;
    return route("coding.prepare-writer-directory", async (request, _api, _execution, beforeWrite) => context.services!.actions!.invoke(writerDirectoryCapabilities.prepare,
      { workspace_id: text(request.params.workspaceId, "coding.field.main-workspace"), operation_id: text(bodyOf(request).operation_id, "coding.field.operation", 80) }, codingActionControl(beforeWrite)));
  },
  (a) => {
    const { context, route } = a;
    return [false, true].map(prepare => route(prepare ? "coding.prepare-integration" : "coding.read-integration", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      // The atomic tasks are a Runtime's sub-agents: its own matrix says whether it has any (PG-054).
      const runtime = (await codingActions(context, beforeWrite).invoke(agent.listRuntimes, [])).find(entry => entry.runtime_id === record.runtime_id);
      if (!record.runtime_session_id || !runtime || !supports(runtime, "subagents")) throw codingFailure("coding.server.no-subtasks");
      const source = { session_id: record.runtime_session_id, run_id: text(request.params.runId, "coding.field.original-run"), subagent_id: text(request.params.childId, "coding.field.subtask") };
      const actions = context.services!.actions!, control = codingActionControl(beforeWrite);
      if (!prepare) return actions.invoke(writerIntegrationCapabilities.read, source, control);
      const body = bodyOf(request);
      if (!Array.isArray(body.files)) throw codingFailure("coding.server.pick-original-file");
      const files = body.files.map(file => ({ path: parseFilePath(file.path), revision: text(file.revision, "coding.field.review-version"),
        ...(typeof file.resolution === "string" ? { resolution: file.resolution.length <= 262_144 ? file.resolution : (() => { throw codingFailure("coding.server.merge-too-long"); })() } : {}) }));
      return actions.invoke(writerIntegrationCapabilities.prepare, { ...source, operation_id: text(body.operation_id, "coding.field.operation", 80), files }, control);
    }));
  },
  (a) => {
    const { context, route } = a;
    return route("coding.control-subagent", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-record");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const run = { session_id: record.runtime_session_id, run_id: text(request.params.runId, "coding.field.original-run") };
      const children = await codingActions(context, beforeWrite).invoke(agent.listSubagents, [session, run]);
      const child = children.find(child => child.subagent_id === request.params.childId);
      if (!child) throw codingFailure("coding.server.subtask-elsewhere");
      if (body.action === "stop") await codingActions(context, beforeWrite).invoke(agent.cancelSubagent, [session, run, child.subagent_id]);
      else {
        if (!["accepted", "needs-work"].includes(String(body.action)) || child.state !== "completed") throw codingFailure("coding.server.rate-ended-only");
        const notes = typeof body.notes === "string" ? body.notes.trim() : "";
        if (notes.length > 4000 || body.action === "needs-work" && !notes) throw codingFailure("coding.server.rework-reason");
        await beforeWrite(); beforeWrite.assert_current();
        const key = `subagent-verdict:${record.session_id}:${run.run_id}:${child.subagent_id}`;
        const previous = context.services!.storage!.get(key);
        const revision = typeof previous === "string" ? JSON.parse(previous).revision : 0;
        if (body.expected_revision !== revision) throw codingFailure("coding.server.rating-changed");
        context.services!.storage!.set(key, JSON.stringify({ revision: revision + 1, status: body.action, notes, actor: request.actor_id, at: new Date().toISOString() }));
      }
      return { ok: true };
    });
  },
];

/** The writer routes of one activation. */
export const writersRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
