import { actionDigest } from "./action-digest.js";
import { agentErrors } from "./errors.js";
import { checkOrigin } from "./input-origin.js";
import { ActionError, type ActionDefinition, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { agentCollaborationActions } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentOfferActions, type AgentActionClient, type AgentRunRef, type AgentRuntimeAdapter, type AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentInputActions } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { trustedSupplementInput } from "./original-inputs.js";

type Call = { invocation: HostCapabilityInvocation };
/** The registration helper, for actions only: each of these is in the action directory, never a typed-only capability. */
type Register<C extends Call> = <Input, Output>(definition: ActionDefinition<Input, Output>, handler: (call: C, input: Input) => Output | Promise<Output>) => () => void;

/** What the Agent Host's registration already resolves for every call: who calls, in which project, through which runtime. */
interface SessionActionPorts<C extends Call> {
  pluginFor(call: C): HostPluginCaller | undefined;
  adapter(call: C, runtimeId: string): AgentRuntimeAdapter;
  projectId(call: C): string;
  /** The session is in the caller's project and is the caller's own (its plugin, installation and person). */
  ownsSession(call: C, session: AgentSessionRef): Promise<boolean>;
  /** The round belongs to this session, and the session to the caller's project and plugin; gives the session's owner. */
  requireRun(call: C, session: AgentSessionRef, run: AgentRunRef): Promise<{ owner: { actor_id: string; install_id: string } }>;
  originalInput(call: C): HostOfferedOriginalInput | undefined;
  /** The actions the plugin's rounds are granted through this runtime, as that grant reads now, carrying the session the Host checked; absent when it grants none. */
  actions(call: C, runtimeId: string, session: AgentSessionRef): Promise<AgentActionClient | undefined>;
}

const sameReference = (a: ExactActionReference, b: ExactActionReference) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;

/**
 * The Agent Host's unified actions about a session's rounds: what its sessions wait for and how they go on, and what a
 * plugin tells a round or takes back. Every write checks the call is still current right before it, and once more right before
 * the runtime keeps a supplement whose round ended, or gives one back: a cancelled or revoked call writes nothing.
 */
