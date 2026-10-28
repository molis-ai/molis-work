import { bindActionClient, type ActionCallContext, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxActions } from "./actions.js";
import { createInboxJudgmentTrigger } from "./scenes.js";

/**
 * The next-step judgment of an Inbox entry, started from Feed (a source's new message, a workflow's handoff, a person's own add): it asks
 * the Inbox's own action to judge, as the caller of the event, and passes over what that action says has no next step to judge. The
 * Inbox is a plugin of the project's Runtime; the Host knows its action, not its code, and takes this from the plugin's package.
 */
export function inboxJudgmentTrigger(options: { actions: ActionClient; projectId: string; context(): ActionCallContext }) {
  const evaluate = inboxActions.evaluateJudgment;
  return createInboxJudgmentTrigger({ projectId: options.projectId, context: options.context,
    available: async caller => (await options.actions.discover(caller)).some(view => view.capability_id === evaluate.capability_id
      && view.version === evaluate.version && view.availability.available),
    evaluate: (entryId, caller) => bindActionClient(options.actions, () => caller).invoke(evaluate, { entry_ids: [entryId] }) });
}
