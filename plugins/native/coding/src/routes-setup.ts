import { codingArtifacts, CODING_PLAN_TYPE } from "./artifacts.js";
import { savedCharacter, savedCharacterSkills } from "./characters.js";
import { materialChoices, savedMaterials } from "./materials.js";
import { symbolsIn, workspaceFileIndex, workspaceFileReader } from "./mentions.js";
import { confirmedPlan, parseCodingPlan, planFromRun, planMaterial, planReference } from "./plans.js";
import { type CodingActivation, selected, sessionTitle, sessionOutputs } from "./route-activation.js";
import { bodyOf, savedActions, methodSelection } from "./route-selections.js";
import type { CodingExecutionPorts } from "./routes.js";
import { text } from "./run-inputs.js";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, type AgentRunView, type AgentMcpServerInput } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isDeepStrictEqual } from "node:util";

/** Coding routes for what the next round takes: materials, action tools, MCP, methods, plans, Characters, and the files named with @. */

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  (a) => {
    const { context, route } = a;
    return route("coding.materials", async (request, _api, execution) => {
      const record = selected(a, request, execution);
      return { materials: materialChoices(context, savedMaterials(context, record.session_id), execution.materialReferences?.(), sessionOutputs(execution), sessionTitle(a, execution), record.session_id) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.actions", async (request, api, execution) => {
      const record = selected(a, request, execution), runtimes = await api!.invoke(agent.listRuntimes, []);
      const tools = runtimes.some(runtime => runtime.runtime_id === record.runtime_id && runtime.supports_action_tools)
        ? await api!.invoke(agent.listActions, [record.runtime_id, context.plugin_id]) : [];
      const characterRef = savedCharacter(context, record.session_id);
      let character: ReturnType<NonNullable<CodingExecutionPorts["characters"]>["resolve"]> | undefined;
      let character_error: string | undefined;
      try { if (characterRef) character = execution.characters?.resolve(characterRef); }
      catch (error) { character_error = error instanceof Error ? error.message : "原角色不可用"; }
      if (characterRef && !character && !character_error) character_error = "原角色不可用";
      return { actions: tools.map(view => ({ ...view, availability: character_error
        ? { available: false, code: "agent.character_unavailable", reason: character_error }
        : character?.action_tools && !character.action_tools.some(ref => ref.capability_id === view.capability_id && ref.version === view.version && ref.provider_id === view.provider.provider_id)
          ? { available: false, code: "agent.character_scope", reason: "当前 Character 未开放此能力" } : view.availability })), selected: savedActions(context, record.session_id) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.save-mcp", async (request, api) => {
      const body = bodyOf(request);
      const input = { id: body.id, expected_version: body.expected_version, label: body.label, enabled: body.enabled, timeout_ms: body.timeout_ms,
        transport: body.transport, executable: body.executable, argv: body.argv, endpoint: body.endpoint, auth: body.auth } as AgentMcpServerInput;
      if (input.transport === "stdio") {
        const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
        const workspace = workspaces.find(item=>item.workspace_id === body.workspace_id);
        if (!workspace?.realpath_verified) throw new Error("请选择当前项目已授权的 MCP 工作区");
        input.directory = { canonical_path: workspace.canonical_path, realpath_verified: true };
      }
      return { server: await api!.invoke(agent.saveMcp, ["prologue", context.plugin_id, input]) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.control-mcp", async (request, api) => {
      const action = bodyOf(request).action;
      if (!["connect","disconnect","cancel","remove"].includes(String(action))) throw new Error("MCP 操作无效");
      await api!.invoke(agent.controlMcp, ["prologue", context.plugin_id, text(request.params.serverId,"MCP 服务"), action as "connect" | "disconnect" | "cancel" | "remove"]);
      return { accepted: true };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.discover-methods", async (request, api) => {
      const body = bodyOf(request);
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
      const workspace = workspaces.find(item => item.workspace_id === body.workspace_id);
      if (!workspace?.realpath_verified) throw new Error("请先选择这个项目已授权的工作区");
      return { candidates: await api!.invoke(agent.discoverSkills, ["prologue", context.plugin_id,
        { canonical_path: workspace.canonical_path, realpath_verified: true }, text(body.path, "方法目录", 1000)]) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.install-method", async (request, api) => ({ method: await api!.invoke(agent.installSkill,
      ["prologue", context.plugin_id, text(bodyOf(request).candidate_id, "候选方法")]) }));
  },
  (a) => {
    const { context, route } = a;
    return route("coding.read-method", async (request, api) => {
      const ref = methodSelection([{skill_id: request.params.skillId, version: Number(request.params.version)}])[0]!;
      return { method: await api!.invoke(agent.readSkill, ["prologue", context.plugin_id, ref]) };
    });
  },
  (a) => {
    const { context, projectId, route } = a;
    return route("coding.read-plan", async (request, _api, execution) => {
      const record = selected(a, request, execution);
      if (request.query?.revision !== undefined) {
        const revision = Number(request.query.revision);
        if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("固定计划修订无效");
        return { plan: confirmedPlan(context, record.session_id, revision), fixed: true };
      }
      return { plan: execution.sessions.plan(projectId, record.session_id) };
    });
  },
  (a) => {
    const { projectId, busy, route } = a;
    return route("coding.save-plan", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      if (busy.has(record.session_id)) throw new Error("正在开始执行，请稍后调整下一版计划");
      const expected = body.expected_revision;
      if (!Number.isSafeInteger(expected) || Number(expected) < 0) throw new Error("请先读取计划修订");
      const current = execution.sessions.plan(projectId, record.session_id);
      if ((current?.revision ?? 0) !== expected) throw new Error("计划已变化，请重新打开后合并修改");
      let proposal;
      if (body.run_id !== undefined) {
        if (!record.runtime_session_id) throw new Error("没有可读取的规划轮次");
        const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
        const snapshot = await api!.invoke(agent.readSession, [session]);
        const ref = snapshot.runs.find(run => run.run_id === body.run_id);
        if (!ref) throw new Error("规划轮次不属于当前会话");
        // The planning rounds just before this one, back to the round that started planning, give the plan its task.
        const earlier: AgentRunView[] = [];
        for (let at = snapshot.runs.indexOf(ref) - 1; at >= 0; at--) {
          const view = await api!.invoke(agent.readRun, [session, snapshot.runs[at]!]);
          if (view.frozen.role_id !== "planner") break;
          earlier.unshift(view);
        }
        proposal = planFromRun(record.session_id, await api!.invoke(agent.readRun, [session, ref]), earlier);
      } else {
        if (!current) throw new Error("请先从规划轮次形成计划");
        proposal = { source: current.source, content: parseCodingPlan(body.content) };
      }
      await beforeWrite(); beforeWrite.assert_current();
      if (current?.confirmed && !proposal.content.change_reason) throw new Error("调整已确认计划时，请说明变更理由");
      if (busy.has(record.session_id)) throw new Error("正在开始执行，请稍后调整下一版计划");
      const plan = execution.sessions.savePlan(projectId, record.session_id, Number(expected), {
        ...proposal, revision: Number(expected) + 1, confirmed: null,
      });
      return { plan };
    });
  },
  (a) => {
    const { context, projectId, busy, route } = a;
    return route("coding.confirm-plan", async (request, _api, execution) => {
      const record = selected(a, request, execution), draft = execution.sessions.plan(projectId, record.session_id);
      if (busy.has(record.session_id)) throw new Error("正在开始执行，请稍后确认下一版计划");
      if (!draft || draft.revision !== bodyOf(request).expected_revision) throw new Error("计划已变化，请重新查看当前修订");
      if (draft.content.blockers) throw new Error("计划仍有未解决阻塞，请先调整计划");
      if (draft.confirmed) return { plan: draft };
      const reference = planReference(record.session_id, draft.revision), fixed = { ...draft, confirmed: reference };
      planMaterial(fixed);
      const artifacts = codingArtifacts(context);
      if (!artifacts.read(reference)) context.services!.processItems!.record({ ...reference, artifact_type_id: CODING_PLAN_TYPE, schema_version: 1,
        content: { kind: "inline", payload: JSON.parse(JSON.stringify(fixed)) },
        metadata: { title: fixed.content.title, session_id: record.session_id, run_id: fixed.source.run_id } });
      const saved = confirmedPlan(context, record.session_id, draft.revision);
      if (!isDeepStrictEqual(saved, fixed)) throw new Error("固定计划与当前草稿不一致，不能确认");
      return { plan: execution.sessions.confirmPlan(projectId, record.session_id, fixed) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.characters", async (request, _api, execution) => {
      const record = selected(a, request, execution);
      return { characters: execution.characters?.list() ?? [], selected: savedCharacter(context, record.session_id), character_skill_ids: savedCharacterSkills(context, record.session_id), runtime_id: record.runtime_id };
    });
  },
  // The files a person can name with @: read through the Host's read-only workspace file action, briefly remembered.
  (a) => {
    const { context, fileIndexes, route } = a;
    return route("coding.files", async (request, api, execution) => {
      selected(a, request, execution);
      const workspaceId = text(request.query?.workspace_id, "工作区", 200);
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
      if (!workspaces.some(entry => entry.workspace_id === workspaceId && entry.realpath_verified)) throw new Error("请先为这个项目选择已授权的工作区目录");
      const held = fileIndexes.get(workspaceId);
      if (held && Date.now() - held.at < 30_000) return await held.value;
      const value = workspaceFileIndex(workspaceFileReader(context), workspaceId);
      fileIndexes.set(workspaceId, { at: Date.now(), value });
      try { return await value; } catch (error) { fileIndexes.delete(workspaceId); throw error; }
    });
  },
  // The definitions in one file a person can name as "@path#name", read through the same read-only action.
  (a) => {
    const { context, route } = a;
    return route("coding.symbols", async (request, api, execution) => {
      selected(a, request, execution);
      const workspaceId = text(request.query?.workspace_id, "工作区", 200), path = text(request.query?.path, "文件", 1000);
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
      if (!workspaces.some(entry => entry.workspace_id === workspaceId && entry.realpath_verified)) throw new Error("请先为这个项目选择已授权的工作区目录");
      if (path.split("/").includes("..")) throw new Error("文件路径无效");
      const file = await workspaceFileReader(context)({ workspace_id: workspaceId, path: path.split("/").filter(Boolean), kind: "text" });
      return { path, symbols: file.outcome === "text" ? symbolsIn(path, file.text) : [], ...(file.outcome === "text" ? {} : { unreadable: file.outcome }) };
    });
  },
];

/** The next-round setup routes of one activation. */
export const setupRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
