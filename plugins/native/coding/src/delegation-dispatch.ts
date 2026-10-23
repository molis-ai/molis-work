import type { AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { materialArtifact, type CodingMaterial } from "./materials.js";
import type { CodingSessionRecord } from "./store.js";
import type { CodingExecution } from "./routes.js";
import { codingActions, type CodingBeforeWrite } from "./route-entry.js";
import { asAttachment, isDelegation } from "./delegation-view.js";

/** A known pre-dispatch failure may put the draft away; an uncertain dispatch keeps its original target and outbox. */
export async function dispatchCodingDelegation(context: PluginStartContext, execution: CodingExecution,
  record: CodingSessionRecord, input: { mine: string; task: string; title: string; materials: CodingMaterial[]; hops: number; ttlMs: number },
  beforeWrite: CodingBeforeWrite, runtimeSession: (target: CodingSessionRecord) => Promise<string>,
  view: (letter: AgentSessionMessage, observed: AgentSessionMessage[], execution: CodingExecution) => unknown) {
  const { mine, task, title, materials, hops } = input;
  const projectId = context.project_id!, actions = codingActions(context, beforeWrite);
  await beforeWrite(); beforeWrite.assert_current();
  const at = new Date().toISOString();
  // The work happens in the Runtime of the session that asks (PG-054): the letter goes between two sessions of that one Runtime.
  let target = await execution.sessions.create(beforeWrite, { project_id: projectId, session_id: crypto.randomUUID(), title: "委派：" + title, runtime_id: record.runtime_id, at });
  let sent: AgentSessionMessage | undefined, dispatchStarted = false;
  try {
    context.services!.storage!.set(`draft:${target.session_id}`, task);
    if (materials.length) context.services!.storage!.set(`materials:${target.session_id}`, JSON.stringify(materials));
    // The work happens where the asking session works, with its model, unless the receiving person changes them.
    const configuration = context.services!.storage!.get(`configuration:${record.session_id}`);
    if (typeof configuration === "string") context.services!.storage!.set(`configuration:${target.session_id}`, configuration);
    const theirs = await runtimeSession(target);
    target = execution.sessions.get(projectId, target.session_id);
    dispatchStarted = true;
    sent = await actions.invoke(agent.sendPeopleMessage, [record.runtime_id, { from_session: mine, to_session: theirs, kind: "request", body: JSON.stringify({ title, task }),
      // The letter carries the fixed versions among them; live pieces travel only as the new session's materials.
      attachments: materials.flatMap(material => { const fixed = materialArtifact(material); return fixed ? [asAttachment(fixed)] : []; }), ttl_ms: input.ttlMs, hops }]);
    // The session made for it holds it as its draft: it has arrived.
    const delivered = await actions.invoke(agent.actOnPeopleMessage, [record.runtime_id, sent.message_id, "deliver", {}]);
    await beforeWrite(); beforeWrite.assert_current();
    return { delegation: view(delivered, [], execution), session: execution.sessions.get(projectId, target.session_id) };
  } catch (error) {
    // A Runtime that carries no letters between sessions says so before it sends anything: no letter exists, so this is a plain refusal.
    const refused = !sent && (error as { code?: unknown }).code === "agent.capability_unavailable";
    if (!dispatchStarted || refused) { await beforeWrite(); beforeWrite.assert_current(); await execution.sessions.archive(beforeWrite, projectId, target.session_id, new Date().toISOString()); throw error; }
    // Dispatch may already have flushed. Observe that same target and letter; never make another to compensate.
    await beforeWrite(); beforeWrite.assert_current();
    const observed = await actions.invoke(agent.readMessages, [record.runtime_id, mine]).catch(() => [] as AgentSessionMessage[]);
    await beforeWrite(); beforeWrite.assert_current();
    sent = observed.find(letter => isDelegation(letter) && letter.from_session === mine && letter.to_session === target.runtime_session_id) ?? sent;
    return { session: target, delegation: sent ? view(sent, observed, execution) : null, delivery_unconfirmed: !sent || sent.state === "queued" };
  }
}
