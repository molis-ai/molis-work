import { ActionError, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionDirectory } from "@molis-ai/molis-work-contracts/platform/plugin";

/** The Home's own action that runs its dock judgment (the platform's, not Feed's): one or more items, each judged by the rule bound to the project's dock. */
export const HOME_JUDGMENT_EVALUATE = { capability_id: "home.judgment.evaluate", version: 1 } as const satisfies ActionReference;

/** What says the item, the rule or the choices moved while the judgment ran: nothing to record, and nothing to fail on. */
const TOLERATED_CODES: readonly string[] = ["actions.binding_changed", "actions.binding_missing", "actions.provider_changed", "actions.subject_changed", "actions.subject_unavailable", "actions.subject_incompatible"];

export interface FeedHomeJudgmentOptions {
  projectId: string;
  /**
   * The directory this event goes through. A call that came with a caller (a person's or workflow's action) judges as that caller, through
   * the directory the running action is bound to; a producer with none (a source tick, a wakeup) judges as the plugin's own installation,
   * with the grants the person gave it. Feed never names an identity of its own.
   */
  directory(caller?: ActionCallContext): Pick<PluginActionDirectory, "discover" | "invoke">;
}

/**
 * The Home dock's judgment of an item Feed has just brought in, or of an Inbox entry Feed has just opened: it asks Home's public action to
 * judge and passes over what that action says has nothing to judge (no rule bound, the dock off, a rule the caller cannot reach, an item the
 * rule does not cover, a moved item). Home owns the scene, its binding and its history; Feed only reports that the item arrived.
 */
export function feedHomeJudgmentTrigger(options: FeedHomeJudgmentOptions) {
  return async (subject: { kind: "feed_item" | "inbox_entry"; id: string; project_id: string }, caller?: ActionCallContext): Promise<void> => {
    if (subject.project_id !== options.projectId) throw new ActionError("actions.scope_mismatch", "首页事件不属于当前项目");
    const directory = options.directory(caller);
    const available = async () => (await directory.discover()).some(view => view.capability_id === HOME_JUDGMENT_EVALUATE.capability_id
      && view.version === HOME_JUDGMENT_EVALUATE.version && view.availability.available);
    if (!await available()) return;
    try { await directory.invoke(HOME_JUDGMENT_EVALUATE, { subjects: [{ kind: subject.kind, id: subject.id }] }); }
    catch (error) {
      if (error instanceof ActionError && TOLERATED_CODES.includes(error.code)) return;
      // A rule taken away, or a grant revoked, while it ran is the person's choice, not Feed's failure.
      if (!await available()) return;
      throw error;
    }
  };
}
