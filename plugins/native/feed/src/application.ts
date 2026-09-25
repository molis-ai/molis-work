import type { AttentionReason as ModuleAttentionReason, AttentionStatus as ModuleAttentionStatus, AttentionSubjectType as ModuleAttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { SourceRecord } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedItemDisposition, FeedItemRecord, FeedMaterialRecord, FeedOutRuleRecord, FeedSnapshot, FeedSourceRunRecord, FeedSourceRecord, InboxEntryReason, InboxEntryRecord, InboxEntryStatus, InboxEntrySubjectType, SourceHistoryDecision } from "./projection.js";
import { SourcesError } from "@molis-ai/molis-work-contracts/modules/sources";
import { FeedError } from "@molis-ai/molis-work-contracts/modules/feed";
import { AttentionError } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import {
  FEED_CAPTURE_SCENE_ID,
  HOME_DOCK_SCENE_ID,
  type JudgmentRecord,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { FeedStoreError, assertSourceHistoryDecision } from "./application-errors.js";
import { toLegacyAttentionEntry, toLegacyFeedItem, compatibleRun } from "./application-projection.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import {
  feedOutRuleMatches,
  registerFeedCaptureVersion,
  type FeedOutRuleWrite,
} from "./out-rules.js";

/** Product operations over module facts; connection and lifecycle are supplied by the host. */
export class FeedApplication {
  private pendingFeedJudgments: FeedItemRecord[] = [];
  private readonly pendingInboxJudgments = new Map<string, { board_id: string; entry_id: string }>();

  constructor(private readonly ports: FeedApplicationPorts) {
    ports.subscribeInboxCreated(entry => this.pendingInboxJudgments.set(JSON.stringify([entry.board_id, entry.entry_id]), entry));
  }

  snapshot(boardId: string): FeedSnapshot {
    const sources = this.ports.sources.query.list(boardId).map((source) => this.compatibleSource(source));
    const feedItems = this.ports.feed.query.list(boardId).map(toLegacyFeedItem);
    const inboxEntries = this.ports.attention.query.list(boardId).map(toLegacyAttentionEntry);
    const runs = this.ports.listener.listRuns(boardId).map(compatibleRun);
    const contractMigrations = this.ports.receipts.listContractMigrations();
    return {
      sources,
      feed_items: feedItems,
      inbox_entries: inboxEntries,
      runs,
      contract_migrations: contractMigrations,
      out_rules: this.ports.outRules?.list(boardId) ?? [],
    };
  }

  getItem(boardId: string, itemId: string): FeedItemRecord {
    return toLegacyFeedItem(this.callFeed(() => this.ports.feed.query.get(boardId, itemId)));
  }

  getFeedItem(boardId: string, itemId: string): FeedItemRecord {
    return toLegacyFeedItem(this.callFeed(() => this.ports.feed.query.get(boardId, itemId)));
  }

  findLinkedGoalItem(boardId: string, goalId: string, itemId?: string): FeedItemRecord | null {
    const item = this.ports.feed.query.findByLinkedGoal(boardId, goalId, itemId);
    return item ? toLegacyFeedItem(item) : null;
  }

  listInboxEntries(boardId: string): InboxEntryRecord[] {
    return this.ports.attention.query.list(boardId).map(toLegacyAttentionEntry);
  }

  getInboxEntry(boardId: string, entryId: string): InboxEntryRecord {
    return toLegacyAttentionEntry(this.callAttention(
      () => this.ports.attention.query.get(boardId, entryId),
    ));
  }

  getSource(boardId: string, sourceId: string): FeedSourceRecord {
    try {
      return this.compatibleSource(this.ports.sources.query.get(boardId, sourceId));
    } catch (error) {
      if (error instanceof SourcesError && error.code === "source_not_found") {
        throw new FeedStoreError("feed_source_not_found", "找不到这个来源");
      }
      throw error;
    }
  }

  findSource(
    boardId: string,
    syncKind: FeedSourceRecord["sync_kind"],
    definitionId: string | null,
    configFingerprint?: string,
  ): FeedSourceRecord | null {
    const source = this.ports.sources.query.find(boardId, syncKind, definitionId, configFingerprint);
    return source ? this.compatibleSource(source) : null;
  }

