import { codingBackgroundState } from "./background-state.js";
import { characterSelection, characterSkillSelection } from "./characters.js";
import { materialSelection } from "./materials.js";
import { confirmedPlan } from "./plans.js";
import { type Capabilities, type CodingActivation, selected, sessionState, priorityOf } from "./route-activation.js";
import { codingActionControl } from "./route-entry.js";
import { bodyOf, methodSelection, mcpSelection, mcpSources, unlessMissing } from "./route-selections.js";
import type { CodingExecutionPorts } from "./routes.js";
import { nextConfiguration, runControl, text } from "./run-inputs.js";
import { DEFAULT_SESSION_TITLE, codingSessionTitleFrom } from "./session-title.js";
import { startRound } from "./start-round.js";
import type { CodingSessionRecord } from "./store.js";
import type { CodingWaitView } from "./waits.js";
import { projectsCapabilities, projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { parseExactActionReferences, searchEntriesPage, subjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, isTerminalAgentPhase, type AgentSessionStatus } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentInputActions } from "@molis-ai/molis-work-contracts/services/agent-inputs";

/** Coding routes for sessions and their rounds: the directory, creating and changing a session, starting, queueing and steering a round. */

  // The directory a page shows: every session's current state, with what a new round needs. Read by coding.state.
