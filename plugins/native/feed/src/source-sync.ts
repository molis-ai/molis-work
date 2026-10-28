import { fingerprintSearchIntentExactV1 } from "@adeptify/intelligence-client";
import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord, FeedSourceRunRecord } from "./projection.js";
import type { FeedSourcePorts, FeedSourceSyncResult, FeedSourceSyncInput, PublicFeedRuntime, IntelligenceCollectResult } from "./source-ports.js";
import { createFeedSourceSyncGuard } from "./source-sync-guard.js";
import { buildExactRequest } from "./source-request.js";
import { normalizeIdempotencyKey, stableId } from "./source-input.js";
import { receiptContentRefs, withReceiptContentRefs } from "./source-history.js";
import { resolveSourceFaults, safeErrorCode, interruptedMessage, rssFailureAction, sourceDedupeScope, cursorForMaterials, safeRssReceipt, terminalErrorCode } from "./source-sync-result.js";
export class PublicSourceSync {
  private readonly feed: FeedApplication;
  constructor(private readonly ports: FeedSourcePorts, private readonly projectId: string) { this.feed = ports.feed; }
  async sync(
    source: FeedSourceRecord,
    input: FeedSourceSyncInput,
  ): Promise<FeedSourceSyncResult> {
    const sourceId = source.source_id;
    if (source.sync_kind !== "public_source") {
      throw feedErrors.source_wrong_sync_kind("这个来源不是公开 Feed 来源");
    }
    if (!source.enabled || source.status === "paused" || source.status === "disconnected") {
      throw feedErrors.source_paused("来源已暂停，请先恢复");
    }
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const beforeEffect = createFeedSourceSyncGuard(this.feed, source, input);
    // Every write of this pull checks the source again inside its transaction: one changed while the commit waited gets nothing (FI-C-05).
    const write = <T>(operation: () => T): Promise<T> => this.commit(() => { beforeEffect.check(); return operation(); });
    await beforeEffect();
    const operationId = stableId("feed-operation", `${source.source_id}\u0000${idempotencyKey}`);
    const request = buildExactRequest(source, operationId, this.ports.providers);
    const planFingerprint = fingerprintSearchIntentExactV1(request);
    const prior = this.feed.getSourceRunByOperationId(this.projectId, operationId);
    if (prior?.phase === "terminal") {
      const storedFingerprint = prior.receipt?.intent_fingerprint;
      if (storedFingerprint && storedFingerprint !== planFingerprint) {
        throw feedErrors.source_idempotency_conflict("同一幂等键对应的来源配置已经变化");
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
    let running: FeedSourceRunRecord = {
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
    const started = running;
    await write(() => {
      this.feed.upsertSourceRun(started);
      this.ports.appendEvent(this.projectId, sourceId, "feed_source.sync_started", "开始同步 Feed 来源", {
        operation_id: operationId,
      });
    });

    // The run names a body before the Home's ledger is told of it and before it is written, so a pull that is cut off at any point
    // leaves every body it may have written named by a run: retrying it, or deleting the source, finds them.
    const hold = this.ports.holdContent ? async (contentRefs: readonly string[]) => {
      await beforeEffect();
      running = { ...running, receipt: withReceiptContentRefs(running.receipt, contentRefs) };
      const named = running;
      await write(() => { this.feed.upsertSourceRun(named); });
      await this.ports.holdContent!(source, contentRefs);
    } : undefined;
    const runtime = this.ports.createRuntime(source, operationId, hold);
    try {
      const result = await runtime.intelligenceCollect.executeExact(
        request,
        input.signal ? { signal: input.signal } : undefined,
      );
      await beforeEffect();
      return await this.commitPublicResult(source, running, result, runtime, write);
    } catch (error) {
      // A pull that has already committed is done, whatever a judgment made of it afterwards: report that failure as it is. The guard below
      // counts the pull's own source write as one person's edit of another (it keeps the revision the source had when the pull started), so it
      // must not be asked once the terminal run is there; the run keeps the record an explicit retry can replay.
      const current = this.feed.getSourceRunByOperationId(this.projectId, operationId);
      if (current?.phase === "terminal") throw error;
      // A pull refused for its source keeps no receipt, as one the platform refused inside the pull does: the same key pulls again, and what
      // was fetched for the source as it was is never replayed into it (FI-C-05). A call that may no longer write leaves the record, which the
      // run still names.
      if (beforeEffect.refused) {
        await runtime.discard?.().catch(() => undefined);
      }
      await beforeEffect();
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
      await write(() => {
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
        // The fault that explains the failure is part of the same write.
        const failedSource = this.feed.getSource(this.projectId, sourceId);
        if (this.ports.providers.rss.isSourceKind(failedSource.kind)) {
          const fault = rssFailureAction(errorCode, this.ports.providers.rss.failureCount(failedSource.cursor));
          if (fault) this.recordRssSourceFault(failedSource, errorCode, fault, updatedAt);
        }
      });
      throw feedErrors.source_sync_interrupted(interruptedMessage(errorCode));
    } finally {
      await runtime.shutdown().catch(() => undefined);
    }
  }

  private async commitPublicResult(
    entrySource: FeedSourceRecord,
    running: FeedSourceRunRecord,
    result: IntelligenceCollectResult,
    runtime: PublicFeedRuntime,
    write: <T>(operation: () => T) => Promise<T>,
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
    await write(() => {
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
            tags: [latest.kind],
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
      // The faults a good pull ends, or the one a failed pull of a feed raises, are part of the same write.
      if (rssSource) {
        if (consumable) resolveSourceFaults(this.feed, this.projectId, entrySource.source_id);
        else if (actionableRssFailure && terminal.error_code) this.recordRssSourceFault(durableSource, terminal.error_code, actionableRssFailure, completedAt);
      }
    });
    await this.feed.flushPendingJudgments();
    return { source: durableSource, run: terminal, created, deduped, replayed: false };
  }

  /** A write after the sync has awaited: the Runtime's commit when the Feed has one, otherwise the transaction it always used. */
  private async commit<T>(operation: () => T): Promise<T> {
    return this.ports.commit ? await this.ports.commit(operation) : this.ports.transaction(operation);
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
}