  upsertSource(source: FeedSourceRecord): FeedSourceRecord {
    const saved = this.ports.sources.commands.save({
      project_id: source.board_id,
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
    this.ports.listener.writeCursor(source.board_id, source.source_id, source.cursor, source.updated_at);
    return this.compatibleSource(saved);
  }

  setSourceEnabled(boardId: string, sourceId: string, enabled: boolean): FeedSourceRecord {
    try {
      return this.compatibleSource(this.ports.sources.commands.setEnabled(boardId, sourceId, enabled));
    } catch (error) {
      if (error instanceof SourcesError && error.code === "source_not_found") {
        throw new FeedStoreError("feed_source_not_found", "找不到这个来源");
      }
      throw error;
    }
  }

  retireSource(
    boardId: string,
    sourceId: string,
    historyDecision: SourceHistoryDecision,
  ): FeedSourceRecord {
    assertSourceHistoryDecision(historyDecision);
    return this.ports.transaction(() => {
      const now = new Date().toISOString();
      if (historyDecision === "delete_local_history") {
        this.ports.feed.commands.deleteBySource(boardId, sourceId);
        this.ports.attention.commands.deleteSubject(boardId, "source_fault", sourceId);
        this.ports.listener.deleteSourceState(boardId, sourceId);
      }
      const retired = this.compatibleSource(
        this.ports.sources.commands.retire(boardId, sourceId, historyDecision, now),
      );
      this.ports.appendEvent(
        boardId,
        "feed_source",
        sourceId,
        "feed_source.deleted",
        historyDecision === "delete_local_history"
          ? "来源及本地历史已删除"
          : "来源已删除，本地历史保留",
        { history_decision: historyDecision },
        now,
      );
      return retired;
    });
  }

  createInboxEntry(input: {
    boardId: string;
    subjectType: InboxEntrySubjectType;
    subjectId: string;
    reason: InboxEntryReason;
    detail?: Record<string, unknown>;
    entryId?: string;
    at?: string;
  }): { entry: InboxEntryRecord; created: boolean } {
    const result = this.callAttention(() => this.ports.attention.commands.create({
      project_id: input.boardId,
      subject_type: input.subjectType as ModuleAttentionSubjectType,
      subject_id: input.subjectId,
      reason: input.reason as ModuleAttentionReason,
      detail: input.detail,
      entry_id: input.entryId,
      at: input.at,
    }));
    const entry = toLegacyAttentionEntry(result.entry);
    return { entry, created: result.created };
  }

  ensureInboxEntryForFeedItem(
    boardId: string,
    itemId: string,
    reason: Extract<InboxEntryReason, "manual" | "source_rule">,
    detail: Record<string, unknown> = {},
  ): { entry: InboxEntryRecord; created: boolean } {
    const result = this.callAttention(
      () => this.ports.attention.commands.ensureFeedItem(boardId, itemId, reason, detail),
    );
    const entry = toLegacyAttentionEntry(result.entry);
    return { entry, created: result.created };
  }

  addToInbox(boardId: string, itemId: string, expectedRevision?: number): FeedItemRecord {
    const item = this.getFeedItem(boardId, itemId);
    if (expectedRevision != null && expectedRevision !== item.revision) {
      throw new FeedStoreError("feed_revision_conflict", "这条 Item 已经变化，请刷新后重试");
    }
    const stored = this.ensureInboxEntryForFeedItem(boardId, itemId, "manual", { added_by: "web_user" });
    if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
      this.setInboxEntryStatus(boardId, stored.entry.entry_id, "open", stored.entry.revision);
    }
    return item;
  }

  setInboxEntryStatus(
    boardId: string,
    entryId: string,
    status: InboxEntryStatus,
    expectedRevision?: number,
  ): InboxEntryRecord {
    return toLegacyAttentionEntry(this.callAttention(
      () => this.ports.attention.commands.setStatus(
        boardId,
        entryId,
        status as ModuleAttentionStatus,
        expectedRevision,
      ),
    ));
  }

  getSourceRunByOperationId(boardId: string, operationId: string): FeedSourceRunRecord | null {
    const run = this.ports.listener.getRunByOperationId(boardId, operationId);
    return run ? compatibleRun(run) : null;
  }

  upsertSourceRun(run: FeedSourceRunRecord): FeedSourceRunRecord {
    return compatibleRun(this.ports.listener.saveRun({
      project_id: run.board_id,
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

  recoverInterruptedSourceRuns(boardId: string): number {
    return this.ports.listener.recoverInterruptedRuns(boardId);
  }

  ingestItem(input: {
    source: FeedSourceRecord;
    externalId: string;
    signal?: { signal_id: string; revision: number };
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
    material?: Omit<FeedMaterialRecord, "board_id" | "item_id" | "imported_at" | "updated_at">;
  }): { item: FeedItemRecord; created: boolean; updated: boolean } {
    const result = this.callFeed(() => this.ports.feed.commands.ingest({
      project_id: input.source.board_id,
      source_id: input.source.source_id,
      source_kind: input.source.kind,
      source_label: input.source.name,
      external_id: input.externalId,
      signal: input.signal,
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
    const item = toLegacyFeedItem(result.item);
    if (result.created || result.updated) {
      try {
        this.captureAfterIngest(item);
      } catch (error) {
        this.recordArtifactOutFailure(item, [], [errorCode(error)]);
      }
      if (this.ports.judgments) this.pendingFeedJudgments.push(item);
    }
    return { item, created: result.created, updated: result.updated };
  }

  async evaluateItems(boardId: string, itemIds: readonly string[]): Promise<{ evaluated: number }> {
    if (!itemIds.length || itemIds.length > 20) throw new FeedStoreError("feed_invalid_transition", "请选择 1–20 条消息试跑规则");
    const items = [...new Set(itemIds)].map((id) => this.getFeedItem(boardId, id));
    for (const item of items) this.captureAfterIngest(item);
    this.pendingFeedJudgments.push(...items);
    await this.flushPendingJudgments();
    return { evaluated: items.length };
  }

  recordInboxJudgmentEvent(boardId: string, judgment: JudgmentRecord): void {
    if (judgment.subject.kind !== "inbox_entry" || judgment.subject.board_id !== boardId) {
      throw new FeedStoreError("feed_invalid_transition", "判断结果与当前 Inbox 项目不符");
    }
    this.getInboxEntry(boardId, judgment.subject.id);
    this.ports.appendEvent(boardId, "judgment", judgment.judgment_id, "judgment_completed", judgment.outcome,
      { judgment_id: judgment.judgment_id }, judgment.created_at);
  }

  async flushPendingJudgments(): Promise<void> {
    const judgments = this.ports.judgments;
    const offered = this.ports.offered_behavior_ids ?? [];
    const sceneOffered = (sceneId: string, subjects: readonly string[]) =>
      this.ports.offeredBehaviorsForScene?.(sceneId, subjects) ?? offered;
    const feedItems = this.pendingFeedJudgments.splice(0);
    for (const item of feedItems) {
      if (!judgments) continue;
      const rules = (this.ports.outRules?.list(item.board_id) ?? []).filter((rule) =>
        Boolean(rule.function_key) && feedOutRuleMatches(rule, item),
      );
      const input = [item.title, item.summary, item.body ?? ""].filter(Boolean).join("\n");
      const captureOffered = sceneOffered(FEED_CAPTURE_SCENE_ID, ["feed_item"]);
      for (const rule of rules) {
        const judgment = await judgments.judge({
          function_key: rule.function_key!,
          input,
          subject: { kind: "feed_item", id: item.item_id, board_id: item.board_id },
          scene_id: FEED_CAPTURE_SCENE_ID,
          offered_behavior_ids: captureOffered,
        });
        if (rule.admission === "inbox" && (judgment.outcome === "needs_review" || judgment.suggested_behavior_ids.includes("inbox.admit"))) {
          this.ensureInboxEntryForFeedItem(item.board_id, item.item_id, "source_rule", {
            rule_id: rule.rule_id, rule_name: rule.name, judgment_id: judgment.judgment_id,
            function_key: rule.function_key, function_version: judgment.function_version,
            needs_review: judgment.outcome === "needs_review",
          });
        }
        this.ports.appendEvent(
          item.board_id,
          "judgment",
          judgment.judgment_id,
          "judgment_completed",
          judgment.outcome,
          { judgment_id: judgment.judgment_id },
          judgment.created_at,
        );
      }
      await this.judgeScene(judgments, HOME_DOCK_SCENE_ID, item.board_id, {
        kind: "feed_item",
        id: item.item_id,
        board_id: item.board_id,
      }, input, sceneOffered(HOME_DOCK_SCENE_ID, ["feed_item"]));
    }
    const inboxEvents = [...this.pendingInboxJudgments.values()];
    this.pendingInboxJudgments.clear();
    for (const event of inboxEvents) {
      // Module events can occur inside a transaction that is later rolled back.
      let entry: InboxEntryRecord;
      try { entry = this.getInboxEntry(event.board_id, event.entry_id); }
      catch (error) { if (error instanceof FeedStoreError && error.code === "inbox_entry_not_found") continue; throw error; }
      if (entry.status !== "open" && entry.status !== "in_progress") continue;
      await this.ports.inboxJudgment?.(entry);
      if (!judgments) continue;
      const subject = entry.subject_type === "feed_item" ? this.getFeedItem(entry.board_id, entry.subject_id) : null;
      const input = [entry.reason, subject?.title, subject?.summary, subject?.body, JSON.stringify(entry.detail)].filter(Boolean).join("\n");
      await this.judgeScene(judgments, HOME_DOCK_SCENE_ID, entry.board_id, {
        kind: "inbox_entry",
        id: entry.entry_id,
        board_id: entry.board_id,
      }, input, sceneOffered(HOME_DOCK_SCENE_ID, homeDockSubjectsForInbox(entry)));
    }
  }

  listOutRules(boardId: string): FeedOutRuleRecord[] {
    return this.ports.outRules?.list(boardId) ?? [];
  }

  createOutRule(boardId: string, input: FeedOutRuleWrite): FeedOutRuleRecord {
    const rule = this.requireOutRules().create(boardId, input);
    if (!rule.function_key) return rule;
    try {
      this.ports.judgments?.bindScene(FEED_CAPTURE_SCENE_ID, rule.function_key, boardId, rule.rule_id);
      return rule;
    } catch (error) {
      this.requireOutRules().delete(boardId, rule.rule_id);
      throw error;
    }
  }

  updateOutRule(boardId: string, ruleId: string, patch: Partial<FeedOutRuleWrite>): FeedOutRuleRecord {
    if (patch.function_key) {
      this.ports.judgments?.bindScene(FEED_CAPTURE_SCENE_ID, patch.function_key, boardId, ruleId);
    }
    const rule = this.requireOutRules().update(boardId, ruleId, patch);
    if (!rule.function_key) {
      this.ports.judgments?.unbindScene(FEED_CAPTURE_SCENE_ID, boardId, rule.rule_id);
    }
    return rule;
  }

  deleteOutRule(boardId: string, ruleId: string): FeedOutRuleRecord {
    const rule = this.requireOutRules().delete(boardId, ruleId);
    this.ports.judgments?.unbindScene(FEED_CAPTURE_SCENE_ID, boardId, rule.rule_id);
    return rule;
  }

  setDisposition(
    boardId: string,
    itemId: string,
    disposition: FeedItemDisposition,
    expectedRevision?: number,
  ): FeedItemRecord {
    const item = this.callFeed(
      () => this.ports.feed.commands.setDisposition(boardId, itemId, disposition, expectedRevision),
    );
    return toLegacyFeedItem(item);
  }

  restoreToFeed(boardId: string, itemId: string, expectedRevision?: number): FeedItemRecord {
    return toLegacyFeedItem(this.callFeed(
      () => this.ports.feed.commands.restore(boardId, itemId, expectedRevision),
    ));
  }

  markRead(boardId: string, itemId: string): FeedItemRecord {
    return toLegacyFeedItem(this.callFeed(
      () => this.ports.feed.commands.markRead(boardId, itemId, "feed"),
    ));
  }

  linkGoal(
    boardId: string,
    itemId: string,
    goalId: string,
    disposition: "promoted" | "processing",
  ): FeedItemRecord {
    const item = this.callFeed(
      () => this.ports.feed.commands.linkGoal(boardId, itemId, goalId, disposition),
    );
    return toLegacyFeedItem(item);
  }

  private requireOutRules() {
    if (!this.ports.outRules) {
      throw new FeedStoreError("feed_out_rule_not_found", "捕捉规则尚未初始化");
    }
    return this.ports.outRules;
  }

  private captureAfterIngest(item: FeedItemRecord): void {
    const rules = this.ports.outRules?.list(item.board_id) ?? [];
    const matched = rules.filter((rule) => feedOutRuleMatches(rule, item));
    if (matched.length === 0) return;
    for (const rule of matched) {
      if (rule.admission === "inbox" && !rule.function_key) {
        this.ensureInboxEntryForFeedItem(item.board_id, item.item_id, "source_rule", { rule_id: rule.rule_id, rule_name: rule.name });
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

  private async judgeScene(
    judgments: NonNullable<FeedApplicationPorts["judgments"]>,
    sceneId: string,
    boardId: string,
    subject: { kind: "feed_item" | "inbox_entry"; id: string; board_id: string },
    input: string,
    offered: readonly string[],
  ): Promise<void> {
    const binding = judgments.sceneBinding(sceneId, boardId);
    if (!binding) return;
    const judgment = await judgments.judge({
      function_key: binding.function_key,
      input,
      subject,
      scene_id: sceneId,
      offered_behavior_ids: offered,
    });
    this.ports.appendEvent(
      boardId,
      "judgment",
      judgment.judgment_id,
      "judgment_completed",
      judgment.outcome,
      { judgment_id: judgment.judgment_id },
      judgment.created_at,
    );
  }

  private recordArtifactOutFailure(item: FeedItemRecord, ruleIds: string[], errorCodes: string[]): void {
    try {
      const { entry } = this.callAttention(() => this.ports.attention.commands.create({
        project_id: item.board_id,
        subject_type: "feed_item",
        subject_id: item.item_id,
        reason: "artifact_out_failed",
        detail: { rule_ids: ruleIds, error_codes: errorCodes },
      }));
      if (entry.status === "done" || entry.status === "dismissed") {
        this.setInboxEntryStatus(item.board_id, entry.entry_id, "open");
      }
    } catch {
      // ingest already persisted; missing Inbox is worse than throwing into sync
    }
  }

  private completeArtifactOutFailure(item: FeedItemRecord): void {
    try {
      for (const entry of this.ports.attention.query.findForSubject(item.board_id, "feed_item", item.item_id)) {
        if (entry.reason !== "artifact_out_failed") continue;
        if (entry.status === "open" || entry.status === "in_progress") {
          this.setInboxEntryStatus(item.board_id, entry.entry_id, "done");
        }
      }
    } catch {
      // successful artifacts already exist
    }
  }

  private compatibleSource(source: SourceRecord): FeedSourceRecord {
    const checkpoint = this.ports.listener.checkpoint(source.project_id, source.source_id, source.updated_at);
    return {
      board_id: source.project_id,
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

  private callFeed<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof FeedError) {
        throw new FeedStoreError(error.code, error.message);
      }
      throw error;
    }
  }

  private callAttention<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof AttentionError) {
        const code = error.code === "attention_entry_not_found"
          ? "inbox_entry_not_found"
          : error.code === "attention_revision_conflict"
            ? "feed_revision_conflict"
            : "feed_invalid_transition";
        throw new FeedStoreError(code, error.message);
      }
      throw error;
    }
  }

}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && error.code) {
    return error.code;
  }
  return "feed_artifact_register_failed";
}

function homeDockSubjectsForInbox(entry: InboxEntryRecord): string[] {
  if (entry.subject_type === "feed_item") return ["inbox_entry", "feed_item"];
  if (entry.subject_type === "source_fault") return ["inbox_entry", "source"];
  return ["inbox_entry"];
}
