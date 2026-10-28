import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listenerErrors } from "@molis-ai/molis-work-contracts/services/listener-host";
import { isAccountConnectorSyncKind } from "@molis-ai/molis-work-contracts/modules/sources";
import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import { type ListenerRunReceipt } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { IntegrationAccountPresentation } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedSourceSyncResult, FeedSourceSyncInput } from "./source-ports.js";
import { createFeedSourceSyncGuard } from "./source-sync-guard.js";
import type { FeedConnectorSyncPorts, FeedConnectorListener, ConnectorSyncMode } from "./connector-sync-ports.js";
import { normalizeIdempotencyKey, stableId } from "./source-input.js";
import { toFeedPublicError } from "./application-errors.js";
import { resolveSourceFaults, safeErrorCode } from "./source-sync-result.js";

type AfterAccepted = Parameters<FeedConnectorSyncPorts["createListener"]>[1];

export class FeedConnectorSync {
  private readonly feed: FeedApplication;
  constructor(private readonly ports: FeedConnectorSyncPorts, private readonly projectId: string) {
    this.feed = ports.feed;
  }
  async sync(
    sourceId: string,
    input: FeedSourceSyncInput & { mode?: ConnectorSyncMode },
  ): Promise<FeedSourceSyncResult> {
    const release = this.ports.acquireSync?.(this.projectId, sourceId);
    try { return await this.run(sourceId, input); } finally { release?.(); }
  }
  private async run(sourceId: string, input: FeedSourceSyncInput & { mode?: ConnectorSyncMode }): Promise<FeedSourceSyncResult> {
    const source = this.feed.sources.get(this.projectId, sourceId);
    assertConnectorPullable(source);
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const connectionAuthority = this.ports.connectionAuthority?.(source);
    const beforeEffect = createFeedSourceSyncGuard(this.feed, source, { ...input, beforeEffect: async () => {
      await input.beforeEffect?.();
      await connectionAuthority?.();
    } });
    // Every write of this pull checks the source again inside its transaction: one changed while the commit waited gets nothing (FI-C-05).
    const write = <T>(operation: () => T): Promise<T> => this.commit(() => { beforeEffect.check(); return operation(); });
    await beforeEffect();
    const operationId = stableId("connector-operation", `${source.source_id}\u0000${key}\u0000${input.mode ?? "normal"}`);
    const prior = this.feed.sources.runByOperationId(this.projectId, operationId);
    if (prior?.phase === "terminal") {
      return { source: this.feed.sources.get(this.projectId, sourceId), run: prior, created: 0, deduped: 0, replayed: true };
    }
    let listener!: FeedConnectorListener;
    let listenerResult: ListenerRunReceipt;
    try {
      const ingest: AfterAccepted = (item, signal, occurredAt) => {
        // Delivered inside the commit of its signal: the item lands only on the source this pull checked.
        beforeEffect.check();
        const latest = this.feed.sources.get(this.projectId, source.source_id);
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
      };
      // With a commit the listener runs this inside the commit of the signal, which has asked the caller's authority already.
      listener = await this.ports.createListener(source, this.ports.commit ? ingest : async (item, signal, occurredAt) => {
        await beforeEffect();
        ingest(item, signal, occurredAt);
      }, this.ports.commit ? write : undefined);
      await beforeEffect();
      listenerResult = await listener.run(operationId, input.mode ?? "normal", { signal: input.signal, beforeEffect });
      await this.feed.flushPendingJudgments();
    } catch (error) {
      await beforeEffect();
      const updatedAt = new Date().toISOString();
      const errorCode = error instanceof ActionError && error.code.startsWith("listener.")
        && Object.hasOwn(listenerErrors, error.code.slice("listener.".length)) ? error.code : safeErrorCode(error);
      // A source's failure is that source's: it is recorded on the source below and never stops the plugin for the others.
      await write(() => {
        const latest = this.feed.sources.get(this.projectId, sourceId);
        this.feed.sources.upsert({
          ...latest,
          status: latest.enabled ? "error" : "paused",
          last_error_code: errorCode,
          updated_at: updatedAt,
        });
        this.ports.appendEvent(
          this.projectId,
          source.source_id,
          "feed_connector.sync_interrupted",
          `${source.name} 同步未取得终态，可安全重试`,
          { operation_id: operationId, error_code: errorCode },
        );
      });
      throw feedErrors.source_sync_interrupted("连接器同步未取得可信终态，本次没有写成成功；可稍后安全重试。");
    }
    await beforeEffect();
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
      const publicMessage = failure === "needs_auth"
        ? `${source.name} 授权已失效或不可用，请打开任务设置中的“管理账号连接”重新授权。`
        : action ? `${message} — ${action}` : message;
      await write(() => {
        const retrySchedule = failure === "rate_limited"
          && retryAfterAt
          && source.schedule.mode === "interval"
          ? { ...source.schedule, next_pull_at: retryAfterAt }
          : source.schedule;
        this.feed.sources.upsert({
          ...source,
          status: failure === "rate_limited" ? "active" : "error",
          schedule: retrySchedule,
          last_outcome: "failed",
          last_error_code: listenerResult.error_code,
          updated_at: completedAt,
        });
        this.ports.appendEvent(this.projectId, source.source_id, "feed_connector.sync_failed", `${source.name} 同步失败：${message}`, {
          failure,
          ...(action ? { action } : {}),
          ...(retryAfterAt ? { retry_after_at: retryAfterAt } : {}),
        });
        this.recordActionableSourceFault(source, listenerResult.error_code!, publicMessage, completedAt);
      });
      await this.feed.flushPendingJudgments();
      throw feedErrors.connector_failed(publicMessage, { error_code: listenerResult.error_code! });
    }
    const mode = connectorReceipt.mode === "fixture" ? "fixture" : "live";
    const cursor = listener.checkpoint().cursor;
    const durableSource = await write(() => {
      const latest = this.feed.sources.get(this.projectId, source.source_id);
      const durable = this.feed.sources.upsert({
        ...latest,
        status: mode === "live" ? "active" : "error",
        cursor,
        ...(this.ports.sourceMetadata ? this.ports.sourceMetadata(latest, cursor) : accountFields(latest, listener.account?.(cursor) ?? null)),
        last_sync_at: completedAt,
        last_outcome: "completed",
        last_error_code: mode === "live" ? null : "feed.fixture_not_live",
        updated_at: completedAt,
      });
      this.ports.appendEvent(this.projectId, source.source_id, "feed_connector.sync_completed", `${source.name} 同步完成：新增 ${listenerResult.created_count}，去重 ${listenerResult.deduped_count}`, {
        created: listenerResult.created_count,
        deduped: listenerResult.deduped_count,
      });
      if (mode === "live") resolveSourceFaults(this.feed, this.projectId, source.source_id);
      return durable;
    });
    return {
      source: durableSource,
      run: this.feed.sources.runByOperationId(this.projectId, operationId)!,
      created: listenerResult.created_count,
      deduped: listenerResult.deduped_count,
      replayed: listenerResult.replayed,
    };
  }

  /** A write after the sync has awaited: the Runtime's commit when the Feed has one, otherwise the transaction it always used. */
  private async commit<T>(operation: () => T): Promise<T> {
    return this.ports.commit ? await this.ports.commit(operation) : this.ports.transaction(operation);
  }

  private recordActionableSourceFault(
    source: FeedSourceRecord,
    errorCode: string,
    message: string,
    at: string,
  ): void {
    const publicError = toFeedPublicError({ code: errorCode, message });
    if (publicError.retryable || !["auth", "configuration", "stale_cursor"].includes(publicError.category)) return;
    const stored = this.feed.createInboxEntry({
      projectId: this.projectId,
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
      this.feed.setInboxEntryStatus(this.projectId, stored.entry.entry_id, "open", stored.entry.revision);
    }
  }

}

/** Refuses a source a connector pull cannot run on: not an account connector, disconnected, or paused. */
function assertConnectorPullable(source: FeedSourceRecord): void {
  if (!isAccountConnectorSyncKind(source.sync_kind)) {
    throw feedErrors.connector_wrong_sync_kind("这个来源不是账号连接器");
  }
  if (source.status === "disconnected") {
    throw feedErrors.connector_needs_auth("连接已断开，请重新授权后再同步");
  }
  if (!source.enabled || source.status === "paused") {
    throw feedErrors.source_paused("来源已暂停，请先恢复");
  }
}

/** The source's account label and configuration after a pull, from what its integration said; nothing said keeps both. */
function accountFields(source: FeedSourceRecord, presentation: IntegrationAccountPresentation | null): Pick<FeedSourceRecord, "account_label" | "config"> | Record<string, never> {
  if (!presentation) return {};
  const { account_label, ...configuration } = presentation;
  return { account_label, config: { ...source.config, ...configuration } };
}
