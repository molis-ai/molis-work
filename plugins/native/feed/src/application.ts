import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxErrors, type AttentionEntryRecord, type AttentionReason as ModuleAttentionReason, type AttentionStatus as ModuleAttentionStatus, type AttentionSubjectType as ModuleAttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedItemDisposition, FeedItemRecord, FeedMaterialRecord, FeedSnapshot, FeedSourceRecord, InboxEntryReason, InboxEntryRecord, InboxEntryStatus, InboxEntrySubjectType } from "./projection.js";

import { callAttention } from "./application-errors.js";
import { feedErrors } from "./contract/feed.js";
import { feedItemRecord, sourceRunRecord } from "./application-projection.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import { FeedCapture } from "./application-capture.js";
import { FeedOutRules } from "./application-out-rules.js";
import { FeedSources } from "./application-sources.js";
import { FEED_PLUGIN_ID } from "./identity.js";
import { JudgmentQueue } from "./judgment-queue.js";
import { admitToInbox, isIgnored } from "./inbox-admission.js";
import { feedCaptureFailure, feedOutRuleMatches } from "./out-rules.js";

/**
 * Product operations over module facts; connection and lifecycle are supplied by the host. Items, their Inbox entries and ingest
 * (with the judgments it queues) are here; sources and their runs, the capture rules, and what capture did are collaborators.
 */
export class FeedApplication {
  readonly sources: FeedSources;
  readonly outRules: FeedOutRules;
  readonly capture: FeedCapture;
  private readonly judgments: JudgmentQueue;

  constructor(private readonly ports: FeedApplicationPorts) {
    this.sources = new FeedSources(ports);
    this.outRules = new FeedOutRules(ports);
    this.capture = new FeedCapture(ports, {
      isArchived: (projectId, itemId) => this.isArchived(projectId, itemId),
      ensureInboxEntryForFeedItem: (projectId, itemId, reason, detail) => this.ensureInboxEntryForFeedItem(projectId, itemId, reason, detail),
      setInboxEntryStatus: (projectId, entryId, status) => this.setInboxEntryStatus(projectId, entryId, status),
    });
    this.judgments = new JudgmentQueue(ports, {
      feedItem: (projectId, itemId) => this.getFeedItem(projectId, itemId),
      inboxEntry: (projectId, entryId) => this.getInboxEntry(projectId, entryId),
      judgedRuleIds: item => this.outRules.list(item.project_id).filter(rule => rule.judgment && feedOutRuleMatches(rule, item)).map(rule => rule.rule_id),
    });
    ports.subscribeInboxCreated(entry => this.judgments.queueEntry(entry));
  }

  snapshot(projectId: string): FeedSnapshot {
    const sources = this.ports.sources.query.list(projectId).map((source) => this.sources.record(source));
    const feedItems = this.ports.feed.query.list(projectId).map(feedItemRecord);
    const inboxEntries = this.listInboxEntries(projectId);
    const runs = this.ports.listener.listRuns(projectId).map(sourceRunRecord);
    return {
      sources,
      feed_items: feedItems,
      inbox_entries: inboxEntries,
      runs,
      out_rules: this.ports.outRules?.list(projectId) ?? [],
    };
  }

  getItem(projectId: string, itemId: string): FeedItemRecord {
    return feedItemRecord(this.ports.feed.query.get(projectId, itemId));
  }

  getFeedItem(projectId: string, itemId: string): FeedItemRecord {
    return feedItemRecord(this.ports.feed.query.get(projectId, itemId));
  }

  findLinkedGoalItem(projectId: string, goalId: string, itemId?: string): FeedItemRecord | null {
    const item = this.ports.feed.query.findByLinkedGoal(projectId, goalId, itemId);
    return item ? feedItemRecord(item) : null;
  }

  listInboxEntries(projectId: string): InboxEntryRecord[] {
    return this.ports.attention.query.list(projectId).filter(isFeedEntry);
  }

