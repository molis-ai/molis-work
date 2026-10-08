import { fingerprintSearchIntentExactV1 } from "@adeptify/intelligence-client";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord, FeedSourceRunRecord } from "./projection.js";
import type { FeedSourcePorts, FeedSourceSyncResult, FeedSourceSyncInput, PublicFeedRuntime, IntelligenceCollectResult } from "./source-ports.js";
import { createFeedSourceSyncGuard } from "./source-sync-guard.js";
import { buildExactRequest } from "./source-request.js";
import { normalizeIdempotencyKey, stableId } from "./source-input.js";
import { receiptContentRefs, withReceiptContentRefs } from "./source-history.js";
import { safeErrorCode, interruptedMessage, rssFailureAction, sourceDedupeScope, cursorForMaterials, safeRssReceipt, terminalErrorCode } from "./source-sync-result.js";
export class PublicSourceSync {
  private readonly feed: FeedApplication;
  constructor(private readonly ports: FeedSourcePorts, private readonly projectId: string) { this.feed = ports.feed; }
  async sync(
    source: FeedSourceRecord,
    input: FeedSourceSyncInput,
  ): Promise<FeedSourceSyncResult> {
    const sourceId = source.source_id;
    if (source.sync_kind !== "public_source") {
      throw new FeedDomainError("这个来源不是公开 Feed 来源", "feed_source_wrong_sync_kind");
    }
    if (!source.enabled || source.status === "paused" || source.status === "disconnected") {
      throw new FeedDomainError("来源已暂停，请先恢复", "feed_source_paused");
    }
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const beforeEffect = createFeedSourceSyncGuard(this.feed, source, input);
    await beforeEffect();
    const operationId = stableId("feed-operation", `${source.source_id}\u0000${idempotencyKey}`);
    const request = buildExactRequest(source, operationId, this.ports.providers);
    const planFingerprint = fingerprintSearchIntentExactV1(request);
    const prior = this.feed.getSourceRunByOperationId(this.projectId, operationId);
    if (prior?.phase === "terminal") {
      const storedFingerprint = prior.receipt?.intent_fingerprint;
      if (storedFingerprint && storedFingerprint !== planFingerprint) {
        throw new FeedDomainError("同一幂等键对应的来源配置已经变化", "feed_source_idempotency_conflict");
      }
      return {
        source: this.feed.getSource(this.projectId, sourceId),
        run: prior,
        created: 0,
        deduped: 0,
        replayed: true,
      };
    }

    const startedAt = new Date().toISOString();
    const running: FeedSourceRunRecord = {
      project_id: this.projectId,
      run_id: prior?.run_id ?? stableId("feed-run", operationId),
      operation_id: operationId,
      source_id: source.source_id,
      phase: "running",
      outcome: null,
      empty: false,
      error_code: null,
      receipt: withReceiptContentRefs({ intent_fingerprint: planFingerprint }, receiptContentRefs(prior?.receipt)),
      created_count: 0,
      deduped_count: 0,
      recovery_count: prior ? prior.recovery_count + 1 : 0,
      started_at: startedAt,
      completed_at: null,
      updated_at: startedAt,
    };
    this.feed.upsertSourceRun(running);
    this.ports.appendEvent(this.projectId, sourceId, "feed_source.sync_started", "开始同步 Feed 来源", {
      operation_id: operationId,
    });

    const runtime = this.ports.createRuntime(source);
    try {
      const result = await runtime.intelligenceCollect.executeExact(
        request,
        input.signal ? { signal: input.signal } : undefined,
      );
      await beforeEffect();
      return await this.commitPublicResult(source, running, result, runtime);
    } catch (error) {
      await beforeEffect();
      const current = this.feed.getSourceRunByOperationId(this.projectId, operationId);
      // The pull may have committed before a downstream judgment was cancelled.
      // Preserve the refusal; an explicit retry can replay the durable pull.
      if (current?.phase === "terminal") throw error;
      await input.beforeEffect?.();
      input.signal?.throwIfAborted();
      const updatedAt = new Date().toISOString();
      const errorCode = safeErrorCode(error);
      const interrupted: FeedSourceRunRecord = {
        ...running,
        phase: "interrupted",
        error_code: errorCode,
        // Bodies a pull wrote before it failed stay with its search record; the run names them so a deletion can find them.
        receipt: withReceiptContentRefs(running.receipt, runtime.writtenContentRefs?.() ?? []),
        updated_at: updatedAt,
      };
      this.ports.transaction(() => {
        this.feed.upsertSourceRun(interrupted);
        const latest = this.feed.getSource(this.projectId, sourceId);
        const rssFailure = this.ports.providers.rss.isSourceKind(latest.kind)
          ? this.ports.providers.rss.withFailure(latest.cursor)
          : null;
        const actionable = rssFailure
          ? rssFailureAction(errorCode, rssFailure.failures)
          : null;
        this.feed.upsertSource({
          ...latest,
          status: latest.enabled ? (actionable ? "error" : rssFailure ? "active" : "error") : "paused",
          cursor: rssFailure?.cursor ?? latest.cursor,
          last_error_code: errorCode,
          updated_at: updatedAt,
        });
        this.ports.appendEvent(this.projectId, sourceId, "feed_source.sync_interrupted", "来源同步未取得终态，可安全重试", {
          operation_id: operationId,
          error_code: errorCode,
        });
      });
      const failedSource = this.feed.getSource(this.projectId, sourceId);
      if (this.ports.providers.rss.isSourceKind(failedSource.kind)) {
        const failures = this.ports.providers.rss.failureCount(failedSource.cursor);
        const actionable = rssFailureAction(errorCode, failures);
        if (actionable) this.recordRssSourceFault(failedSource, errorCode, actionable, updatedAt);
      }
      throw new FeedDomainError(interruptedMessage(errorCode), "feed_source_sync_interrupted");
    } finally {
      await runtime.shutdown().catch(() => undefined);
    }
  }