export function registerSessionActions<C extends Call>(register: Register<C>, ports: SessionActionPorts<C>): Array<() => void> {
  const fresh = async (call: C) => { await call.invocation.beforeEffect(); call.invocation.assertAuthorityCurrent(); };
  return [
    // The task graph keeps the waits and continuations; these only read and ask it, for the caller's own sessions alone (R8 rules 3, 4).
    register(agentCollaborationActions.read, async (call, input) => {
      const adapter = ports.adapter(call, input.runtime_id);
      if (input.session_id && !await ports.ownsSession(call, { runtime_id: input.runtime_id, session_id: input.session_id })) throw agentErrors.session_unknown("当前项目找不到这条会话");
      if (!adapter.collaboration) return { sessions: [] };
      const sessions = [];
      for (const view of await adapter.collaboration.read(ports.projectId(call), input.session_id))
        if (await ports.ownsSession(call, { runtime_id: input.runtime_id, session_id: view.session_id })) sessions.push(view);
      await fresh(call);
      return { sessions };
    }),
    register(agentCollaborationActions.control, async (call, input) => {
      const caller = ports.pluginFor(call);
      const adapter = ports.adapter(call, input.runtime_id);
      if (!adapter.collaboration) throw agentErrors.capability_unavailable("当前运行时没有等待与接续");
      // Only a wait in one of the caller's own sessions; another's is refused as a wait this project does not have.
      const waiting = (await adapter.collaboration.read(ports.projectId(call))).find(view => view.wait?.wait_id === input.wait_id);
      if (!waiting || !await ports.ownsSession(call, { runtime_id: input.runtime_id, session_id: waiting.session_id })) throw agentErrors.collaboration_unknown("这个等待不属于这个项目");
      await fresh(call);
      const { runtime_id: _runtime, ...control } = input;
      return { session: await adapter.collaboration.control(ports.projectId(call), control, caller?.actor_id ?? "user") };
    }),
    // A person's change to a round's plan: the round must be this session's, and the session the caller's.
    register(agentCollaborationActions.revise, async (call, input) => {
      const { runtime_id, session_id, run_id, amendment, expected_version } = input;
      const run = { session_id, run_id };
      const view = await ports.requireRun(call, { runtime_id, session_id }, run);
      const adapter = ports.adapter(call, runtime_id);
      if (!adapter.collaboration) throw agentErrors.capability_unavailable("当前运行时不能调整计划图");
      // Checked once the call is current, so a supplement taken back while it waited is not a step's source (3d-5).
      await fresh(call);
      if (amendment.kind === "insert" && amendment.origin !== undefined) checkOrigin(amendment.origin, (await adapter.read(run)).turns);
      // The person deciding: the calling plugin's actor, else the session's owner.
      return { board: await adapter.collaboration.revise(run, amendment, expected_version, ports.pluginFor(call)?.actor_id ?? view.owner.actor_id) };
    }),
    register(agentInputActions.send, async (call, input) => {
      const { runtime_id, session_id, run_id, ...send } = input;
      const run = { session_id, run_id }, offered = ports.originalInput(call);
      const session = await ports.requireRun(call, { runtime_id, session_id }, run);
      const adapter = ports.adapter(call, runtime_id);
      if (!adapter.inputs) throw agentErrors.capability_unavailable("当前运行时不能向一轮补充要求");
      await fresh(call);
      return adapter.inputs.send(run, trustedSupplementInput(send, offered, session.owner.install_id), () => call.invocation.assertAuthorityCurrent());
    }),
    // Taking a supplement back: the round, or the session, still holds it and the model has not seen it.
    register(agentInputActions.withdraw, async (call, input) => {
      const { runtime_id, session_id, run_id, input_id } = input;
      const run = { session_id, run_id };
      await ports.requireRun(call, { runtime_id, session_id }, run);
      const adapter = ports.adapter(call, runtime_id);
      if (!adapter.inputs?.withdraw) throw agentErrors.capability_unavailable("当前运行时不能撤回补充");
      await fresh(call);
      return adapter.inputs.withdraw(run, input_id, () => call.invocation.assertAuthorityCurrent());
    }),
    // The person clicked a round's suggestion (D25, D27): exactly the action it names, under the round's own grant as it is now.
    register(agentOfferActions.run, async (call, input) => {
      const caller = ports.pluginFor(call);
      if (!caller) throw new ActionError("actions.forbidden", "只有插件能执行它会话里的建议");
      const { runtime_id, session_id, run_id, offer_id, reference } = input;
      // The session is the one `requireRun` just checked against the Runtime's record (the caller's plugin, install, person and project), never one the input names apart from it.
      const session = { runtime_id, session_id };
      await ports.requireRun(call, session, { session_id, run_id });
      const view = await ports.adapter(call, runtime_id).read({ session_id, run_id });
      const offer = view.offers?.find(entry => entry.offer_id === offer_id);
      if (!offer) throw agentErrors.offer_unknown("这一轮没有这条建议");
      if (!sameReference(offer.reference, reference) || !view.frozen.action_tools?.some(entry => sameReference(entry, offer.reference))) {
        throw agentErrors.offer_mismatch("只能执行这条建议点名的那个动作");
      }
      const client = await ports.actions(call, runtime_id, session);
      const current = (await client?.discover())?.find(row => sameReference({ capability_id: row.capability_id, version: row.version, provider_id: row.provider.provider_id }, offer.reference));
      if (!client || !current || !current.action.audiences.includes("agent")) throw new ActionError("actions.missing", "这项能力已不可用或已对这一轮关闭");
      if (!current.availability.available) throw new ActionError(current.availability.code, current.availability.reason, { kind: "unavailable" });
      if (actionDigest(current) !== offer.action_digest) throw new ActionError("actions.definition_changed", "这项能力的合同在建议之后变了；请让它按现在的版本重新建议");
      await client.check?.(offer.reference, input.input);
      await fresh(call);
      // The click's own cancellation reaches the action it runs: a click cancelled after these checks still writes nothing.
      return { output: await client.invoke(offer.reference, input.input, call.invocation.signal) };
    }),
  ];
}