  getInboxEntry(projectId: string, entryId: string): InboxEntryRecord {
    return requireFeedEntry(callAttention(
      () => this.ports.attention.query.get(projectId, entryId),
    ));
  }

  createInboxEntry(input: {
    projectId: string;
    subjectType: InboxEntrySubjectType;
    subjectId: string;
    reason: InboxEntryReason;
    detail?: Record<string, unknown>;
    entryId?: string;
    at?: string;
  }): { entry: InboxEntryRecord; created: boolean } {
    if (input.subjectType === "feed_item") this.assertNotIgnored(input.projectId, input.subjectId);
    const result = callAttention(() => this.ports.attention.commands.create({
      project_id: input.projectId,
      subject_type: input.subjectType as ModuleAttentionSubjectType,
      subject_id: input.subjectId,
      reason: input.reason as ModuleAttentionReason,
      detail: input.detail,
      entry_id: input.entryId,
      at: input.at,
    }));
    const entry = result.entry;
    return { entry, created: result.created };
  }

  ensureInboxEntryForFeedItem(
    projectId: string,
    itemId: string,
    reason: Extract<InboxEntryReason, "manual" | "source_rule">,
    detail: Record<string, unknown> = {},
  ): { entry: InboxEntryRecord; created: boolean } {
    this.assertNotIgnored(projectId, itemId);
    const result = callAttention(
      () => this.ports.attention.commands.ensureFeedItem(projectId, itemId, reason, detail),
    );
    const entry = result.entry;
    return { entry, created: result.created };
  }

  addToInbox(projectId: string, itemId: string, expectedRevision?: number): FeedItemRecord {
    const item = this.getFeedItem(projectId, itemId);
    if (expectedRevision != null && expectedRevision !== item.revision) {
      throw feedErrors.revision_conflict("这条 Item 已经变化，请刷新后重试");
    }
    admitToInbox(this, projectId, itemId, "web_user");
    return item;
  }

  setInboxEntryStatus(
    projectId: string,
    entryId: string,
    status: InboxEntryStatus,
    expectedRevision?: number,
  ): InboxEntryRecord {
    const entry = this.getInboxEntry(projectId, entryId);
    if (status === "open" || status === "in_progress") {
      // Reopening is admission too: an ignored item's entries stay closed until the person restores the item.
      if (entry.subject_type === "feed_item") this.assertNotIgnored(projectId, entry.subject_id);
    }
    return callAttention(
      () => this.ports.attention.commands.setStatus(
        projectId,
        entryId,
        status as ModuleAttentionStatus,
        expectedRevision,
      ),
    );
  }

  ingestItem(input: {
    source: FeedSourceRecord;
    externalId: string;
    signal?: { signal_id: string; revision: number };
    /** A source without Signals declares that this existing item's content changed. */
    refresh?: boolean;
    title: string;
    summary: string;
    body?: string | null;
    url?: string | null;
    kind?: string;
    priority?: string;
    tags?: string[];
    author?: string | null;
    occurredAt: string;
    attention?: false | {
      reason: Extract<InboxEntryReason, "manual" | "source_rule">;
      detail?: Record<string, unknown>;
    };
    material?: Omit<FeedMaterialRecord, "project_id" | "item_id" | "imported_at" | "updated_at">;
  }): { item: FeedItemRecord; created: boolean; updated: boolean } {
    const result = this.ports.feed.commands.ingest({
      project_id: input.source.project_id,
      source_id: input.source.source_id,
      source_kind: input.source.kind,
      source_label: input.source.name,
      external_id: input.externalId,
      signal: input.signal,
      refresh: input.refresh,
      title: input.title,
      summary: input.summary,
      body: input.body,
      url: input.url,
      kind: input.kind,
      priority: input.priority,
      tags: input.tags,
      author: input.author,
      occurred_at: input.occurredAt,
      attention: input.attention,
      material: input.material ? {
        ...input.material,
      } : undefined,
    });
    const item = feedItemRecord(result.item);
    if (result.created || result.updated) {
      try {
        this.capture.afterIngest(item);
      } catch (error) {
        this.capture.recordFailure(item, [], [feedCaptureFailure(error)]);
      }
      this.judgments.queueItem(item);
    }
    return { item, created: result.created, updated: result.updated };
  }

