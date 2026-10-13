import type { AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PluginStartContext, PluginCapabilityClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { CodingSessionRecord } from "./store.js";
import type { CodingExecutionPorts } from "./routes.js";
import type { CodingBeforeWrite } from "./route-entry.js";
import { asAttachment, isDelegation } from "./delegation-view.js";

/** A known pre-dispatch failure may put the draft away; an uncertain dispatch keeps its original target and outbox. */
export async function dispatchCodingDelegation(context: PluginStartContext, api: PluginCapabilityClient, execution: CodingExecutionPorts, activation: CodingExecutionPorts,
  record: CodingSessionRecord, input: { mine: string; task: string; title: string; materials: ArtifactReference[]; hops: number; ttlMs: number },
  beforeWrite: CodingBeforeWrite, runtimeSession: (target: CodingSessionRecord) => Promise<string>,
  view: (letter: AgentSessionMessage, observed: AgentSessionMessage[], execution: CodingExecutionPorts) => unknown) {
  const { mine, task, title, materials, hops } = input;
  const projectId = context.project_id!;
  await beforeWrite(); beforeWrite.assert_current();
  const at = new Date().toISOString();
  let target = execution.sessions.create({ project_id: projectId, session_id: crypto.randomUUID(), title: "委派：" + title, runtime_id: "prologue", at });
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
    sent = await api!.invoke(agent.sendPeopleMessage, [record.runtime_id, { from_session: mine, to_session: theirs, kind: "request", body: JSON.stringify({ title, task }),
      attachments: materials.map(asAttachment), ttl_ms: input.ttlMs, hops }]);
    // The session made for it holds it as its draft: it has arrived.
    const delivered = await api!.invoke(agent.actOnPeopleMessage, [record.runtime_id, sent.message_id, "deliver", {}]);
    await beforeWrite(); beforeWrite.assert_current();
    return { delegation: view(delivered, [], execution), session: execution.sessions.get(projectId, target.session_id) };
  } catch (error) {
    if (!dispatchStarted) { await beforeWrite(); beforeWrite.assert_current(); execution.sessions.archive(projectId, target.session_id, new Date().toISOString()); throw error; }
    // Dispatch may already have flushed. Observe that same target and letter; never make another to compensate.
    await beforeWrite(); beforeWrite.assert_current();
    const observed = await api.invoke(agent.readMessages, [record.runtime_id, mine]).catch(() => [] as AgentSessionMessage[]);
    await beforeWrite(); beforeWrite.assert_current();
    sent = observed.find(letter => isDelegation(letter) && letter.from_session === mine && letter.to_session === target.runtime_session_id) ?? sent;
    const sides = activation;
    return { session: target, delegation: sent ? view(sent, observed, sides) : null, delivery_unconfirmed: !sent || sent.state === "queued" };
  }
}