const readState = async (a: CodingActivation, api: Capabilities, execution: CodingExecutionPorts) => {
  const { context, projectId } = a;
  const runtimes = await api.invoke(agent.listRuntimes, []);
  // Every session's standing in one Host call per runtime, rather than one queued read per session.
  const records = execution.sessions.list(projectId);
  const statuses = new Map<string, AgentSessionStatus | { session_id: string; error: string }>();
  for (const runtimeId of new Set(records.filter(record => record.runtime_session_id).map(record => record.runtime_id))) {
    const ids = records.filter(record => record.runtime_id === runtimeId && record.runtime_session_id).map(record => record.runtime_session_id!);
    try { for (const status of await api.invoke(agent.readSessionStatuses, [runtimeId, ids])) statuses.set(`${runtimeId}:${status.session_id}`, status); }
    catch (error) { for (const id of ids) statuses.set(`${runtimeId}:${id}`, { session_id: id, error: error instanceof Error ? error.message : "会话暂不可读" }); }
  }
  // Parked sessions, from the SDK; the loop that takes fired waits up is (re)started here, after a restart too.
  const parked = new Map<string, CodingWaitView>(), backgroundUnreadable = await codingBackgroundState(api, records, execution.sessions, projectId);
  for (const runtimeId of new Set(records.filter(record => record.runtime_session_id).map(record => record.runtime_id))) {
    try { for (const [session, wait] of await a.waits.openWaits(runtimeId)) parked.set(`${runtimeId}:${session}`, wait); } catch { /* shown as not waiting */ }
    a.waits.wakeLoop(api, execution, runtimeId);
  }
  const sessions = records.map(record => {
    const background_unreadable = backgroundUnreadable.has(record.runtime_id);
    let checkpointBusy = false, steps = execution.sessions.stepsOf(projectId, record.session_id);
    // A parked session waits whatever its last round did — unless a round is under way right now.
    const wait = record.runtime_session_id ? parked.get(`${record.runtime_id}:${record.runtime_session_id}`) : undefined;
    const status = record.runtime_session_id ? statuses.get(`${record.runtime_id}:${record.runtime_session_id}`) : undefined;
    const active = status && !("error" in status) && status.latest_phase && !isTerminalAgentPhase(status.latest_phase);
    if (wait && !active) {
      if (record.state !== "queued") record = execution.sessions.setState(projectId, record.session_id, "queued", record.updated_at);
      return { ...record, background_unreadable, checkpoint_busy: false, ...(steps ? { steps } : {}), queued: a.waits.waitView(wait),
        goal_title: record.goal_id ? execution.goalTitle(record.goal_id) ?? null : null };
    }
    if (record.runtime_session_id) {
      const status = statuses.get(`${record.runtime_id}:${record.runtime_session_id}`);
      if (status && !("error" in status)) {
        checkpointBusy = status.checkpoint_busy;
        const read = status.steps ?? null;
        if (JSON.stringify(read) !== JSON.stringify(steps)) { execution.sessions.setSteps(projectId, record.session_id, read); steps = read; }
        const next = status.recovery ? "reconcile-required" : status.latest_phase ? sessionState({ phase: status.latest_phase }) : "idle";
        if (next !== record.state) record = execution.sessions.setState(projectId, record.session_id, next, record.updated_at);
      } else if (record.state !== "reconcile-required") {
        // One unreadable ledger must not hide other sessions or make the
        // directory call completed work safe to continue.
        record = execution.sessions.setState(projectId, record.session_id, "reconcile-required", record.updated_at);
      }
    }
    return { ...record, background_unreadable, checkpoint_busy: checkpointBusy, ...(steps ? { steps } : {}), ...(priorityOf(a, record.session_id) ? { priority: true } : {}), goal_title: record.goal_id ? execution.goalTitle(record.goal_id) ?? null : null };
  });
  const methods = runtimes.some(runtime=>runtime.runtime_id === "prologue") ? await api.invoke(agent.listSkills, ["prologue", context.plugin_id]) : [];
  const mcp = runtimes.some(runtime=>runtime.runtime_id === "prologue" && runtime.capabilities.mcp !== "unsupported") ? await api.invoke(agent.listMcp, ["prologue", context.plugin_id]) : [];
  return { sessions, methods, mcp, models: await execution.models(),
    // One current directory per project: the one chosen in project settings (and by Coding's own workspace choice)
    // is where new rounds run and what Files and Git show. Only when none was chosen does the catalog's pick stand.
    // A host without workspace settings offers none of these: sessions still list and open, and a round asks for a directory.
    workspace: await unlessMissing(api.invoke(projectSettingsCapabilities.browsingWorkspace, []), null) ?? await unlessMissing(api.invoke(projectsCapabilities.readWorkspace, []), null),
    workspaces: await unlessMissing(api.invoke(projectSettingsCapabilities.workspaces, []), []),
    runtimes: await Promise.all(runtimes.map(async (runtime) => ({ ...runtime,
      roles: await api.invoke(agent.availableRoles, [runtime.runtime_id, context.plugin_id]),
    }))),
  };
};
/** The workspace a send names, as the directory it will run in. */
const directoryOf = async (api: Capabilities, workspaceId: unknown) => {
  const workspace = (await api.invoke(projectSettingsCapabilities.workspaces, [])).find(entry => entry.workspace_id === workspaceId);
  if (!workspace?.realpath_verified) throw new Error("请先为这个项目选择已授权的工作区目录");
  return workspace.canonical_path;
};
/** Other sessions' work that overlaps what a send names: its text, and its plan's steps when it runs one. */
const overlapsFor = async (a: CodingActivation, api: Capabilities, execution: CodingExecutionPorts, record: CodingSessionRecord, body: Record<string, unknown>) => {
  const { context, projectId } = a;
  const directory = await directoryOf(api, body.workspace_id);
  const draft = body.plan_revision !== undefined ? execution.sessions.plan(projectId, record.session_id) : null;
  const plan = draft?.confirmed ? confirmedPlan(context, record.session_id, draft.revision) : null;
  const text = [typeof body.task === "string" ? body.task : "", plan ? plan.source.task : "", ...(plan?.content.steps ?? []).map(step => `${step.title}\n${step.acceptance}`)].join("\n");
  const found = await api.invoke(agent.readProjectWork, [record.runtime_id, { ...(record.runtime_session_id ? { session_id: record.runtime_session_id } : {}), directory, text }]);
  const sessions = execution.sessions.list(projectId);
  return { directory, text, overlaps: found.overlaps.map(overlap => {
    const other = sessions.find(entry => entry.runtime_session_id === overlap.work.session_id);
    return { work_id: overlap.work.work_id, state: overlap.work.state, title: other?.title ?? overlap.work.title, task: overlap.work.task, paths: overlap.paths,
      session_id: other?.session_id ?? null, ...(overlap.work.run_id ? { run_id: overlap.work.run_id } : {}), runtime_session_id: overlap.work.session_id };
  }) };
};

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  (a) => {
    const { route } = a;
    return route("coding.state", async (_request, api, execution) => {
      // Every open page polls this, and each read asks the Host about every session, one call at a time in the
      // project's queue. However many pages ask, one read runs and at most one waits behind it; a request that arrives
      // mid-read gets the next one, so it still sees what was just changed. Each caller gets its own copy.
      const run = () => { a.state.read = readState(a, api!, execution).finally(() => { a.state.read = null; }); return a.state.read; };
      if (!a.state.read) return structuredClone(await run());
      a.state.next ??= a.state.read.catch(() => undefined).then(() => { a.state.next = null; return a.state.read ?? run(); });
      return structuredClone(await a.state.next);
    });
  },
  (a) => {
    const { projectId, route } = a;
    return route("coding.create-session", async (request, _api, execution) => {
      const body = bodyOf(request);
      const record = execution.sessions.create({ project_id: projectId, session_id: crypto.randomUUID(),
        title: text(body.title ?? DEFAULT_SESSION_TITLE, "会话名称"), runtime_id: "prologue", at: new Date().toISOString() });
      return { session: record };
    });
  },
  // What the session is and where it stands, for whoever holds a reference to it (the Assistant's work, a reference
  // in another plugin). Its revision moves with every round, so a holder can tell the session went on since.
  (a) => {
    const { projectId, route } = a;
    return route("coding.search-entries", async (request, _api, execution) => searchEntriesPage(execution.sessions.list(projectId).filter(record => !record.archived).map(record => ({
      subject: { kind: "coding_session", id: record.session_id }, revision: `${record.updated_at}:${record.state}`, title: record.title || "编码会话",
      summary: record.goal_id ? `关联目标：${execution.goalTitle(record.goal_id) ?? record.goal_id}` : "", updated_at: record.updated_at, content: "context" as const,
      open: { surface: "coding", id: record.session_id } })), { cursor: typeof request.query.cursor === "string" && request.query.cursor ? request.query.cursor : null,
      limit: Math.min(500, Math.max(1, Number(request.query.limit ?? 500) || 500)) }));
  },
  (a) => {
    const { context, route } = a;
    return route("coding.subject", async (request, api, execution) => {
      const record = selected(a, request, execution);
      const saved = context.services?.storage?.get(`configuration:${record.session_id}`);
      const intent = typeof saved === "string" ? (JSON.parse(saved) as { intent?: string }).intent : undefined;
      const lines = [`状态：${record.state}${intent ? `；下一轮方式：${intent}` : ""}`, record.goal_id ? `关联目标：${execution.goalTitle(record.goal_id) ?? record.goal_id}` : ""];
      let revision = "0";
      if (record.runtime_session_id) {
        const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
        const snapshot = await api!.invoke(agent.readSession, [session]);
        const runs = await Promise.all(snapshot.runs.slice(-3).map(ref => api!.invoke(agent.readRun, [session, ref])));
        revision = String(snapshot.runs.length);
        for (const run of runs) {
          const task = run.turns.find(turn => turn.kind === "user")?.text ?? "";
          const reply = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text ?? "";
          const changed = [...new Set(run.activity.filter(item => ["write", "edit", "edit-file"].includes(item.name) && item.state === "completed").map(item => item.target))];
          lines.push("", `一轮（${run.phase}）：${task.slice(0, 600)}`, ...(changed.length ? [`改动的文件：${changed.join("、")}`] : []), ...(reply ? [`结果：${reply.slice(0, 1200)}`] : []));
        }
      }
      return subjectContext({ subject: { kind: "coding_session", id: record.session_id }, revision, title: record.title || "编码会话",
        content: lines.filter((line, index) => line || index > 1).join("\n"), goal_ids: record.goal_id ? [record.goal_id] : [], session_id: record.session_id,
        open: { surface: "coding", id: record.session_id } });
    });
  },
  // Like /compact: the next round starts from the digest of earlier rounds instead of replaying them verbatim.
  (a) => {
    const { context, route } = a;
    return route("coding.compact-next", async (request, _api, execution) => {
      const record = selected(a, request, execution);
      const on = bodyOf(request).on;
      if (typeof on !== "boolean") throw new Error("请说明是否在下一轮整理上下文");
      if (on && !record.runtime_session_id) throw new Error("这个会话还没有执行过，没有可整理的上下文");
      if (on) context.services!.storage!.set(`compact-next:${record.session_id}`, "1");
      else context.services!.storage!.delete(`compact-next:${record.session_id}`);
      return { compact_requested: on };
    });
  },
  (a) => {
    const { context, projectId, busy, route } = a;
    return route("coding.update-session", async (request, api, execution) => {
      const record = selected(a, request, execution);
      const body = bodyOf(request);
      if (body.archive === true) {
        if (busy.has(record.session_id)) throw Object.assign(new Error("会话正在提交任务，请稍后归档"), { code: "agent.session_busy" });
        if (record.runtime_session_id) {
          const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
          const snapshot = await api!.invoke(agent.readSession, [session]);
          if (snapshot.checkpoint_busy || snapshot.recovery || snapshot.latest_run && !isTerminalAgentPhase(snapshot.latest_run.phase)) {
            throw Object.assign(new Error("请先完成或停止当前执行，再归档会话"), { code: "agent.session_busy" });
          }
        }
        if (busy.has(record.session_id)) throw Object.assign(new Error("会话正在提交任务，请稍后归档"), { code: "agent.session_busy" });
        return { session: execution.sessions.archive(projectId, record.session_id, new Date().toISOString()) };
      }
      if (record.archived) throw new Error("会话已归档，不能再修改");
      const materials = body.materials === undefined ? undefined : materialSelection(body.materials);
      if (materials && busy.has(record.session_id)) throw new Error("正在提交任务或收下交付，请稍后修改材料");
      const configuration = body.configuration === undefined ? undefined : nextConfiguration(body.configuration);
      const character = body.character === undefined ? undefined : characterSelection(body.character);
      const characterSkills = body.character_skill_ids === undefined ? undefined : characterSkillSelection(body.character_skill_ids);
      const actionTools = body.action_tools === undefined ? undefined : parseExactActionReferences(body.action_tools);
      if (actionTools !== undefined) context.services!.storage!.set(`actions:${record.session_id}`, JSON.stringify(actionTools));
      if (configuration) context.services!.storage!.set(`configuration:${record.session_id}`, JSON.stringify(configuration));
      if (body.mcp_sources !== undefined) context.services!.storage!.set(`mcp-sources:${record.session_id}`,JSON.stringify(mcpSources(body.mcp_sources)));
      if (body.mcp_tools !== undefined) context.services!.storage!.set(`mcp:${record.session_id}`, JSON.stringify(mcpSelection(body.mcp_tools)));
      if (body.methods !== undefined) context.services!.storage!.set(`methods:${record.session_id}`, JSON.stringify(methodSelection(body.methods)));
      if (character !== undefined) context.services!.storage!.set(`character:${record.session_id}`, JSON.stringify(character));
      if (characterSkills !== undefined) context.services!.storage!.set(`character-skills:${record.session_id}`, JSON.stringify(characterSkills));
      if (body.question_drafts !== undefined) {
        if (!body.question_drafts || typeof body.question_drafts !== "object" || Array.isArray(body.question_drafts)
          || Object.keys(body.question_drafts).length > 20) throw new Error("待答草稿格式无效");
        const encoded = JSON.stringify(body.question_drafts);
        if (encoded.length > 100_000) throw new Error("待答草稿超过长度限制");
        context.services!.storage!.set(`question-drafts:${record.session_id}`, encoded);
      }
      if (body.draft !== undefined) {
        if (typeof body.draft !== "string" || body.draft.length > 100_000) throw new Error("草稿格式无效或超过长度限制");
        context.services!.storage!.set(`draft:${record.session_id}`, body.draft);
      }
      // The person's budget for this session: reaching it is reported, never enforced (the person's choice).
      if (body.budget !== undefined) {
        const tokens = (body.budget as { tokens?: unknown } | null)?.tokens;
        if (body.budget === null || tokens === null) context.services!.storage!.delete(`budget:${record.session_id}`);
        else if (typeof tokens !== "number" || !Number.isSafeInteger(tokens) || tokens < 1_000 || tokens > 10_000_000_000) throw new Error("预算须为 1000 到 100 亿之间的 token 数");
        else context.services!.storage!.set(`budget:${record.session_id}`, JSON.stringify({ tokens }));
      }
      const title = body.title === undefined ? undefined : text(body.title, "会话名称");
      if (materials) context.services!.storage!.set(`materials:${record.session_id}`, JSON.stringify(materials));
      return { session: title === undefined ? record : execution.sessions.rename(projectId, record.session_id, title, new Date().toISOString()) };
    });
  },
  (a) => {
    const { context, projectId, busy, route } = a;
    return route("coding.start-run", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (record.archived) throw new Error("会话已归档，不能再运行");
      if (busy.has(record.session_id)) throw Object.assign(new Error("这个会话正在提交任务"), { code: "agent.session_busy" });
      busy.add(record.session_id);
      try {
        const body = bodyOf(request);
        if (await a.waits.openWaitOf(record)) throw new Error("这个会话挂起在等待中；先取消等待，或选择现在开始");
        // "等它完成后再开始": the round is held as an item waiting on the other work, and starts on its own when it is done.
        if (typeof body.wait_for === "string") {
          if (["running", "paused", "waiting-answer", "waiting-approval"].includes(record.state)) throw new Error("这个会话还有一轮没结束，结束后再安排等待");
          const { directory, overlaps } = await overlapsFor(a, api!, execution, record, body);
          const target = overlaps.find(overlap => overlap.work_id === body.wait_for);
          if (!target) throw new Error("要等待的那项工作已经结束或不再重叠，可以直接开始");
          const identity = { project_id: projectId, plugin_id: context.plugin_id, install_id: context.install_id, actor_id: request.actor_id };
          const session = record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id }
            : await api!.invoke(agent.createSession, [record.runtime_id, { ...identity, directory: { canonical_path: directory, realpath_verified: true }, title: record.title }]);
          if (!record.runtime_session_id) execution.sessions.setRuntimeSession(projectId, record.session_id, session.session_id, new Date().toISOString());
          const task = typeof body.task === "string" && body.task.trim() ? body.task : "（按计划执行）";
          const title = record.title === DEFAULT_SESSION_TITLE ? codingSessionTitleFrom(task) : record.title;
          if (title !== record.title) execution.sessions.rename(projectId, record.session_id, title, new Date().toISOString());
          const { wait_for: _dropped, ...rest } = body;
          // The session's step waits on that work; the send is kept here, by the wait, to start when the work is done.
          const item = await api!.invoke(agent.queueProjectRound, [record.runtime_id, { session, directory, task, after: target.work_id, title }]);
          if (item.wait_id) a.waits.keepQueued(item.wait_id, rest, request.actor_id, item.work_id);
          execution.sessions.setState(projectId, record.session_id, "queued", new Date().toISOString());
          a.waits.wakeLoop(api!, execution, record.runtime_id);
          return { queued: { work_id: item.work_id, ...(item.wait_id ? { wait_id: item.wait_id } : {}), after: target } };
        }
        return await startRound(a, record, body, request.actor_id, api!, execution, beforeWrite);
      }
      finally { busy.delete(record.session_id); }
    });
  },
  // Before a send: other sessions' work under way in the same directory that names the same files.
  (a) => {
    const { route } = a;
    return route("coding.scope-check", async (request, api, execution) => {
      const record = selected(a, request, execution);
      const { overlaps } = await overlapsFor(a, api!, execution, record, bodyOf(request));
      return { overlaps };
    });
  },
  // A parked session: start it now (the wait is taken up by the person), or give the wait up.
  (a) => {
    const { projectId, busy, route } = a;
    return route("coding.queued-round", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), wait = await a.waits.openWaitOf(record), action = bodyOf(request).action;
      if (!wait) throw new Error("这个会话没有在等待");
      if (action === "cancel") {
        // Giving up a wait for an answer withdraws the request; for the person's own wait, its project work item goes.
        await a.waits.cancel(api, record, wait, beforeWrite);
        execution.sessions.setState(projectId, record.session_id, record.runtime_session_id ? "done" : "idle", new Date().toISOString());
        return { cancelled: true };
      }
      if (action !== "start") throw new Error("请选择现在开始或取消等待");
      if (busy.has(record.session_id)) throw Object.assign(new Error("这个会话正在提交任务"), { code: "agent.session_busy" });
      busy.add(record.session_id);
      try {
        return await a.waits.goOn(api, execution, record, wait, request.actor_id, beforeWrite);
      } finally { busy.delete(record.session_id); }
    });
  },
  // The person marks a session the priority: sessions whose work overlaps its own are asked to make way (only told).
  (a) => {
    const { context, projectId, route } = a;
    return route("coding.priority", async (request, api, execution) => {
      const record = selected(a, request, execution), on = bodyOf(request).on === true;
      const key = `priority:${record.session_id}`;
      if (!on) { context.services!.storage!.delete(key); return { priority: false, notified: [] }; }
      context.services!.storage!.set(key, new Date().toISOString());
      if (!record.runtime_session_id) return { priority: true, notified: [], paths: [] };
      const told = await api!.invoke(agent.prioritizeSession, [record.runtime_id, record.runtime_session_id]);
      const sessions = execution.sessions.list(projectId);
      return { priority: true, paths: told.paths, notified: told.notified.map(runtime => sessions.find(entry => entry.runtime_session_id === runtime)?.title ?? runtime) };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.control-run", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      const body = bodyOf(request);
      const run = snapshot.runs.find((entry) => entry.run_id === body.run_id);
      if (!run) throw new Error("找不到属于这个会话的执行");
      const control = await runControl(body, () => execution.models());
      if (control.kind === "steer") return { accepted: true, receipt: await context.services!.actions!.invoke(agentInputActions.send, { ...session, run_id: run.run_id, ...control.send }, codingActionControl(beforeWrite)) };
      if (isTerminalAgentPhase((await api!.invoke(agent.readRun, [session, run])).phase)) throw new Error("这一轮已经结束，请开始新一轮");
      await api!.invoke(agent.controlRun, [session, run, control]);
      return { accepted: true };
    });
  },
];

/** The session and round routes of one activation. */
export const sessionsRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
