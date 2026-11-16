import { ActionError, bindActionHandler, type ActionCallContext, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { ACCEPTANCE_PROVIDER_ID, acceptanceActions, acceptanceErrors } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { openAcceptance, type AcceptanceCaller, type AcceptanceEvidencePorts, type AcceptanceService } from "@molis-ai/molis-work-module-acceptance";
import { hostBoundSession } from "@molis-ai/molis-work-plugin-sdk";

const CHECK_EVIDENCE = { capability_id: "agent.evidence.check", version: /* @version action.agent.evidence.check */ 1 } as const;
const READ_ARTIFACT = { capability_id: "artifacts.read", version: /* @version action.artifacts.read */ 1 } as const;

/**
 * Who is calling, from the call the Host authenticated and from nothing in the input (S-acceptance-person-decides). "The person" is a
 * page's own call as the user: a call a plugin made or handed on is not one, whatever audience it carries. A session counts only
 * when the Host bound it to an Agent round, so an outside client's own naming of one backs no evidence.
 */
function callerOf(caller: ActionCallContext): AcceptanceCaller {
  if (!caller.project_id) throw acceptanceErrors.scope("要求与认可记在项目里，要在项目里调用");
  return { project_id: caller.project_id, actor_id: caller.actor_id, person: caller.audience === "user" && !caller.host_plugin && !caller.delegated_by && !caller.calling_plugin_id,
    session: hostBoundSession(caller) ?? null };
}

/** Cited evidence is looked up as the caller: what it cannot read backs nothing, and a round is only ever one of its own session. */
function evidencePorts(caller: ActionCallContext, client: ActionClient): AcceptanceEvidencePorts {
  return {
    artifactReadable: async reference => (await client.invoke(caller, READ_ARTIFACT, { reference }) as { selected: unknown }).selected != null,
    checkRun: async (run_id, command_call_ids) => {
      try { return await client.invoke(caller, CHECK_EVIDENCE, { run_id, command_call_ids }) as Awaited<ReturnType<AcceptanceEvidencePorts["checkRun"]>>; } catch (error) {
        if (error instanceof ActionError && error.code === "agent.run_unknown") return "none";
        throw error;
      }
    },
    stopped: () => (caller as { signal?: AbortSignal }).signal?.aborted === true,
  };
}

/**
 * Requirements and acceptance in the Host (`modules/acceptance`), registered once as `system.acceptance`. The store is the Home's;
 * each call opens it, works in the caller's project and closes it, so nothing is held between calls.
 */
export function acceptanceProvider(homeDirectory: string, clientFor: (caller: ActionCallContext) => ActionClient): ActionProviderRegistration {
  const run = async <T>(work: (service: AcceptanceService) => T | Promise<T>): Promise<T> => {
    const opened = openAcceptance(homeDirectory);
    try { return await work(opened.service); } finally { opened.close(); }
  };
  const A = acceptanceActions;
  return { provider: { provider_id: ACCEPTANCE_PROVIDER_ID, title: "要求、证据与认可", kind: "system" }, definitions: [A.set, A.deliver, A.report, A.read, A.decide],
    handlers: [
      bindActionHandler(A.set, (input, caller) => run(service => service.set(callerOf(caller), input))),
      bindActionHandler(A.deliver, (input, caller) => run(service => service.deliver(callerOf(caller), input, evidencePorts(caller, clientFor(caller))))),
      bindActionHandler(A.report, (input, caller) => run(service => service.report(callerOf(caller), input, evidencePorts(caller, clientFor(caller))))),
      bindActionHandler(A.read, (input, caller) => run(service => service.read(callerOf(caller), input))),
      bindActionHandler(A.decide, (input, caller) => run(service => service.decide(callerOf(caller), input))),
    ] };
}