  private async commitPublicResult(
    entrySource: FeedSourceRecord,
    running: FeedSourceRunRecord,
    result: IntelligenceCollectResult,
    runtime: PublicFeedRuntime,
  ): Promise<FeedSourceSyncResult> {
    const completedAt = new Date().toISOString();
    const consumable = result.outcome === "completed" || (result.outcome === "partial" && result.requirementMet);
    const rssSource = this.ports.providers.rss.isSourceKind(entrySource.kind);
    const rssReceipt = rssSource ? runtime.publicFeedReceipt?.() ?? null : null;
    let created = 0;
    let deduped = 0;
    let durableSource = entrySource;
    let terminal!: FeedSourceRunRecord;
    let actionableRssFailure: ReturnType<typeof rssFailureAction> = null;
    this.ports.transaction(() => {
      const latest = this.feed.getSource(this.projectId, entrySource.source_id);
      if (consumable) {
        for (const material of result.materials) {
          const externalId = `${latest.kind}:${sourceDedupeScope(latest)}:${material.candidateId}`;
          const ingested = this.feed.ingestItem({
            source: latest,
            externalId,
            title: material.title,
            summary: material.preview.replace(/\s+/gu, " ").trim().slice(0, 320),
            body: material.preview.slice(0, 1_600),
            url: material.canonicalUrl,
            kind: "update",
            priority: "medium",
            tags: [latest.kind, `feed-source:${latest.source_id}`],
            author: material.sourceName,
            occurredAt: material.capturedAt,
            material: {
              material_id: material.id,
              canonical_url: material.canonicalUrl,
              title: material.title,
              source_name: material.sourceName,
              published_at: material.publishedAt ?? null,
              preview: material.preview,
              content_hash: material.contentHash,
              content_ref: material.contentRef,
              content_available: runtime.content.has(material.contentRef),
              content_type: material.contentType,
              character_count: material.characterCount,
              captured_at: material.capturedAt,
              provenance: structuredClone(material.provenance) as unknown as Record<string, unknown>,
              selected_for_context: false,
            },
          });
          if (ingested.created) created += 1;
          else deduped += 1;
        }
      }
      const errorCode = terminalErrorCode(result);
      const cursorWithMaterials = consumable
        ? cursorForMaterials(latest.cursor, result.materials)
        : latest.cursor;
      const rssCursor = rssSource
        ? consumable
          ? { cursor: this.ports.providers.rss.withSuccess(cursorWithMaterials, rssReceipt, completedAt), failures: 0 }
          : this.ports.providers.rss.withFailure(cursorWithMaterials)
        : { cursor: cursorWithMaterials, failures: 0 };
      actionableRssFailure = rssSource && !consumable && errorCode
        ? rssFailureAction(errorCode, rssCursor.failures)
        : null;
      terminal = {
        ...running,
        phase: "terminal",
        outcome: result.outcome,
        empty: result.materials.length === 0,
        error_code: errorCode,
        receipt: withReceiptContentRefs({
          schema: "molis-work-feed-collection-receipt-v1",
          intent_fingerprint: result.intentFingerprint,
          requirement_met: result.requirementMet,
          receipts: structuredClone(result.receipts),
          budget: structuredClone(result.budget),
          warnings: [...result.warnings],
          ...(rssReceipt ? { rss_http: safeRssReceipt(rssReceipt) } : {}),
        }, [
          // The search record of this pull holds every material's body, whether or not an Item was kept for it.
          ...receiptContentRefs(running.receipt),
          ...result.materials.map((material) => material.contentRef),
          ...(runtime.writtenContentRefs?.() ?? []),
        ]),
        created_count: created,
        deduped_count: deduped,
        completed_at: completedAt,
        updated_at: completedAt,
      };
      durableSource = this.feed.upsertSource({
        ...latest,
        status: latest.enabled
          ? (actionableRssFailure
              ? "error"
              : rssSource && !consumable
                ? "active"
                : result.outcome === "failed" || result.outcome === "reconciliation_required"
                  ? "error"
                  : "active")
          : "paused",
        item_count: latest.item_count + created,
        cursor: rssCursor.cursor,
        last_sync_at: consumable ? completedAt : latest.last_sync_at,
        last_outcome: result.outcome,
        last_error_code: errorCode,
        updated_at: completedAt,
      });
      this.feed.upsertSourceRun(terminal);
      this.ports.appendEvent(this.projectId, latest.source_id, "feed_source.sync_completed", `来源同步${result.outcome}：新增 ${created}，去重 ${deduped}`, {
        operation_id: running.operation_id,
        outcome: result.outcome,
        created,
        deduped,
      });
    });
    if (rssSource) {
      if (consumable) this.resolveRssSourceFaults(entrySource.source_id);
      else if (actionableRssFailure && terminal.error_code) {
        this.recordRssSourceFault(durableSource, terminal.error_code, actionableRssFailure, completedAt);
      }
    }
    await this.feed.flushPendingJudgments();
    return { source: durableSource, run: terminal, created, deduped, replayed: false };
  }

  private recordRssSourceFault(
    source: FeedSourceRecord,
    errorCode: string,
    action: { category: "configuration" | "provider"; retryable: boolean; user_action: "fix_configuration" | "retry" },
    at: string,
  ): void {
    const stored = this.feed.createInboxEntry({
      projectId: this.projectId,
      subjectType: "source_fault",
      subjectId: source.source_id,
      reason: "source_fault",
      detail: {
        error_code: errorCode,
        category: action.category,
        retryable: action.retryable,
        user_action: action.user_action,
        detected_at: at,
      },
      at,
    });
    if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
      this.feed.setInboxEntryStatus(this.projectId, stored.entry.entry_id, "open", stored.entry.revision);
    }
  }

  private resolveRssSourceFaults(sourceId: string): void {
    for (const entry of this.feed.listInboxEntries(this.projectId)) {
      if (
        entry.subject_type === "source_fault"
        && entry.subject_id === sourceId
        && (entry.status === "open" || entry.status === "in_progress")
      ) {
        this.feed.setInboxEntryStatus(this.projectId, entry.entry_id, "done", entry.revision);
      }
    }
  }
}
