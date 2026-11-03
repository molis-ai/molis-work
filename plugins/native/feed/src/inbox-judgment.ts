import { ActionError, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionDirectory } from "@molis-ai/molis-work-contracts/platform/plugin";

/** The Inbox's own action that judges the next step of entries: the Inbox's, not Feed's. */
export const INBOX_JUDGMENT_EVALUATE = { capability_id: "inbox.judgment.evaluate", version: 1 } as const satisfies ActionReference;

/** What says the entry or the rule moved while the judgment ran: nothing to record, and not a failure of the Inbox entry that was saved. */
const TOLERATED_CODES: readonly string[] = ["actions.binding_changed", "actions.binding_missing", "actions.provider_changed", "actions.subject_changed", "actions.subject_unavailable"];

export interface FeedInboxJudgmentOptions {
  projectId: string;
  /** The directory the running action is bound to: the entry is judged as that action's caller, never as an identity of Feed's own. */
  directory(caller?: ActionCallContext): Pick<PluginActionDirectory, "discover" | "invoke">;
}

/**
 * The Inbox's next-step judgment of an entry Feed has just opened (a source's new message, a rule's admission, a person's own add): it asks
 * the Inbox's public action to judge and passes over what that action says has nothing to judge (no rule bound, a rule the caller cannot
 * reach, an entry that moved). The Inbox owns the scene and its history; Feed only reports that the entry arrived.
 */
export function feedInboxJudgmentTrigger(options: FeedInboxJudgmentOptions) {
  return async (entry: { project_id: string; entry_id: string }, caller?: ActionCallContext): Promise<void> => {
    if (entry.project_id !== options.projectId) throw new ActionError("actions.scope_mismatch", "入箱事件不属于当前项目");
    const directory = options.directory(caller);
    const available = async () => (await directory.discover()).some(view => view.capability_id === INBOX_JUDGMENT_EVALUATE.capability_id
      && view.version === INBOX_JUDGMENT_EVALUATE.version && view.availability.available);
    if (!await available()) return;
    try { await directory.invoke(INBOX_JUDGMENT_EVALUATE, { entry_ids: [entry.entry_id] }); }
    catch (error) {
      if (error instanceof ActionError && TOLERATED_CODES.includes(error.code)) return;
      // A rule taken away, or a grant revoked, while it ran is the person's choice, not Feed's failure.
      if (!await available()) return;
      throw error;
    }
  };
}
