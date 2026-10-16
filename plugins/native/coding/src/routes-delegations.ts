import { codingArtifacts } from "./artifacts.js";
import { readCodingChangeSet } from "./changeset.js";
import { DELEGATION_ENDED, MAX_DELEGATION_HOPS } from "./cooperation.js";
import { dispatchCodingDelegation } from "./delegation-dispatch.js";
import { asAttachment, isDelegation } from "./delegation-view.js";
import { materialSelection, resolveMaterials, savedMaterials } from "./materials.js";
import { type Capabilities, type CodingActivation, selected, sessionTitle, sessionOutputs, delegationView } from "./route-activation.js";
import { bodyOf } from "./route-selections.js";
import { roundReport } from "./routes-changesets.js";
import type { CodingExecutionPorts } from "./routes.js";
import { text } from "./run-inputs.js";
import { codingSessionTitleFrom } from "./session-title.js";
import type { CodingSessionRecord } from "./store.js";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, type AgentMessageAttachment, type AgentPeopleMessageAction, type AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Coding routes for sessions working together: delegating, answering a delegation, delivering and deciding on what was delivered. */

/** A delegation's letters are the people's to answer, at their pace: they are kept a year before they lapse. */
const DELEGATION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
/** Letters for a delegation go between runtime sessions: a session that has not run yet gets its own now. */
export const runtimeSessionOf = async (a: CodingActivation, record: CodingSessionRecord, api: Capabilities, execution: CodingExecutionPorts, actorId: string) => {
  const { context, projectId } = a;
  if (record.runtime_session_id) return record.runtime_session_id;
  const saved = context.services?.storage?.get(`configuration:${record.session_id}`);
  const chosen = typeof saved === "string" ? (JSON.parse(saved) as { workspace_id?: string }).workspace_id : undefined;
  const workspaces = await api.invoke(projectSettingsCapabilities.workspaces, []);
  const workspace = workspaces.find(entry => entry.workspace_id === chosen && entry.realpath_verified) ?? workspaces.find(entry => entry.realpath_verified);
  if (!workspace) throw new Error("请先为这个项目选择已授权的工作区目录");
  const identity = { project_id: projectId, plugin_id: context.plugin_id, install_id: context.install_id, actor_id: actorId };
  const session = await api.invoke(agent.createSession, [record.runtime_id, { ...identity, directory: { canonical_path: workspace.canonical_path, realpath_verified: true }, title: record.title }]);
  execution.sessions.setRuntimeSession(projectId, record.session_id, session.session_id, new Date().toISOString());
  return session.session_id;
};
/** The delegation named, as this session sees it; an action against an older revision is refused. */
const delegationOf = async (a: CodingActivation, record: CodingSessionRecord, api: Capabilities, execution: CodingExecutionPorts, id: string, expected: unknown) => {
  const letters = record.runtime_session_id ? await api.invoke(agent.readMessages, [record.runtime_id, record.runtime_session_id]) : [];
  const letter = letters.find(one => one.message_id === id && isDelegation(one));
  if (!letter) throw new Error("找不到这个委派");
  const view = delegationView(a, execution, letter, letters);
  if (typeof expected === "number" && expected !== view.revision) throw new Error("协作状态刚刚变化，请刷新后再操作");
  return { letter, letters, view, mine: record.runtime_session_id! };
};
/** After the delegation ended, an action is kept on its history as late, and changes nothing. */
const lateOnly = async (api: Capabilities, runtimeId: string, letter: AgentSessionMessage, label: string, event: string, note?: string): Promise<never> => {
  await api.invoke(agent.actOnPeopleMessage, [runtimeId, letter.message_id, "record", { event, ...(note ? { note } : {}) }]);
  throw Object.assign(new Error(`这个委派已结束（${label}）；这次操作只记录，不改变结果`), { code: "coding.cooperation_ended" });
};
/** A session made for a delegation starts on it with its first round: that is its acceptance. */
export const startDelegation = async (record: CodingSessionRecord, api: Capabilities, runtimeSession: string) => {
  const letters = await api.invoke(agent.readMessages, [record.runtime_id, runtimeSession]);
  const incoming = letters.filter(letter => isDelegation(letter) && letter.to_session === runtimeSession).at(-1);
  if (!incoming || !["delivered", "accepted"].includes(incoming.state) || (incoming.history ?? []).some(entry => entry.event === "started")) return;
  if (incoming.state === "delivered") await api.invoke(agent.actOnPeopleMessage, [record.runtime_id, incoming.message_id, "accept", { note: "发送第一轮即视为接受" }]);
  await api.invoke(agent.actOnPeopleMessage, [record.runtime_id, incoming.message_id, "record", { event: "started" }]);
};

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  // Sessions working together: what this session delegated, what it was created for, and the sessions they touch.
  (a) => {
    const { context, projectId, route } = a;
    return route("coding.delegations", async (request, api, execution) => {
      const record = selected(a, request, execution);
      const mine = record.runtime_session_id;
      let letters = mine ? await api!.invoke(agent.readMessages, [record.runtime_id, mine]) : [];
      // A delegation whose receiving session is gone has failed; recorded once, then shown as such.
      const gone = letters.filter(letter => isDelegation(letter) && letter.from_session === mine && ["queued", "delivered", "accepted"].includes(letter.state)
        && !execution.sessions.byRuntimeSession(projectId, letter.to_session));
      for (const letter of gone) await api!.invoke(agent.actOnPeopleMessage, [record.runtime_id, letter.message_id, "cancel", { event: "failed", note: "接收委派的会话已不存在" }]).catch(() => undefined);
      if (gone.length) letters = await api!.invoke(agent.readMessages, [record.runtime_id, mine!]);
      const outgoing = letters.filter(letter => isDelegation(letter) && letter.from_session === mine).reverse().map(letter => delegationView(a, execution, letter, letters));
      const received = letters.filter(letter => isDelegation(letter) && letter.to_session === mine).at(-1);
      const incoming = received ? delegationView(a, execution, received, letters) : null;
      const referenced = [...new Set(savedMaterials(context, record.session_id).flatMap(ref => /^coding-(report|changeset|plan):/.test(ref.artifact_id) ? [decodeURIComponent(ref.artifact_id.split(":")[1]!)] : []))]
        .filter(id => id !== record.session_id);
      const outputsBySession = new Map<string, Array<{ reference: { artifact_id: string; version: number }; kind: string }>>();
      for (const output of sessionOutputs(execution)) (outputsBySession.get(output.session_id) ?? outputsBySession.set(output.session_id, []).get(output.session_id)!).push({ reference: output.reference, kind: output.reference.artifact_id.split(":")[0]!.replace("coding-", "") });
      const related = [...new Set([...outgoing.map(item => item.to_session), incoming?.from_session, ...referenced].filter((id): id is string => Boolean(id)))].map(id => {
        let session: { title: string; state: string; updated_at: string } | null = null;
        try { session = execution.sessions.get(projectId, id); } catch { session = null; }
        const relation = [outgoing.some(item => item.to_session === id) ? "你委派给它" : "", incoming?.from_session === id ? "它委派给你" : "", referenced.includes(id) ? "你引用了它的成果" : ""].filter(Boolean);
        return { session_id: id, title: session?.title ?? null, state: session?.state ?? null, updated_at: session?.updated_at ?? null, relation, outputs: (outputsBySession.get(id) ?? []).slice(-3).reverse() };
      });
      return { outgoing, incoming, related };
    });
  },
  // Delegating creates a session with the task as its draft and sends it the letter; nothing runs until that
  // session's person sends it.
  (a) => {
    const { context, ports, route } = a;
    return route("coding.delegate", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      if (record.runtime_id !== "prologue") throw new Error("委派经 Prologue 的会话间通信送达，这个会话用的是别的运行时");
      const task = text(body.task, "委派的任务", 20_000), title = text(body.title ?? codingSessionTitleFrom(task), "委派标题", 80);
      const materials = materialSelection(body.materials ?? []);
      resolveMaterials(context, materials, sessionTitle(a, execution));
      const mine = await runtimeSessionOf(a, record, api!, execution, request.actor_id);
      // How far the work has been passed on: one more than the delegation this session was created for.
      const letters = await api!.invoke(agent.readMessages, [record.runtime_id, mine]);
      const hops = letters.filter(letter => isDelegation(letter) && letter.to_session === mine).at(-1)?.hops ?? 0;
      if (hops + 1 > MAX_DELEGATION_HOPS) throw new Error(`委派最多转交 ${MAX_DELEGATION_HOPS} 层；这个会话本身已是第 ${hops} 层委派`);
      return dispatchCodingDelegation(context, api, execution, ports ?? execution, record,
        { mine, task, title, materials, hops, ttlMs: DELEGATION_TTL_MS }, beforeWrite,
        target => runtimeSessionOf(a, target, api, execution, request.actor_id), (letter, observed, side) => delegationView(a, side, letter, observed));
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.delegation-action", async (request, api, execution) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      const { letter, view, mine } = await delegationOf(a, record, api!, execution, text(request.params.delegationId, "委派"), body.expected_revision);
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length > 2000) throw new Error("说明最多 2000 字");
      const act = (action: AgentPeopleMessageAction, detail: { event?: string; note?: string } = {}) => api!.invoke(agent.actOnPeopleMessage, [record.runtime_id, letter.message_id, action, detail]);
      const ended = DELEGATION_ENDED.includes(view.state);
      let next: AgentSessionMessage;
      if (body.action === "accept" || body.action === "reject") {
        if (letter.to_session !== mine) throw new Error("只有接收委派的会话可以接受或拒绝");
        if (body.action === "reject" && !reason) throw new Error("拒绝委派时请写明原因");
        if (ended) return lateOnly(api!, record.runtime_id, letter, view.state_label, body.action === "accept" ? "accepted" : "rejected", reason);
        if (body.action === "accept") {
          if (view.state !== "delivered") throw new Error(`这个委派现在是「${view.state_label}」，不需要再接受`);
          next = await act("accept");
        } else if (view.state === "delivered") next = await act("reject", { note: reason });
        // Accepted, not started yet: turning it down after all ends it the same way.
        else if (view.state === "accepted") next = await act("cancel", { event: "rejected", note: reason });
        else throw new Error("已经开始执行的委派不能再拒绝；可以交付成果，或请发起的会话取消");
      } else if (body.action === "deliver") {
        if (letter.from_session !== mine) throw new Error("只有发起委派的会话可以核对并继续送达");
        next = letter.state === "queued" ? await act("deliver") : letter;
      } else if (body.action === "cancel") {
        if (letter.from_session !== mine) throw new Error("只有发起委派的会话可以取消");
        if (ended) return lateOnly(api!, record.runtime_id, letter, view.state_label, "cancelled", reason);
        next = await act("cancel", reason ? { note: reason } : {});
      } else throw new Error("不支持的协作操作");
      return { delegation: delegationView(a, execution, next, await api!.invoke(agent.readMessages, [record.runtime_id, mine])) };
    });
  },
  // Handing a finished round back: its report is fixed now if it was not yet; a fixed change must already be saved.
  // The delivery is a reply to the delegation's letter.
  (a) => {
    const { context, route } = a;
    return route("coding.delegation-deliver", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      const { letter, view, mine } = await delegationOf(a, record, api!, execution, text(request.params.delegationId, "委派"), body.expected_revision);
      if (letter.to_session !== mine) throw new Error("只有接收委派的会话可以交付成果");
      const runId = text(body.run_id, "交付的轮次", 200), note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
      const kind: "report" | "changeset" = body.kind === "changeset" ? "changeset" : body.kind === "report" ? "report" : (() => { throw new Error("请选择交付报告或固定变更"); })();
      if (["received", "delivered", "accepted"].includes(view.state)) throw new Error("请先在这个会话里执行一轮，再交付成果");
      if (DELEGATION_ENDED.includes(view.state)) return lateOnly(api!, record.runtime_id, letter, view.state_label, "delivery-sent", note);
      if (view.deliveries.some(delivery => delivery.state === "sent")) throw new Error("上一次交付还在等发起的会话决定");
      let artifact, title;
      if (kind === "report") { const saved = await roundReport(a, record, runId, api, true, beforeWrite); if (!saved.reference) throw new Error("这一轮的报告没有固定下来"); artifact = saved.reference; title = saved.report.title; }
      else { const saved = readCodingChangeSet(codingArtifacts(context), record.session_id, runId); if (!saved) throw new Error("请先固定这一轮的变更，再交付"); artifact = saved.reference; title = "固定变更"; }
      const reply = await api!.invoke(agent.sendPeopleMessage, [record.runtime_id, { from_session: mine, to_session: letter.from_session, kind: "reply", in_reply_to: letter.message_id,
        body: JSON.stringify({ kind, run_id: runId, title, note }), attachments: [asAttachment(artifact)], ttl_ms: DELEGATION_TTL_MS }]);
      await api!.invoke(agent.actOnPeopleMessage, [record.runtime_id, reply.message_id, "deliver", {}]);
      await api!.invoke(agent.actOnPeopleMessage, [record.runtime_id, letter.message_id, "record", { event: "delivery-sent", ...(note ? { note } : {}), attachments: [asAttachment(artifact)] }]);
      const letters = await api!.invoke(agent.readMessages, [record.runtime_id, mine]);
      return { delegation: delegationView(a, execution, letters.find(one => one.message_id === letter.message_id)!, letters) };
    });
  },
  // The asking session decides: taking a delivery completes the delegation and attaches it to the next round;
  // returning it says why, and the work stays with the other session.
  (a) => {
    const { context, busy, route } = a;
    return route("coding.delegation-decide", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      const { letter, letters, view, mine } = await delegationOf(a, record, api!, execution, text(request.params.delegationId, "委派"), body.expected_revision);
      if (letter.from_session !== mine) throw new Error("只有发起委派的会话可以决定是否收下交付");
      const delivery = view.deliveries.find(item => item.delivery_id === request.params.deliveryId);
      const reply = letters.find(one => one.message_id === request.params.deliveryId);
      if (!delivery || !reply) throw new Error("找不到这次交付");
      if (delivery.state !== "sent") throw new Error("这次交付已经处理过");
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (body.decision !== "accept" && body.decision !== "reject") throw new Error("请选择收下或不收下");
      if (body.decision === "reject" && !reason) throw new Error("不收下交付时请写明原因，对方会看到");
      if (DELEGATION_ENDED.includes(view.state)) return lateOnly(api!, record.runtime_id, letter, view.state_label, body.decision === "accept" ? "delivery-accepted" : "delivery-rejected", reason);
      const on = (id: string, action: AgentPeopleMessageAction, detail: { event?: string; note?: string; attachments?: AgentMessageAttachment[] } = {}) =>
        api!.invoke(agent.actOnPeopleMessage, [record.runtime_id, id, action, detail]);
      const handed = delivery.artifact ? [asAttachment(delivery.artifact)] : [];
      if (body.decision === "reject") {
        await on(reply.message_id, "reject", { note: reason });
        await on(letter.message_id, "record", { event: "delivery-rejected", note: reason, attachments: handed });
      } else {
        if (!delivery.artifact) throw new Error("这次交付没有带上固定成果");
        resolveMaterials(context, [delivery.artifact], sessionTitle(a, execution));
        await beforeWrite(); beforeWrite.assert_current();
        if (busy.has(record.session_id)) throw new Error("这个会话正在提交任务或收下交付");
        busy.add(record.session_id);
        try {
        const saved = savedMaterials(context, record.session_id);
        const included = saved.some(ref => ref.artifact_id === delivery.artifact!.artifact_id && ref.version === delivery.artifact!.version);
        if (!included && saved.length >= 30) throw new Error("下一轮材料已达到 30 项；请先移除一项，再收下这次交付");
        await on(reply.message_id, "accept"); await on(reply.message_id, "complete");
        await on(letter.message_id, "complete", { event: "delivery-accepted", attachments: handed });
        await beforeWrite(); beforeWrite.assert_current();
        if (!included)
          context.services!.storage!.set(`materials:${record.session_id}`, JSON.stringify([...saved, delivery.artifact]));
        } finally { busy.delete(record.session_id); }
      }
      const now = await api!.invoke(agent.readMessages, [record.runtime_id, mine]);
      return { delegation: delegationView(a, execution, now.find(one => one.message_id === letter.message_id)!, now), ...(body.decision === "accept" ? { attached: true } : {}) };
    });
  },
];

/** The delegation routes of one activation. */
export const delegationsRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