  /**
   * Ingest an item for a caller that then waits on the judgments it owes (a concurrent action, which runs beside the
   * project's queue while the model answers). It judges the item it ingested and the Inbox entries that ingest created,
   * with the caller's authority, and leaves whatever other producers queued meanwhile to them.
   */
  ingestItemJudged(input: Parameters<FeedApplication["ingestItem"]>[0], caller?: ActionCallContext): Promise<{ item: FeedItemRecord; created: boolean; updated: boolean }> {
    return this.judgments.judgeOwn(() => this.ingestItem(input), caller);
  }

  // Not an `async` method, for the reason `JudgmentQueue.judgeOwn` is not: what the step throws reaches the caller as a throw, so a Runtime that
  // commits the step as one write rolls it back.
  evaluateItems(projectId: string, itemIds: readonly string[], caller?: ActionCallContext): Promise<{ evaluated: number }> {
    if (!itemIds.length || itemIds.length > 20) throw feedErrors.invalid_transition("请选择 1–20 条消息试跑规则");
    const items = [...new Set(itemIds)].map((id) => this.getFeedItem(projectId, id));
    // Concurrent evaluations own their input batch; they must not drain another call's queue.
    return this.judgments.judgeOwn(() => { for (const item of items) this.capture.afterIngest(item); }, caller, items).then(() => ({ evaluated: items.length }));
  }

  flushPendingJudgments(caller?: ActionCallContext): Promise<void> {
    return this.judgments.flush(caller);
  }

  flushPendingInboxJudgments(caller?: ActionCallContext, entryIds?: readonly string[]): Promise<void> {
    return this.judgments.flushEntries(caller, entryIds);
  }

  setDisposition(
    projectId: string,
    itemId: string,
    disposition: FeedItemDisposition,
    expectedRevision?: number,
  ): FeedItemRecord {
    const item = this.ports.feed.commands.setDisposition(projectId, itemId, disposition, expectedRevision);
    return feedItemRecord(item);
  }

  restoreToFeed(projectId: string, itemId: string, expectedRevision?: number): FeedItemRecord {
    return feedItemRecord(this.ports.feed.commands.restore(projectId, itemId, expectedRevision));
  }

  markRead(projectId: string, itemId: string): FeedItemRecord {
    return feedItemRecord(this.ports.feed.commands.markRead(projectId, itemId));
  }

  linkGoal(
    projectId: string,
    itemId: string,
    goalId: string,
    disposition: "promoted",
  ): FeedItemRecord {
    const item = this.ports.feed.commands.linkGoal(projectId, itemId, goalId, disposition);
    return feedItemRecord(item);
  }

  private isArchived(projectId: string, itemId: string): boolean {
    return this.ports.feed.query.exists(projectId, itemId) && isIgnored(this.getFeedItem(projectId, itemId));
  }

  /** An ignored item comes back through restore, never by being admitted, reopened or reported on in the Inbox. */
  private assertNotIgnored(projectId: string, itemId: string): void {
    if (this.isArchived(projectId, itemId)) {
      throw feedErrors.invalid_transition("请先恢复这条已忽略的 Feed Item");
    }
  }

}

/**
 * The entries Feed's application lists and acts on: the unassigned ones the host's Attention Module still holds, and its own once the
 * platform's service records the owner. Another plugin's entries (a Goal's decision) are that plugin's, and Feed does not find them.
 */
function isFeedEntry(entry: AttentionEntryRecord): boolean {
  return entry.owner_plugin_id === null || entry.owner_plugin_id === FEED_PLUGIN_ID;
}

function requireFeedEntry(entry: AttentionEntryRecord): AttentionEntryRecord {
  if (!isFeedEntry(entry)) throw inboxErrors.entry_not_found("找不到这个 Inbox Entry");
  return entry;
}
