import { bindActionClient, type ActionCallContext, type ActionView, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { AUTOMATION_ADOPTION_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { withAutomationCardDecision } from "../automation-adoption-authority.js";
import type { MolisWorkLocalHost } from "../project-host.js";
import { activeLocale } from "../web-locale.js";
import { assertPersonDecisionProject, type AssistantPersonDecision, type PersonActions } from "./assistant-executor.js";

const REUSE_MS = 2_000;
const scopeKey = (reference: LocalHostProjectReference | undefined) =>
  JSON.stringify([reference?.project_id ?? "", activeLocale()]);

/** Several reads can share the person's directory snapshot. A confirmed operation binds only its own current request. */
export function assistantPersonActions(localHost: MolisWorkLocalHost,
  makeContext: (reference: LocalHostProjectReference | undefined, decision?: AssistantPersonDecision) => Promise<ActionCallContext>) {
  const contexts = new Map<string, { at: number; context: Promise<ActionCallContext> }>();
  const directories = new Map<string, { at: number; views: Promise<readonly ActionView[]> }>();
  const personContext = (reference: LocalHostProjectReference | undefined): Promise<ActionCallContext> => {
    const key = scopeKey(reference), hit = contexts.get(key), now = Date.now();
    if (hit && now - hit.at < REUSE_MS) return hit.context;
    const context = makeContext(reference);
    contexts.set(key, { at: now, context });
    context.catch(() => { if (contexts.get(key)?.context === context) contexts.delete(key); });
    return context;
  };
  const personClient = (reference: LocalHostProjectReference | undefined, decision?: AssistantPersonDecision): PersonActions => {
    const client = reference ? localHost.actionClient(reference) : localHost.homeActionClient();
    if (decision) {
      const context = makeContext(reference, decision);
      return {
        discover: async () => client.discover(await context),
        invoke: async (action, input) => {
          const caller = { ...await context, actor_kind: "user" as const, user_action: decision.entry };
          await decision.beforeEffect();
          if (action.provider_id !== AUTOMATION_ADOPTION_PROVIDER_ID) return client.invoke(caller, action, input);
          assertPersonDecisionProject(caller.project_id, decision);
          return withAutomationCardDecision(decision.entry!, { project_id: caller.project_id!, action, input,
            assertCurrent: decision.assertCurrent, receipt: decision.receipt }, () => client.invoke(caller, action, input));
        },
      };
    }
    const key = scopeKey(reference);
    return {
      discover: () => {
        const hit = directories.get(key), now = Date.now();
        if (hit && now - hit.at < REUSE_MS) return hit.views;
        const views = personContext(reference).then(context => client.discover(context));
        directories.set(key, { at: now, views });
        views.catch(() => { if (directories.get(key)?.views === views) directories.delete(key); });
        return views;
      },
      invoke: async (action, input) => client.invoke(await personContext(reference), action, input),
    };
  };
  const personBound = (reference: LocalHostProjectReference): BoundActionClient => {
    const person = personClient(reference), client = localHost.actionClient(reference);
    return { discover: person.discover, discoverOne: async action => client.discoverOne(await personContext(reference), action), invoke: async (definition, input, control, transport) => {
      const caller = await personContext(reference);
      return bindActionClient(client, () => caller).invoke(definition, input, control, transport);
    } };
  };
  return { personContext, personClient, personBound };
}
