import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AttentionReason as ModuleAttentionReason, AttentionStatus as ModuleAttentionStatus, AttentionSubjectType as ModuleAttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { SourceRecord } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedItemDisposition, FeedItemRecord, FeedMaterialRecord, FeedOutRuleRecord, FeedSnapshot, FeedSourceRunRecord, FeedSourceRecord, InboxEntryReason, InboxEntryRecord, InboxEntryStatus, InboxEntrySubjectType, SourceHistoryDecision } from "./projection.js";
import { SourcesError } from "@molis-ai/molis-work-contracts/modules/sources";
import {
  type JudgmentRecord,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { FeedStoreError, assertSourceHistoryDecision, callAttention, callFeed } from "./application-errors.js";
import { feedItemRecord, sourceRunRecord } from "./application-projection.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import { retireFeedSource } from "./source-history.js";
import { JudgmentQueue } from "./judgment-queue.js";
import {
  feedOutRuleMatches,
  registerFeedCaptureVersion,
  type FeedOutRuleWrite,
} from "./out-rules.js";

/** Product operations over module facts; connection and lifecycle are supplied by the host. */
export class FeedApplication {
  private readonly judgments: JudgmentQueue;

  constructor(private readonly ports: FeedApplicationPorts) {
    this.judgments = new JudgmentQueue(ports, {
      feedItem: (projectId, itemId) => this.getFeedItem(projectId, itemId),
      inboxEntry: (projectId, entryId) => this.getInboxEntry(projectId, entryId),
      judgedRuleIds: item => this.listOutRules(item.project_id).filter(rule => rule.judgment && feedOutRuleMatches(rule, item)).map(rule => rule.rule_id),
    });
    ports.subscribeInboxCreated(entry => this.judgments.queueEntry(entry));
  }

  snapshot(projectId: string): FeedSnapshot {
    const sources = this.ports.sources.query.list(projectId).map((source) => this.sourceRecord(source));
    const feedItems = this.ports.feed.query.list(projectId).map(feedItemRecord);
    const inboxEntries = this.ports.attention.query.list(projectId);
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
    return feedItemRecord(callFeed(() => this.ports.feed.query.get(projectId, itemId)));
  }

  getFeedItem(projectId: string, itemId: string): FeedItemRecord {
    return feedItemRecord(callFeed(() => this.ports.feed.query.get(projectId, itemId)));
  }

  findLinkedGoalItem(projectId: string, goalId: string, itemId?: string): FeedItemRecord | null {
    const item = this.ports.feed.query.findByLinkedGoal(projectId, goalId, itemId);
    return item ? feedItemRecord(item) : null;
  }

  listInboxEntries(projectId: string): InboxEntryRecord[] {
    return this.ports.attention.query.list(projectId);
  }

  getInboxEntry(projectId: string, entryId: string): InboxEntryRecord {
    return callAttention(
      () => this.ports.attention.query.get(projectId, entryId),
    );
  }

  getSource(projectId: string, sourceId: string): FeedSourceRecord {
    try {
      return this.sourceRecord(this.ports.sources.query.get(projectId, sourceId));
    } catch (error) {
      if (error instanceof SourcesError && error.code === "source_not_found") {
        throw new FeedStoreError("feed_source_not_found", "找不到这个来源");
      }
      throw error;
    }
  }

  findSource(
    projectId: string,
    syncKind: FeedSourceRecord["sync_kind"],
    definitionId: string | null,
    configFingerprint?: string,
  ): FeedSourceRecord | null {
    const source = this.ports.sources.query.find(projectId, syncKind, definitionId, configFingerprint);
    return source ? this.sourceRecord(source) : null;
  }

  upsertSource(source: FeedSourceRecord): FeedSourceRecord {
    const saved = this.ports.sources.commands.save({
      project_id: source.project_id,
      source_id: source.source_id,
      kind: source.kind,
      definition_id: source.definition_id,
      sync_kind: source.sync_kind,
      name: source.name,
      description: source.description,
      status: source.status,
      enabled: source.enabled,
      origin: source.origin,
      config: source.config,
      schedule: source.schedule,
      connection_ref: source.credential_ref,
      account_label: source.account_label,
      last_sync_at: source.last_sync_at,
      last_outcome: source.last_outcome,
      last_error_code: source.last_error_code,
      imported_at: source.imported_at,
      updated_at: source.updated_at,
    });
    this.ports.listener.writeCursor(source.project_id, source.source_id, source.cursor, source.updated_at);
    return this.sourceRecord(saved);
  }

  setSourceEnabled(projectId: string, sourceId: string, enabled: boolean): FeedSourceRecord {
    try {
      return this.sourceRecord(this.ports.sources.commands.setEnabled(projectId, sourceId, enabled));
    } catch (error) {
      if (error instanceof SourcesError && error.code === "source_not_found") {
        throw new FeedStoreError("feed_source_not_found", "找不到这个来源");
      }
      throw error;
    }
  }

  retireSource(
    projectId: string,
    sourceId: string,
    historyDecision: SourceHistoryDecision,
  ): FeedSourceRecord {
    assertSourceHistoryDecision(historyDecision);
    return retireFeedSource(this.ports, projectId, sourceId, historyDecision, (source) => this.sourceRecord(source));
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
      throw new FeedStoreError("feed_revision_conflict", "这条 Item 已经变化，请刷新后重试");
    }
    const stored = this.ensureInboxEntryForFeedItem(projectId, itemId, "manual", { added_by: "web_user" });
    if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
      this.setInboxEntryStatus(projectId, stored.entry.entry_id, "open", stored.entry.revision);
    }
    return item;
  }

  setInboxEntryStatus(
    projectId: string,
    entryId: string,
    status: InboxEntryStatus,
    expectedRevision?: number,
  ): InboxEntryRecord {
    if (status === "open" || status === "in_progress") {
      // Reopening is admission too: an ignored item's entries stay closed until the person restores the item.
      const entry = this.getInboxEntry(projectId, entryId);
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

  getSourceRunByOperationId(projectId: string, operationId: string): FeedSourceRunRecord | null {
    const run = this.ports.listener.getRunByOperationId(projectId, operationId);
    return run ? sourceRunRecord(run) : null;
  }

  upsertSourceRun(run: FeedSourceRunRecord): FeedSourceRunRecord {
    return sourceRunRecord(this.ports.listener.saveRun({
      project_id: run.project_id,
      run_id: run.run_id,
      operation_id: run.operation_id,
      source_id: run.source_id,
      phase: run.phase,
      outcome: run.outcome,
      empty: run.empty,
      error_code: run.error_code,
      connector_receipt: run.receipt,
      created_count: run.created_count,
      deduped_count: run.deduped_count,
      recovery_count: run.recovery_count,
      started_at: run.started_at,
      completed_at: run.completed_at,
      updated_at: run.updated_at,
    }));
  }

  recoverInterruptedSourceRuns(projectId: string): number {
    return this.ports.listener.recoverInterruptedRuns(projectId);
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
    const result = callFeed(() => this.ports.feed.commands.ingest({
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
    }));
    const item = feedItemRecord(result.item);
    if (result.created || result.updated) {
      try {
        this.captureAfterIngest(item);
      } catch (error) {
        this.recordArtifactOutFailure(item, [], [errorCode(error)]);
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

  async evaluateItems(projectId: string, itemIds: readonly string[], caller?: ActionCallContext): Promise<{ evaluated: number }> {
    if (!itemIds.length || itemIds.length > 20) throw new FeedStoreError("feed_invalid_transition", "请选择 1–20 条消息试跑规则");
    const items = [...new Set(itemIds)].map((id) => this.getFeedItem(projectId, id));
    // Concurrent evaluations own their input batch; they must not drain another call's queue.
    await this.judgments.judgeOwn(() => { for (const item of items) this.captureAfterIngest(item); }, caller, items);
    return { evaluated: items.length };
  }

  recordInboxJudgmentEvent(projectId: string, judgment: JudgmentRecord): void {
    if (judgment.subject.kind !== "inbox_entry" || judgment.subject.project_id !== projectId) {
      throw new FeedStoreError("feed_invalid_transition", "判断结果与当前 Inbox 项目不符");
    }
    this.getInboxEntry(projectId, judgment.subject.id);
    this.ports.appendEvent(projectId, "judgment", judgment.judgment_id, "judgment_completed", judgment.outcome,
      { judgment_id: judgment.judgment_id }, judgment.created_at);
  }

  flushPendingJudgments(caller?: ActionCallContext): Promise<void> {
    return this.judgments.flush(caller);
  }

  flushPendingInboxJudgments(caller?: ActionCallContext, entryIds?: readonly string[]): Promise<void> {
    return this.judgments.flushEntries(caller, entryIds);
  }

  listOutRules(projectId: string): FeedOutRuleRecord[] {
    return this.ports.outRules?.list(projectId) ?? [];
  }

  prepareOutRuleCreate(projectId: string, input: FeedOutRuleWrite): FeedOutRuleRecord {
    return this.requireOutRules().prepareCreate(projectId, input);
  }

  saveOutRuleCreate(rule: FeedOutRuleRecord): FeedOutRuleRecord {
    return this.requireOutRules().saveCreate(rule);
  }

  createOutRule(projectId: string, input: FeedOutRuleWrite): FeedOutRuleRecord {
    return this.saveOutRuleCreate(this.prepareOutRuleCreate(projectId, input));
  }

  prepareOutRuleUpdate(projectId: string, ruleId: string, patch: Partial<FeedOutRuleWrite>): FeedOutRuleRecord {
    return this.requireOutRules().prepareUpdate(projectId, ruleId, patch);
  }

  saveOutRuleUpdate(rule: FeedOutRuleRecord, expectedRevision?: string): FeedOutRuleRecord {
    return this.requireOutRules().saveUpdate(rule, expectedRevision);
  }

  updateOutRule(projectId: string, ruleId: string, patch: Partial<FeedOutRuleWrite>): FeedOutRuleRecord {
    const current = this.requireOutRules().get(projectId, ruleId);
    return this.saveOutRuleUpdate(this.prepareOutRuleUpdate(projectId, ruleId, patch), current.revision);
  }

  deleteOutRule(projectId: string, ruleId: string): FeedOutRuleRecord {
    return this.requireOutRules().delete(projectId, ruleId);
  }

  recordCaptureJudgment(item: FeedItemRecord, rule: FeedOutRuleRecord, judgment: JudgmentRecord): string | undefined {
    let createdEntry: string | undefined;
    if (judgment.subject.kind !== "feed_item" || judgment.subject.id !== item.item_id || judgment.subject.project_id !== item.project_id) {
      throw new FeedStoreError("feed_invalid_transition", "判断结果与当前 Feed 消息不符");
    }
    // The judgment arrives after a model wait; the person may have ignored the item meanwhile, and a rule does not overrule that.
    if (rule.admission === "inbox" && (judgment.outcome === "needs_review" || judgment.suggested_behavior_ids.includes("inbox.admit"))
      && !this.isArchived(item.project_id, item.item_id)) {
      const admission = this.ensureInboxEntryForFeedItem(item.project_id, item.item_id, "source_rule", {
        rule_id: rule.rule_id, rule_name: rule.name, judgment_id: judgment.judgment_id,
        function_key: judgment.function_key, function_version: judgment.function_version, needs_review: judgment.outcome === "needs_review",
      });
      if (admission.created) createdEntry = admission.entry.entry_id;
    }
    this.ports.appendEvent(item.project_id, "judgment", judgment.judgment_id, "judgment_completed", judgment.outcome,
      { judgment_id: judgment.judgment_id }, judgment.created_at);
    return createdEntry;
  }

  setDisposition(
    projectId: string,
    itemId: string,
    disposition: FeedItemDisposition,
    expectedRevision?: number,
  ): FeedItemRecord {
    const item = callFeed(
      () => this.ports.feed.commands.setDisposition(projectId, itemId, disposition, expectedRevision),
    );
    return feedItemRecord(item);
  }

  restoreToFeed(projectId: string, itemId: string, expectedRevision?: number): FeedItemRecord {
    return feedItemRecord(callFeed(
      () => this.ports.feed.commands.restore(projectId, itemId, expectedRevision),
    ));
  }

  markRead(projectId: string, itemId: string): FeedItemRecord {
    return feedItemRecord(callFeed(
      () => this.ports.feed.commands.markRead(projectId, itemId),
    ));
  }

  linkGoal(
    projectId: string,
    itemId: string,
    goalId: string,
    disposition: "promoted" | "processing",
  ): FeedItemRecord {
    const item = callFeed(
      () => this.ports.feed.commands.linkGoal(projectId, itemId, goalId, disposition),
    );
    return feedItemRecord(item);
  }

  private isArchived(projectId: string, itemId: string): boolean {
    return this.ports.feed.query.exists(projectId, itemId) && this.getFeedItem(projectId, itemId).disposition === "archived";
  }

  /** An ignored item comes back through restore, never by being admitted, reopened or reported on in the Inbox. */
  private assertNotIgnored(projectId: string, itemId: string): void {
    if (this.isArchived(projectId, itemId)) {
      throw new FeedStoreError("feed_invalid_transition", "请先恢复这条已忽略的 Feed Item");
    }
  }

  private requireOutRules() {
    if (!this.ports.outRules) {
      throw new FeedStoreError("feed_out_rule_not_found", "捕捉规则尚未初始化");
    }
    return this.ports.outRules;
  }

  private captureAfterIngest(item: FeedItemRecord): void {
    const rules = this.ports.outRules?.list(item.project_id) ?? [];
    const matched = rules.filter((rule) => feedOutRuleMatches(rule, item));
    if (matched.length === 0) return;
    for (const rule of matched) {
      // A rule does not bring an ignored item back to the Inbox.
      if (rule.admission === "inbox" && !rule.judgment && !this.isArchived(item.project_id, item.item_id)) {
        this.ensureInboxEntryForFeedItem(item.project_id, item.item_id, "source_rule", { rule_id: rule.rule_id, rule_name: rule.name });
      }
    }
    if (!this.ports.artifacts) {
      this.recordArtifactOutFailure(item, matched.map((rule) => rule.rule_id), ["feed_artifact_producer_missing"]);
      return;
    }
    const failedRuleIds: string[] = [];
    const errorCodes: string[] = [];
    for (const rule of matched) {
      try {
        registerFeedCaptureVersion(this.ports.artifacts, item, rule);
      } catch (error) {
        failedRuleIds.push(rule.rule_id);
        errorCodes.push(errorCode(error));
      }
    }
    if (failedRuleIds.length > 0) {
      this.recordArtifactOutFailure(item, failedRuleIds, errorCodes);
      return;
    }
    this.completeArtifactOutFailure(item);
  }



  private recordArtifactOutFailure(item: FeedItemRecord, ruleIds: string[], errorCodes: string[]): void {
    // The person ignored this item; a capture that failed for it is not worth putting it back in front of them.
    if (this.isArchived(item.project_id, item.item_id)) return;
    try {
      const { entry } = callAttention(() => this.ports.attention.commands.create({
        project_id: item.project_id,
        subject_type: "feed_item",
        subject_id: item.item_id,
        reason: "artifact_out_failed",
        detail: { rule_ids: ruleIds, error_codes: errorCodes },
      }));
      if (entry.status === "done" || entry.status === "dismissed") {
        this.setInboxEntryStatus(item.project_id, entry.entry_id, "open");
      }
    } catch {
      // ingest already persisted; missing Inbox is worse than throwing into sync
    }
  }

  private completeArtifactOutFailure(item: FeedItemRecord): void {
    try {
      for (const entry of this.ports.attention.query.findForSubject(item.project_id, "feed_item", item.item_id)) {
        if (entry.reason !== "artifact_out_failed") continue;
        if (entry.status === "open" || entry.status === "in_progress") {
          this.setInboxEntryStatus(item.project_id, entry.entry_id, "done");
        }
      }
    } catch {
      // successful artifacts already exist
    }
  }

  private sourceRecord(source: SourceRecord): FeedSourceRecord {
    const checkpoint = this.ports.listener.checkpoint(source.project_id, source.source_id, source.updated_at);
    return {
      project_id: source.project_id,
      source_id: source.source_id,
      kind: source.kind,
      definition_id: source.definition_id,
      sync_kind: source.sync_kind,
      name: source.name,
      description: source.description,
      status: source.status,
      enabled: source.enabled,
      item_count: this.ports.feed.query.countBySource(source.project_id, source.source_id),
      origin: source.origin,
      config: source.config,
      schedule: source.schedule,
      cursor: checkpoint.cursor,
      credential_ref: source.connection_ref,
      account_label: source.account_label,
      last_sync_at: source.last_sync_at,
      last_outcome: source.last_outcome,
      last_error_code: source.last_error_code,
      imported_at: source.imported_at,
      updated_at: source.updated_at,
    };
  }

}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && error.code) {
    return error.code;
  }
  return "feed_artifact_register_failed";
}
