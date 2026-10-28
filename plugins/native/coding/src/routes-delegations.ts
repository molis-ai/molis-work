import { codingSessionWrite } from "./session-lifecycle.js";
import { codingArtifacts } from "./artifacts.js";
import { readCodingChangeSet } from "./changeset.js";
import { DELEGATION_ENDED, DELEGATION_STATE_KEY, MAX_DELEGATION_HOPS, type DelegationState } from "./cooperation.js";
import { dispatchCodingDelegation } from "./delegation-dispatch.js";
import { asAttachment, isDelegation } from "./delegation-view.js";
import { CODING_MATERIALS_MAX, materialArtifact, materialSelection, resolveMaterials, savedMaterials, type CodingMaterial } from "./materials.js";
import { codingActions, codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import { artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { sessionOutputs } from "./outputs.js";
import { type Capabilities, type CodingActivation, selected, delegationView } from "./route-activation.js";
import { bodyOf } from "./route-selections.js";
import { roundReport } from "./routes-changesets.js";
import type { CodingExecution } from "./routes.js";
import { text } from "./run-inputs.js";
import { codingSessionTitleFrom } from "./session-title.js";
import type { CodingSessionRecord } from "./store.js";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginActionClient, PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, type AgentMessageAttachment, type AgentPeopleMessageAction, type AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingFailure, codingText } from "./words.js";

/** Coding routes for sessions working together: delegating, answering a delegation, delivering and deciding on what was delivered. */

/** A delegation's letters are the people's to answer, at their pace: they are kept a year before they lapse. */
const DELEGATION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
/** Letters for a delegation go between runtime sessions: a session that has not run yet gets its own now. */
export const runtimeSessionOf = async (a: CodingActivation, record: CodingSessionRecord, api: Capabilities, execution: CodingExecution, beforeWrite: CodingBeforeWrite) => {
  const { context, projectId } = a;
  beforeWrite = codingSessionWrite(beforeWrite, execution.sessions.lifecycle, projectId, record.session_id);
  beforeWrite.assert_current();
  if (record.runtime_session_id) return record.runtime_session_id;
  const saved = context.services?.storage?.get(`configuration:${record.session_id}`);
  const chosen = typeof saved === "string" ? (JSON.parse(saved) as { workspace_id?: string }).workspace_id : undefined;
  const workspaces = await api.invoke(projectSettingsCapabilities.workspaces, []);
  const workspace = workspaces.find(entry => entry.workspace_id === chosen && entry.realpath_verified) ?? workspaces.find(entry => entry.realpath_verified);
  if (!workspace) throw codingFailure("coding.server.authorize-workspace");
  const session = await codingActions(a.context, beforeWrite).invoke(agent.createSession, [record.runtime_id, { directory: { canonical_path: workspace.canonical_path, realpath_verified: true }, title: record.title }]);
  await execution.sessions.setRuntimeSession(beforeWrite, projectId, record.session_id, session.session_id, new Date().toISOString());
  return session.session_id;
};
/** Letters between sessions are the agent Host's actions (PG-035), called with the activation's own caller. */
/** The delegation named, as this session sees it; an action against an older revision is refused. */
const delegationOf = async (a: CodingActivation, record: CodingSessionRecord, execution: CodingExecution, id: string, expected: unknown, actions: PluginActionClient) => {
  const letters = record.runtime_session_id ? await actions.invoke(agent.readMessages, [record.runtime_id, record.runtime_session_id]) : [];
  const letter = letters.find(one => one.message_id === id && isDelegation(one));
  if (!letter) throw codingFailure("coding.server.delegation-missing");
  const view = delegationView(a, execution, letter, letters);
  if (typeof expected === "number" && expected !== view.revision) throw codingFailure("coding.server.delegation-changed");
  return { letter, letters, view, mine: record.runtime_session_id! };
};
/** After the delegation ended, an action is kept on its history as late, and changes nothing. */
const lateOnly = async (actions: PluginActionClient, runtimeId: string, letter: AgentSessionMessage, state: DelegationState, event: string, note?: string): Promise<never> => {
  await actions.invoke(agent.actOnPeopleMessage, [runtimeId, letter.message_id, "record", { event, ...(note ? { note } : {}) }]);
  throw Object.assign(codingFailure("coding.server.delegation-ended", { state: { key: DELEGATION_STATE_KEY[state] } }), { code: "coding.cooperation_ended" });
};
/** A session made for a delegation starts on it with its first round: that is its acceptance. */
export const startDelegation = async (record: CodingSessionRecord, actions: PluginActionClient, runtimeSession: string) => {
  const letters = await actions.invoke(agent.readMessages, [record.runtime_id, runtimeSession]);
  const incoming = letters.filter(letter => isDelegation(letter) && letter.to_session === runtimeSession).at(-1);
  if (!incoming || !["delivered", "accepted"].includes(incoming.state) || (incoming.history ?? []).some(entry => entry.event === "started")) return;
  if (incoming.state === "delivered") await actions.invoke(agent.actOnPeopleMessage, [record.runtime_id, incoming.message_id, "accept", { note: "发送第一轮即视为接受" }]);
  await actions.invoke(agent.actOnPeopleMessage, [record.runtime_id, incoming.message_id, "record", { event: "started" }]);
};

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  // Sessions working together: what this session delegated, what it was created for, and the sessions they touch.
  (a) => {
    const { context, projectId, route } = a;
    return route("coding.delegations", async (request, _api, execution, beforeWrite) => {
      const actions = codingActions(a.context, beforeWrite);
      const record = selected(a, request, execution);
      const mine = record.runtime_session_id;
      let letters = mine ? await actions.invoke(agent.readMessages, [record.runtime_id, mine]) : [];
      // A delegation whose receiving session is gone has failed; recorded once, then shown as such.
      const gone = execution.sessions.lifecycle.pending(projectId, record.session_id) ? [] : letters.filter(letter => isDelegation(letter) && letter.from_session === mine && ["queued", "delivered", "accepted"].includes(letter.state)
        && !execution.sessions.byRuntimeSession(projectId, letter.to_session));
      for (const letter of gone) await codingActions(a.context, codingSessionWrite(beforeWrite, execution.sessions.lifecycle, projectId, record.session_id)).invoke(agent.actOnPeopleMessage, [record.runtime_id, letter.message_id, "cancel", { event: "failed", note: "接收委派的会话已不存在" }]).catch(() => undefined);
      if (gone.length) letters = await actions.invoke(agent.readMessages, [record.runtime_id, mine!]);
      const outgoing = letters.filter(letter => isDelegation(letter) && letter.from_session === mine).reverse().map(letter => delegationView(a, execution, letter, letters));
      const received = letters.filter(letter => isDelegation(letter) && letter.to_session === mine).at(-1);
      const incoming = received ? delegationView(a, execution, received, letters) : null;
      const referenced = [...new Set(savedMaterials(context, record.session_id).map(materialArtifact).flatMap(ref => ref && /^coding-(report|changeset|plan):/.test(ref.artifact_id) ? [decodeURIComponent(ref.artifact_id.split(":")[1]!)] : []))]
        .filter(id => id !== record.session_id);
      const relatedIds = [...new Set([...outgoing.map(item => item.to_session), incoming?.from_session, ...referenced].filter((id): id is string => Boolean(id)))];
      // The page refreshes this while a session is open: the project's outputs are listed only when there is a related session to show them under.
      const outputsBySession = new Map<string, Array<{ reference: { artifact_id: string; version: number }; kind: string }>>();
      for (const output of relatedIds.length ? sessionOutputs(context) : []) (outputsBySession.get(output.session_id) ?? outputsBySession.set(output.session_id, []).get(output.session_id)!).push({ reference: output.reference, kind: output.reference.artifact_id.split(":")[0]!.replace("coding-", "") });
      const say = codingText(execution.locale);
      const related = relatedIds.map(id => {
        let session: { title: string; state: string; updated_at: string } | null = null;
        try { session = execution.sessions.get(projectId, id); } catch { session = null; }
        const relation = [outgoing.some(item => item.to_session === id) ? say("coding.server.relation-delegated-to") : "", incoming?.from_session === id ? say("coding.server.relation-delegated-from") : "",
          referenced.includes(id) ? say("coding.server.relation-referenced") : ""].filter(Boolean);
        return { session_id: id, title: session?.title ?? null, state: session?.state ?? null, updated_at: session?.updated_at ?? null, relation, outputs: (outputsBySession.get(id) ?? []).slice(-3).reverse() };
      });
      return { outgoing, incoming, related };
    });
  },
  // Delegating creates a session with the task as its draft and sends it the letter; nothing runs until that
  // session's person sends it.
  (a) => {
    const { context, route } = a;
    return route("coding.delegate", async (request, api, execution, beforeWrite) => {
      const actions = codingActions(a.context, beforeWrite);
      const record = selected(a, request, execution), body = bodyOf(request);
      const task = text(body.task, "coding.field.delegation-task", 20_000), title = text(body.title ?? codingSessionTitleFrom(task), "coding.field.delegation-title", 80);
      const materials = materialSelection(body.materials ?? []);
      await resolveMaterials(context, materials, codingActionControl(beforeWrite));
      const mine = await runtimeSessionOf(a, record, api!, execution, beforeWrite);
      // How far the work has been passed on: one more than the delegation this session was created for.
      const letters = await actions.invoke(agent.readMessages, [record.runtime_id, mine]);
      const hops = letters.filter(letter => isDelegation(letter) && letter.to_session === mine).at(-1)?.hops ?? 0;
      if (hops + 1 > MAX_DELEGATION_HOPS) throw codingFailure("coding.server.delegation-hops", { max: MAX_DELEGATION_HOPS, hops });
      return dispatchCodingDelegation(context, execution, record,
        { mine, task, title, materials, hops, ttlMs: DELEGATION_TTL_MS }, beforeWrite,
        target => runtimeSessionOf(a, target, api, execution, beforeWrite), (letter, observed, side) => delegationView(a, side, letter, observed));
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.delegation-action", async (request, _api, execution, beforeWrite) => {
      const actions = codingActions(a.context, beforeWrite);
      const record = selected(a, request, execution), body = bodyOf(request);
      const { letter, view, mine } = await delegationOf(a, record, execution, text(request.params.delegationId, "coding.field.delegation"), body.expected_revision, actions);
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length > 2000) throw codingFailure("coding.server.note-2000");
      const act = (action: AgentPeopleMessageAction, detail: { event?: string; note?: string } = {}) => actions.invoke(agent.actOnPeopleMessage, [record.runtime_id, letter.message_id, action, detail]);
      const ended = DELEGATION_ENDED.includes(view.state);
      let next: AgentSessionMessage;
      if (body.action === "accept" || body.action === "reject") {
        if (letter.to_session !== mine) throw codingFailure("coding.server.receiver-only-accept");
        if (body.action === "reject" && !reason) throw codingFailure("coding.server.decline-reason");
        if (ended) return lateOnly(actions, record.runtime_id, letter, view.state, body.action === "accept" ? "accepted" : "rejected", reason);
        if (body.action === "accept") {
          if (view.state !== "delivered") throw codingFailure("coding.server.delegation-not-waiting", { state: { key: DELEGATION_STATE_KEY[view.state] } });
          next = await act("accept");
        } else if (view.state === "delivered") next = await act("reject", { note: reason });
        // Accepted, not started yet: turning it down after all ends it the same way.
        else if (view.state === "accepted") next = await act("cancel", { event: "rejected", note: reason });
        else throw codingFailure("coding.server.started-no-decline");
      } else if (body.action === "deliver") {
        if (letter.from_session !== mine) throw codingFailure("coding.server.sender-only-resend");
        next = letter.state === "queued" ? await act("deliver") : letter;
      } else if (body.action === "cancel") {
        if (letter.from_session !== mine) throw codingFailure("coding.server.sender-only-cancel");
        if (ended) return lateOnly(actions, record.runtime_id, letter, view.state, "cancelled", reason);
        next = await act("cancel", reason ? { note: reason } : {});
      } else throw codingFailure("coding.server.coop-action");
      return { delegation: delegationView(a, execution, next, await actions.invoke(agent.readMessages, [record.runtime_id, mine])) };
    });
  },
  // Handing a finished round back: its report is fixed now if it was not yet; a fixed change must already be saved.
  // The delivery is a reply to the delegation's letter.
  (a) => {
    const { context, route } = a;
    return route("coding.delegation-deliver", async (request, _api, execution, beforeWrite) => {
      const actions = codingActions(a.context, beforeWrite);
      const record = selected(a, request, execution), body = bodyOf(request);
      const { letter, view, mine } = await delegationOf(a, record, execution, text(request.params.delegationId, "coding.field.delegation"), body.expected_revision, actions);
      if (letter.to_session !== mine) throw codingFailure("coding.server.receiver-only-deliver");
      const runId = text(body.run_id, "coding.field.delivery-run", 200), note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
      const kind: "report" | "changeset" = body.kind === "changeset" ? "changeset" : body.kind === "report" ? "report" : (() => { throw codingFailure("coding.server.deliver-kind"); })();
      if (["received", "delivered", "accepted"].includes(view.state)) throw codingFailure("coding.server.deliver-run-first");
      if (DELEGATION_ENDED.includes(view.state)) return lateOnly(actions, record.runtime_id, letter, view.state, "delivery-sent", note);
      if (view.deliveries.some(delivery => delivery.state === "sent")) throw codingFailure("coding.server.delivery-pending");
      let artifact, title;
      if (kind === "report") { const saved = await roundReport(a, record, runId, true, beforeWrite); if (!saved.reference) throw codingFailure("coding.server.report-not-fixed"); artifact = saved.reference; title = saved.report.title; }
      else { const saved = readCodingChangeSet(codingArtifacts(context), record.session_id, runId); if (!saved) throw codingFailure("coding.server.fix-change-first"); artifact = saved.reference; title = "固定变更"; }
      const reply = await actions.invoke(agent.sendPeopleMessage, [record.runtime_id, { from_session: mine, to_session: letter.from_session, kind: "reply", in_reply_to: letter.message_id,
        body: JSON.stringify({ kind, run_id: runId, title, note }), attachments: [asAttachment(artifact)], ttl_ms: DELEGATION_TTL_MS }]);
      await actions.invoke(agent.actOnPeopleMessage, [record.runtime_id, reply.message_id, "deliver", {}]);
      await actions.invoke(agent.actOnPeopleMessage, [record.runtime_id, letter.message_id, "record", { event: "delivery-sent", ...(note ? { note } : {}), attachments: [asAttachment(artifact)] }]);
      const letters = await actions.invoke(agent.readMessages, [record.runtime_id, mine]);
      return { delegation: delegationView(a, execution, letters.find(one => one.message_id === letter.message_id)!, letters) };
    });
  },
  // The asking session decides: taking a delivery completes the delegation and attaches it to the next round;
  // returning it says why, and the work stays with the other session.
  (a) => {
    const { context, busy, route } = a;
    return route("coding.delegation-decide", async (request, _api, execution, beforeWrite) => {
      const actions = codingActions(a.context, beforeWrite);
      const record = selected(a, request, execution), body = bodyOf(request);
      const { letter, letters, view, mine } = await delegationOf(a, record, execution, text(request.params.delegationId, "coding.field.delegation"), body.expected_revision, actions);
      if (letter.from_session !== mine) throw codingFailure("coding.server.sender-only-decide");
      const delivery = view.deliveries.find(item => item.delivery_id === request.params.deliveryId);
      const reply = letters.find(one => one.message_id === request.params.deliveryId);
      if (!delivery || !reply) throw codingFailure("coding.server.delivery-missing");
      if (delivery.state !== "sent") throw codingFailure("coding.server.delivery-handled");
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (body.decision !== "accept" && body.decision !== "reject") throw codingFailure("coding.server.delivery-decision");
      if (body.decision === "reject" && !reason) throw codingFailure("coding.server.delivery-reason");
      if (DELEGATION_ENDED.includes(view.state)) return lateOnly(actions, record.runtime_id, letter, view.state, body.decision === "accept" ? "delivery-accepted" : "delivery-rejected", reason);
      const on = (id: string, action: AgentPeopleMessageAction, detail: { event?: string; note?: string; attachments?: AgentMessageAttachment[] } = {}) =>
        actions.invoke(agent.actOnPeopleMessage, [record.runtime_id, id, action, detail]);
      const handed = delivery.artifact ? [asAttachment(delivery.artifact)] : [];
      if (body.decision === "reject") {
        await on(reply.message_id, "reject", { note: reason });
        await on(letter.message_id, "record", { event: "delivery-rejected", note: reason, attachments: handed });
      } else {
        if (!delivery.artifact) throw codingFailure("coding.server.delivery-empty");
        // The delivered fixed version, read the way every material is: through project knowledge.
        const delivered: CodingMaterial = { kind: "artifact", id: artifactSubjectId(delivery.artifact), title: delivery.title || "交付的成果" };
        await resolveMaterials(context, [delivered], codingActionControl(beforeWrite));
        await beforeWrite(); beforeWrite.assert_current();
        if (busy.has(record.session_id)) throw codingFailure("coding.server.busy-delivery");
        busy.add(record.session_id);
        try {
        const saved = savedMaterials(context, record.session_id);
        const included = saved.some(material => material.kind === delivered.kind && material.id === delivered.id);
        if (!included && saved.length >= CODING_MATERIALS_MAX) throw codingFailure("coding.server.materials-full", { max: CODING_MATERIALS_MAX });
        await on(reply.message_id, "accept"); await on(reply.message_id, "complete");
        await on(letter.message_id, "complete", { event: "delivery-accepted", attachments: handed });
        await beforeWrite(); beforeWrite.assert_current();
        if (!included)
          context.services!.storage!.set(`materials:${record.session_id}`, JSON.stringify([...saved, delivered]));
        } finally { busy.delete(record.session_id); }
      }
      const now = await actions.invoke(agent.readMessages, [record.runtime_id, mine]);
      return { delegation: delegationView(a, execution, now.find(one => one.message_id === letter.message_id)!, now), ...(body.decision === "accept" ? { attached: true } : {}) };
    });
  },
];

/** The delegation routes of one activation. */
export const delegationsRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
