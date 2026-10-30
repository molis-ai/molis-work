import { codingArtifacts, CODING_PLAN_TYPE } from "./artifacts.js";
import { savedCharacter, savedCharacterSkills } from "./characters.js";
import { symbolsIn, workspaceFileIndex, workspaceFileReader } from "./mentions.js";
import { parseCodingPlan } from "./plan-content.js";
import { confirmedPlan, planFromRun, planMaterial, planReference } from "./plans.js";
import { type CodingActivation, selected } from "./route-activation.js";
import { bodyOf, savedActions, methodSelection } from "./route-selections.js";
import { codingActions, codingActionControl } from "./route-entry.js";
import { text } from "./run-inputs.js";
import { libraryRuntime, limitsCharacters, runtimeDirectory } from "./runtime-choice.js";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, type AgentRunView, type AgentMcpServerInput } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isDeepStrictEqual } from "node:util";
import { codingFailure, codingText } from "./words.js";

/** Coding routes for what the next round takes: materials, action tools, MCP, methods, plans, Characters, and the files named with @. */

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  (a) => {
    const { context, route } = a;
    return route("coding.actions", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), runtimes = await codingActions(context, beforeWrite).invoke(agent.listRuntimes, []);
      const tools = runtimes.some(runtime => runtime.runtime_id === record.runtime_id && runtime.supports_action_tools)
        ? await codingActions(context, beforeWrite).invoke(agent.listActions, [record.runtime_id]) : [];
      const characterRef = savedCharacter(context, record.session_id);
      // The tools the session's Character allows: none when it sets no limit; Characters' own refusal (the version is off, gone) is shown beside each action.
      let characterTools: Awaited<ReturnType<typeof execution.characters.actionTools>>;
      let character_error: string | undefined;
      const say = codingText(execution.locale);
      try { if (characterRef) characterTools = await execution.characters.actionTools(characterRef, codingActionControl(beforeWrite)); }
      catch (error) { beforeWrite.assert_current(); character_error = error instanceof Error ? error.message : say("coding.server.character-gone"); }
      return { actions: tools.map(view => ({ ...view, availability: character_error
        ? { available: false, code: "agent.character_unavailable", reason: character_error }
        : characterTools && !characterTools.some(ref => ref.capability_id === view.capability_id && ref.version === view.version && ref.provider_id === view.provider.provider_id)
          ? { available: false, code: "agent.character_scope", reason: say("coding.server.character-scope") } : view.availability })), selected: savedActions(context, record.session_id) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.save-mcp", async (request, api, _execution, beforeWrite) => {
      const body = bodyOf(request);
      // The project's Runtime holds its MCP servers; one whose matrix offers none refuses before anything is read or kept (PG-054).
      const runtime = libraryRuntime(await runtimeDirectory(codingActions(context, beforeWrite), api!), "mcp");
      const input = { id: body.id, expected_version: body.expected_version, label: body.label, enabled: body.enabled, timeout_ms: body.timeout_ms,
        transport: body.transport, executable: body.executable, argv: body.argv, endpoint: body.endpoint, auth: body.auth } as AgentMcpServerInput;
      if (input.transport === "stdio") {
        const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
        const workspace = workspaces.find(item=>item.workspace_id === body.workspace_id);
        if (!workspace?.realpath_verified) throw codingFailure("coding.server.mcp-workspace");
        input.directory = { canonical_path: workspace.canonical_path, realpath_verified: true };
      }
      return { server: await codingActions(context, beforeWrite).invoke(agent.saveMcp, [runtime.runtime_id, input]) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.control-mcp", async (request, api, _execution, beforeWrite) => {
      const action = bodyOf(request).action;
      if (!["connect","disconnect","cancel","remove"].includes(String(action))) throw codingFailure("coding.server.mcp-action");
      const runtime = libraryRuntime(await runtimeDirectory(codingActions(context, beforeWrite), api!), "mcp");
      await codingActions(context, beforeWrite).invoke(agent.controlMcp, [runtime.runtime_id, text(request.params.serverId,"coding.field.mcp-server"), action as "connect" | "disconnect" | "cancel" | "remove"]);
      return { accepted: true };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.discover-methods", async (request, api, _execution, beforeWrite) => {
      const body = bodyOf(request);
      const runtime = libraryRuntime(await runtimeDirectory(codingActions(context, beforeWrite), api!), "skills");
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
      const workspace = workspaces.find(item => item.workspace_id === body.workspace_id);
      if (!workspace?.realpath_verified) throw codingFailure("coding.server.pick-workspace");
      return { candidates: await codingActions(context, beforeWrite).invoke(agent.discoverSkills, [runtime.runtime_id,
        { canonical_path: workspace.canonical_path, realpath_verified: true }, text(body.path, "coding.field.method-path", 1000)]) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.install-method", async (request, api, _execution, beforeWrite) => {
      const runtime = libraryRuntime(await runtimeDirectory(codingActions(context, beforeWrite), api!), "skills");
      return { method: await codingActions(context, beforeWrite).invoke(agent.installSkill, [runtime.runtime_id, text(bodyOf(request).candidate_id, "coding.field.candidate")]) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.read-method", async (request, api, _execution, beforeWrite) => {
      const runtime = libraryRuntime(await runtimeDirectory(codingActions(context, beforeWrite), api!), "skills");
      const ref = methodSelection([{skill_id: request.params.skillId, version: Number(request.params.version)}])[0]!;
      return { method: await codingActions(context, beforeWrite).invoke(agent.readSkill, [runtime.runtime_id, ref]) };
    });
  },
  (a) => {
    const { context, projectId, route } = a;
    return route("coding.read-plan", async (request, _api, execution) => {
      const record = selected(a, request, execution);
      if (request.query?.revision !== undefined) {
        const revision = Number(request.query.revision);
        if (!Number.isSafeInteger(revision) || revision < 1) throw codingFailure("coding.server.plan-revision");
        return { plan: confirmedPlan(context, record.session_id, revision), fixed: true };
      }
      return { plan: execution.sessions.plan(projectId, record.session_id) };
    });
  },
  (a) => {
    const { projectId, busy, route } = a;
    return route("coding.save-plan", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      const notStarting = () => { if (busy.has(record.session_id)) throw codingFailure("coding.server.busy-plan-adjust"); };
      notStarting();
      const expected = body.expected_revision;
      if (!Number.isSafeInteger(expected) || Number(expected) < 0) throw codingFailure("coding.server.plan-read-first");
      const current = execution.sessions.plan(projectId, record.session_id);
      if ((current?.revision ?? 0) !== expected) throw codingFailure("coding.server.plan-changed-merge");
      let proposal;
      if (body.run_id !== undefined) {
        if (!record.runtime_session_id) throw codingFailure("coding.server.no-planning-turn");
        const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
        const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
        const ref = snapshot.runs.find(run => run.run_id === body.run_id);
        if (!ref) throw codingFailure("coding.server.planning-turn-elsewhere");
        // The planning rounds just before this one, back to the round that started planning, give the plan its task.
        const earlier: AgentRunView[] = [];
        for (let at = snapshot.runs.indexOf(ref) - 1; at >= 0; at--) {
          const view = await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, snapshot.runs[at]!]);
          if (view.frozen.role_id !== "planner") break;
          earlier.unshift(view);
        }
        proposal = planFromRun(record.session_id, await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]), earlier);
      } else {
        if (!current) throw codingFailure("coding.server.plan-from-turn");
        proposal = { source: current.source, content: parseCodingPlan(body.content) };
      }
      await beforeWrite(); beforeWrite.assert_current();
      if (current?.confirmed && !proposal.content.change_reason) throw codingFailure("coding.server.plan-change-reason");
      notStarting();
      // Checked again inside the write: a round started while the write waited on `beforeWrite` is still refused.
      const plan = await execution.sessions.savePlan(beforeWrite, projectId, record.session_id, Number(expected), {
        ...proposal, revision: Number(expected) + 1, confirmed: null,
      }, notStarting);
      return { plan };
    });
  },
  (a) => {
    const { context, projectId, busy, route } = a;
    return route("coding.confirm-plan", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), draft = execution.sessions.plan(projectId, record.session_id);
      const notStarting = () => { if (busy.has(record.session_id)) throw codingFailure("coding.server.busy-plan-confirm"); };
      notStarting();
      if (!draft || draft.revision !== bodyOf(request).expected_revision) throw codingFailure("coding.server.plan-changed-view");
      if (draft.content.blockers) throw codingFailure("coding.server.plan-blocked");
      if (draft.confirmed) return { plan: draft };
      const reference = planReference(record.session_id, draft.revision), fixed = { ...draft, confirmed: reference };
      planMaterial(fixed);
      const artifacts = codingArtifacts(context);
      if (!artifacts.read(reference)) context.services!.processItems!.record({ ...reference, artifact_type_id: CODING_PLAN_TYPE, schema_version: 1,
        content: { kind: "inline", payload: JSON.parse(JSON.stringify(fixed)) },
        metadata: { title: fixed.content.title, session_id: record.session_id, run_id: fixed.source.run_id } });
      const saved = confirmedPlan(context, record.session_id, draft.revision);
      if (!isDeepStrictEqual(saved, fixed)) throw codingFailure("coding.server.plan-mismatch");
      // Checked inside the write: a round started while the write waited on `beforeWrite` is still refused.
      return { plan: await execution.sessions.confirmPlan(beforeWrite, projectId, record.session_id, fixed, notStarting) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.characters", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      // Whether the session's Runtime has verified a Character's tool limits is the Runtime's own declaration; the page offers Characters only then.
      const limited = limitsCharacters(await codingActions(context, beforeWrite).invoke(agent.listRuntimes, []), record.runtime_id);
      return { characters: await execution.characters.list(codingActionControl(beforeWrite)), selected: savedCharacter(context, record.session_id), character_skill_ids: savedCharacterSkills(context, record.session_id), limits_verified: limited };
    });
  },
  // The files a person can name with @: read through the Host's read-only workspace file action, briefly remembered.
  (a) => {
    const { context, fileIndexes, route } = a;
    return route("coding.files", async (request, api, execution) => {
      selected(a, request, execution);
      const workspaceId = text(request.query?.workspace_id, "coding.field.workspace", 200);
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
      if (!workspaces.some(entry => entry.workspace_id === workspaceId && entry.realpath_verified)) throw codingFailure("coding.server.authorize-workspace");
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
      const workspaceId = text(request.query?.workspace_id, "coding.field.workspace", 200), path = text(request.query?.path, "coding.field.file", 1000);
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
      if (!workspaces.some(entry => entry.workspace_id === workspaceId && entry.realpath_verified)) throw codingFailure("coding.server.authorize-workspace");
      if (path.split("/").includes("..")) throw codingFailure("coding.server.file-path");
      const file = await workspaceFileReader(context)({ workspace_id: workspaceId, path: path.split("/").filter(Boolean), kind: "text" });
      return { path, symbols: file.outcome === "text" ? symbolsIn(path, file.text) : [], ...(file.outcome === "text" ? {} : { unreadable: file.outcome }) };
    });
  },
];

/** The next-round setup routes of one activation. */
export const setupRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
