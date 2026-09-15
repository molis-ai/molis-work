import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import { ListenerHostError, type ListenerRunReceipt } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedSourceSyncResult } from "./source-ports.js";
import type { FeedConnectorSyncPorts, FeedConnectorListener, ConnectorSyncMode } from "./connector-sync-ports.js";
import { normalizeIdempotencyKey, stableId } from "./source-input.js";
import { toFeedPublicError } from "./application-errors.js";

export class FeedConnectorSync {
  private readonly feed: FeedApplication;
  constructor(private readonly ports: FeedConnectorSyncPorts, private readonly boardId: string) {
    this.feed = ports.feed;
  }
  async sync(
    sourceId: string,
    input: { idempotencyKey: string; mode?: ConnectorSyncMode },
  ): Promise<FeedSourceSyncResult> {
    const source = this.feed.getSource(this.boardId, sourceId);
    if (source.sync_kind !== "github" && source.sync_kind !== "gmail") {
      throw new FeedDomainError("这个来源不是账号连接器", "connector_wrong_sync_kind");
    }
    if (source.status === "disconnected") {
      throw new FeedDomainError("连接已断开，请重新授权后再同步", "connector_needs_auth");
    }
    if (!source.enabled || source.status === "paused") {
      throw new FeedDomainError("来源已暂停，请先恢复", "feed_source_paused");
    }
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const operationId = stableId("connector-operation", `${source.source_id}\u0000${key}\u0000${input.mode ?? "normal"}`);
    const prior = this.feed.getSourceRunByOperationId(this.boardId, operationId);
    if (prior?.phase === "terminal") {
      return { source: this.feed.getSource(this.boardId, sourceId), run: prior, created: 0, deduped: 0, replayed: true };
    }
    let listener!: FeedConnectorListener;
    let listenerResult: ListenerRunReceipt;
    try {
      listener = await this.ports.createListener(source, (item, signal, occurredAt) => {
        const latest = this.feed.getSource(this.boardId, source.source_id);
        this.feed.ingestItem({
          source: latest,
          externalId: `${latest.source_id}:${item.externalId}`,
          signal: {
            signal_id: signal.signal_id,
            revision: signal.revision,
          },
          title: item.title,
          summary: item.summary,
          body: item.body,
          url: item.url,
          kind: item.kind,
          priority: item.priority,
          tags: item.tags,
          author: item.author,
          occurredAt: item.occurredAt ?? occurredAt,
          attention: item.attention,
        });
      });
      listenerResult = await listener.run(operationId, input.mode ?? "normal");
    } catch (error) {
      const updatedAt = new Date().toISOString();
      const errorCode = error instanceof ListenerHostError ? error.code : safeConnectorErrorCode(error);
      await this.ports.reportCrash(source.source_id, errorCode);
      const latest = this.feed.getSource(this.boardId, sourceId);
      this.feed.upsertSource({
        ...latest,
        status: latest.enabled ? "error" : "paused",
        last_error_code: errorCode,
        updated_at: updatedAt,
      });
      this.ports.appendEvent(
        this.boardId,
        source.source_id,
        "feed_connector.sync_interrupted",
        `${source.name} 同步未取得终态，可安全重试`,
        { operation_id: operationId, error_code: errorCode },
      );
      throw new FeedDomainError("连接器同步未取得可信终态，本次没有写成成功；可稍后安全重试。", "feed_source_sync_interrupted");
    }
    const completedAt = new Date().toISOString();
    const connectorReceipt = listenerResult.connector_receipt ?? {};
    if (listenerResult.outcome === "failed") {
      const failure = String(connectorReceipt.failure ?? "provider");
      const retryAfterAt = typeof connectorReceipt.retry_after_at === "string"
        ? connectorReceipt.retry_after_at
        : undefined;
      const message = typeof connectorReceipt.message === "string"
        ? connectorReceipt.message
        : "Provider request failed safely";
      const action = typeof connectorReceipt.recovery_action === "string"
        ? connectorReceipt.recovery_action
        : undefined;
      this.ports.transaction(() => {
        const retrySchedule = failure === "rate_limited"
          && retryAfterAt
          && source.schedule.mode === "interval"
          ? { ...source.schedule, next_pull_at: retryAfterAt }
          : source.schedule;
        this.feed.upsertSource({
          ...source,
          status: failure === "rate_limited" ? "active" : "error",
          schedule: retrySchedule,
          last_outcome: "failed",
          last_error_code: listenerResult.error_code,
          updated_at: completedAt,
        });
        this.ports.appendEvent(this.boardId, source.source_id, "feed_connector.sync_failed", `${source.name} 同步失败：${message}`, {
          failure,
          ...(action ? { action } : {}),
          ...(retryAfterAt ? { retry_after_at: retryAfterAt } : {}),
        });
      });
      this.recordActionableSourceFault(source, listenerResult.error_code!, message, completedAt);
      throw new FeedDomainError(
        action ? `${message} — ${action}` : message,
        listenerResult.error_code!,
      );
    }
    const mode = connectorReceipt.mode === "fixture" ? "fixture" : "live";
    const cursor = listener.checkpoint().cursor;
    const latest = this.feed.getSource(this.boardId, source.source_id);
    const durableSource = this.feed.upsertSource({
      ...latest,
      status: mode === "live" ? "active" : "error",
      cursor,
      ...this.ports.sourceMetadata(latest, cursor),
      last_sync_at: completedAt,
      last_outcome: "completed",
      last_error_code: mode === "live" ? null : "fixture_not_live",
      updated_at: completedAt,
    });
    this.ports.appendEvent(this.boardId, source.source_id, "feed_connector.sync_completed", `${source.name} 同步完成：新增 ${listenerResult.created_count}，去重 ${listenerResult.deduped_count}`, {
      created: listenerResult.created_count,
      deduped: listenerResult.deduped_count,
    });
    if (mode === "live") this.resolveSourceFaults(source.source_id);
    return {
      source: durableSource,
      run: this.feed.getSourceRunByOperationId(this.boardId, operationId)!,
      created: listenerResult.created_count,
      deduped: listenerResult.deduped_count,
      replayed: listenerResult.replayed,
    };
  }

  private recordActionableSourceFault(
    source: FeedSourceRecord,
    errorCode: string,
    message: string,
    at: string,
  ): void {
    const publicError = toFeedPublicError(new FeedDomainError(message, errorCode));
    if (publicError.retryable || !["auth", "configuration", "stale_cursor"].includes(publicError.category)) return;
    const stored = this.feed.createInboxEntry({
      boardId: this.boardId,
      subjectType: "source_fault",
      subjectId: source.source_id,
      reason: "source_fault",
      detail: {
        error_code: publicError.code,
        category: publicError.category,
        retryable: publicError.retryable,
        user_action: publicError.user_action,
        detected_at: at,
      },
      at,
    });
    if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
      this.feed.setInboxEntryStatus(this.boardId, stored.entry.entry_id, "open", stored.entry.revision);
    }
  }

  private resolveSourceFaults(sourceId: string): void {
    for (const entry of this.feed.listInboxEntries(this.boardId)) {
      if (
        entry.subject_type === "source_fault"
        && entry.subject_id === sourceId
        && (entry.status === "open" || entry.status === "in_progress")
      ) {
        this.feed.setInboxEntryStatus(this.boardId, entry.entry_id, "done", entry.revision);
      }
    }
  }

}

function safeConnectorErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return typeof code === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(code)
    ? code
    : "provider_interrupted";
}
