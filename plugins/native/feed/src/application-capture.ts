import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { feedErrors } from "./contract/feed.js";
import type { FeedItemRecord, FeedOutRuleRecord, InboxEntryReason, InboxEntryRecord, InboxEntryStatus } from "./projection.js";
import { callAttention } from "./application-errors.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import { captureFeedRules, feedOutRuleMatches, throwIfCallRefused } from "./out-rules.js";

/** What capture needs of the Feed's Inbox: whether the person ignored the item, admitting it, and moving an entry. */
export interface FeedCaptureInbox {
  isArchived(projectId: string, itemId: string): boolean;
  ensureInboxEntryForFeedItem(
    projectId: string,
    itemId: string,
    reason: Extract<InboxEntryReason, "manual" | "source_rule">,
    detail?: Record<string, unknown>,
  ): { entry: InboxEntryRecord; created: boolean };
  setInboxEntryStatus(projectId: string, entryId: string, status: InboxEntryStatus): InboxEntryRecord;
}

/**
 * What an item's capture rules did with it: the Inbox admissions they make, the artifacts they produce, and the Inbox entry that
 * stands for a capture that failed until a later capture succeeds.
 */
export class FeedCapture {
  constructor(
    private readonly ports: Pick<FeedApplicationPorts, "outRules" | "artifacts" | "attention" | "appendEvent">,
    private readonly inbox: FeedCaptureInbox,
  ) {}

  afterIngest(item: FeedItemRecord): void {
    const rules = this.ports.outRules?.list(item.project_id) ?? [];
    const matched = rules.filter((rule) => feedOutRuleMatches(rule, item));
    if (matched.length === 0) return;
    for (const rule of matched) {
      // A rule does not bring an ignored item back to the Inbox.
      if (rule.admission === "inbox" && !rule.judgment && !this.inbox.isArchived(item.project_id, item.item_id)) {
        this.inbox.ensureInboxEntryForFeedItem(item.project_id, item.item_id, "source_rule", { rule_id: rule.rule_id, rule_name: rule.name });
      }
    }
    if (!this.ports.artifacts) {
      this.recordFailure(item, matched.map((rule) => rule.rule_id), ["feed_artifact_producer_missing"]);
      return;
    }
    const { failedRuleIds, errorCodes } = this.ports.artifacts.capture(item.project_id, writer => captureFeedRules(writer, item, matched));
    if (failedRuleIds.length > 0) {
      this.recordFailure(item, failedRuleIds, errorCodes);
      return;
    }
    this.completeFailure(item);
  }

  recordJudgment(item: FeedItemRecord, rule: FeedOutRuleRecord, judgment: JudgmentRecord): string | undefined {
    let createdEntry: string | undefined;
    if (judgment.subject.kind !== "feed_item" || judgment.subject.id !== item.item_id || judgment.subject.project_id !== item.project_id) {
      throw feedErrors.invalid_transition("判断结果与当前 Feed 消息不符");
    }
    // The judgment arrives after a model wait; the person may have ignored the item meanwhile, and a rule does not overrule that.
    if (rule.admission === "inbox" && (judgment.outcome === "needs_review" || judgment.suggested_behavior_ids.includes("inbox.admit"))
      && !this.inbox.isArchived(item.project_id, item.item_id)) {
      const admission = this.inbox.ensureInboxEntryForFeedItem(item.project_id, item.item_id, "source_rule", {
        rule_id: rule.rule_id, rule_name: rule.name, judgment_id: judgment.judgment_id,
        function_key: judgment.function_key, function_version: judgment.function_version, needs_review: judgment.outcome === "needs_review",
      });
      if (admission.created) createdEntry = admission.entry.entry_id;
    }
    this.ports.appendEvent(item.project_id, "judgment", judgment.judgment_id, "judgment_completed", judgment.outcome,
      { judgment_id: judgment.judgment_id }, judgment.created_at);
    return createdEntry;
  }

  recordFailure(item: FeedItemRecord, ruleIds: string[], errorCodes: string[]): void {
    // The person ignored this item; a capture that failed for it is not worth putting it back in front of them.
    if (this.inbox.isArchived(item.project_id, item.item_id)) return;
    try {
      const { entry } = callAttention(() => this.ports.attention.commands.create({
        project_id: item.project_id,
        subject_type: "feed_item",
        subject_id: item.item_id,
        reason: "artifact_out_failed",
        detail: { rule_ids: ruleIds, error_codes: errorCodes },
      }));
      if (entry.status === "done" || entry.status === "dismissed") {
        this.inbox.setInboxEntryStatus(item.project_id, entry.entry_id, "open");
      }
    } catch (error) {
      // The item commits with this transaction: an Inbox entry for the failed capture that cannot be written does not undo it; a refusal of the call does.
      throwIfCallRefused(error);
    }
  }

  private completeFailure(item: FeedItemRecord): void {
    try {
      for (const entry of this.ports.attention.query.findForSubject(item.project_id, "feed_item", item.item_id)) {
        if (entry.reason !== "artifact_out_failed") continue;
        if (entry.status === "open" || entry.status === "in_progress") {
          this.inbox.setInboxEntryStatus(item.project_id, entry.entry_id, "done");
        }
      }
    } catch {
      // successful artifacts already exist
    }
  }
}
