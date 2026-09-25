import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import { sourceDeletedAt } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord, FeedSourceSchedule, SourceHistoryDecision } from "./projection.js";
import type { FeedSourcePorts, RegisterFeedSourceInput, UpdateFeedSourceInput, ConfigureFeedSourceScheduleInput, FeedSourceSyncResult } from "./source-ports.js";
import { normalizeRegistration } from "./source-request.js";
import { stableId, sha256, bounded, sameHttpsUrl } from "./source-input.js";
import { PublicSourceSync } from "./source-sync.js";
export class FeedSourceService {
  readonly feed: FeedApplication;
  private readonly publicSync: PublicSourceSync;
  constructor(private readonly ports: FeedSourcePorts, readonly boardId: string, private readonly now: () => Date = () => new Date()) {
    this.feed = ports.feed;
    this.publicSync = new PublicSourceSync(ports, boardId);
  }
  sync(sourceId: string, input: { idempotencyKey: string; signal?: AbortSignal }): Promise<FeedSourceSyncResult> {
    const source = this.activeSource(sourceId);
    if (source.kind === "research_library") {
      if (!this.ports.syncRepository) throw new FeedDomainError("研究库适配器不可用", "feed_source_invalid_configuration");
      return this.ports.syncRepository(source, input);
    }
    return this.publicSync.sync(source, input);
  }
  register(input: RegisterFeedSourceInput): { source: FeedSourceRecord; registered: boolean } {
    const normalized = normalizeRegistration(input, this.ports.providers);
    const syncKind = "public_source";
    const existing = this.feed.findSource(
      this.boardId,
      syncKind,
      normalized.definitionId,
      normalized.configFingerprint,
    );
    if (existing) return { source: existing, registered: false };
    if (normalized.kind === "custom_rss") {
      const catalogHit = this.ports.providers.listCatalog().some(
        (source) => sameHttpsUrl(source.feedUrl, String(normalized.config.feed_url)),
      );
      if (catalogHit) {
        throw new FeedDomainError("这个地址已在 RSS 目录，请直接添加目录来源", "feed_source_use_catalog");
      }
    }
    const now = new Date().toISOString();
    const source = this.feed.upsertSource({
      board_id: this.boardId,
      source_id: stableId("feed-source", `${this.boardId}\u0000${normalized.kind}\u0000${normalized.configFingerprint}`),
      kind: normalized.kind,
      definition_id: normalized.definitionId,
      sync_kind: syncKind,
      name: normalized.name,
      description: normalized.description,
      status: "active",
      enabled: true,
      item_count: 0,
      origin: "molis_work",
      config: { ...normalized.config, config_fingerprint: normalized.configFingerprint },
      schedule: { mode: "manual" },
      cursor: {},
      credential_ref: null,
      account_label: null,
      last_sync_at: null,
      last_outcome: null,
      last_error_code: null,
      imported_at: now,
      updated_at: now,
    });
    this.ports.appendEvent(this.boardId, source.source_id, "feed_source.registered", "已注册 Feed 来源；尚未联网读取");
    return { source, registered: true };
  }

  setEnabled(sourceId: string, enabled: boolean): FeedSourceRecord {
    this.activeSource(sourceId);
    const source = this.feed.setSourceEnabled(this.boardId, sourceId, enabled);
    this.ports.appendEvent(
      this.boardId,
      sourceId,
      enabled ? "feed_source.resumed" : "feed_source.paused",
      enabled ? "已恢复 Feed 来源" : "已暂停 Feed 来源",
    );
    return source;
  }

  update(sourceId: string, input: UpdateFeedSourceInput): FeedSourceRecord {
    const source = this.activeSource(sourceId);
    const now = this.now().toISOString();
    const name = input.name == null ? source.name : bounded(input.name.trim(), 80);
    if (!name) throw new FeedDomainError("来源名称不能为空", "feed_source_invalid_configuration");
    const description = input.description == null
      ? source.description
      : bounded(input.description.trim(), 320);
    let scope = input.scope == null ? source.config.scope : bounded(input.scope.trim(), 500);
    let config = { ...source.config };
    let cursor = source.cursor;
    let credentialRef = source.credential_ref;
    let accountLabel = source.account_label;
    let changedAccount = false;
    if (source.sync_kind === "gmail" && input.scope != null) {
      if (!input.scope.trim()) {
        scope = this.ports.providers.gmail.defaultScope;
      } else {
        const supported = this.ports.providers.gmail.parseScope(input.scope);
        if (!supported) {
          throw new FeedDomainError(
            "Gmail 拉取范围必须选择未读收件箱、全部收件箱、星标邮件或重要邮件",
            "feed_source_invalid_configuration",
          );
        }
        scope = supported;
      }
    }
    if (input.feed_url != null) {
      if (source.kind !== "custom_rss") {
        throw new FeedDomainError(
          "只有自定义 RSS / Atom 可以修改 Feed 地址",
          "feed_source_invalid_configuration",
        );
      }
      const feedUrl = this.ports.providers.customRss.normalizeUrl(input.feed_url);
      if (this.ports.providers.listCatalog().some((entry) => sameHttpsUrl(entry.feedUrl, feedUrl))) {
        throw new FeedDomainError("这个地址已在 RSS 目录，请直接添加目录来源", "feed_source_use_catalog");
      }
      const fingerprint = sha256(feedUrl);
      const existing = this.feed.findSource(this.boardId, "public_source", this.ports.providers.customRss.definitionId, fingerprint);
      if (existing && existing.source_id !== source.source_id) {
        throw new FeedDomainError("这个自定义 RSS / Atom 已经存在", "feed_source_idempotency_conflict");
      }
      config = { ...config, feed_url: feedUrl, config_fingerprint: fingerprint };
      cursor = {};
    }
    if (input.connection_id != null) {
      if (!(["github", "gmail", "connector"] as string[]).includes(source.sync_kind)) {
        throw new FeedDomainError("这个来源不使用账号连接", "feed_source_invalid_configuration");
      }
      const connectionId = input.connection_id.trim();
      if (!connectionId || !this.ports.resolveConnection) {
        throw new FeedDomainError("请选择可用的账号连接", "feed_source_invalid_configuration");
      }
      const connection = this.ports.resolveConnection(source.kind, connectionId);
      changedAccount = typeof source.config.connection_id === "string"
        ? source.config.connection_id !== connectionId
        : source.credential_ref !== connection.credentialRef;
      credentialRef = connection.credentialRef;
      accountLabel = connection.accountLabel;
      config.connection_id = connectionId;
      if (source.sync_kind === "gmail") config.token_refs = connection.tokenRefs;
      if (source.sync_kind === "connector") config.refresh_ref = connection.refreshRef;
      if (changedAccount) cursor = {};
    }
    const save = () => this.feed.upsertSource({
      ...source,
      name,
      description,
      config: { ...config, ...(scope == null ? {} : { scope }) },
      cursor,
      credential_ref: credentialRef,
      account_label: accountLabel,
      ...(!changedAccount && input.feed_url == null ? {} : {
        status: source.enabled ? "active" : "paused", last_error_code: null,
        ...(changedAccount ? { last_sync_at: null, last_outcome: null } : {}),
      }),
      updated_at: now,
    });
    const updated = changedAccount && input.connection_id
      ? this.ports.transaction(() => {
        // Listener checkpoints and Signal dedupe keys are keyed by source_id.
        // A new account needs a new source rather than just an empty cursor.
        const nextId = stableId("feed-source", `${this.boardId}\u0000connector\u0000${source.kind}\u0000${input.connection_id}`);
        const prior = this.feed.snapshot(this.boardId).sources.find((candidate) => candidate.source_id === nextId);
        if (prior && sourceDeletedAt(prior)) {
          throw new FeedDomainError("这条账号来源已移除，请先恢复或另建来源", "feed_source_invalid_configuration");
        }
        const next = this.feed.upsertSource({
          ...(prior ?? source),
          source_id: nextId,
          name: input.name == null && !prior && accountLabel ? `${source.kind} · ${accountLabel}` : name,
          description,
          config: { ...config, ...(scope == null ? {} : { scope }) },
          credential_ref: credentialRef,
          account_label: accountLabel,
          cursor: prior?.cursor ?? {},
          schedule: prior?.schedule ?? source.schedule,
          status: prior ? prior.status : source.enabled ? "active" : "paused",
          enabled: prior?.enabled ?? source.enabled,
          item_count: prior?.item_count ?? 0,
          last_sync_at: prior?.last_sync_at ?? null,
          last_outcome: prior?.last_outcome ?? null,
          last_error_code: prior?.last_error_code ?? null,
          imported_at: prior?.imported_at ?? now,
          updated_at: now,
        });
        if (!prior) {
          for (const rule of this.feed.listOutRules(this.boardId)) {
            if (rule.match.source_id !== sourceId) continue;
            this.feed.createOutRule(this.boardId, {
              name: rule.name,
              match: { ...rule.match, source_id: nextId },
              enabled: rule.enabled,
              function_key: rule.function_key,
              admission: rule.admission,
            });
          }
        }
        this.feed.upsertSource({ ...source, enabled: false, status: "paused", updated_at: now });
        return next;
      })
      : save();
    this.ports.appendEvent(this.boardId, updated.source_id, "feed_source.configuration_updated", changedAccount ? "来源已切换到另一账号连接" : "来源配置已更新");
    return updated;
  }

  configureSchedule(
    sourceId: string,
    input: ConfigureFeedSourceScheduleInput,
  ): FeedSourceRecord {
    const source = this.activeSource(sourceId);
    const now = this.now();
    let schedule: FeedSourceSchedule;
    if (input.mode === "manual") {
      schedule = { mode: "manual" };
    } else {
      if (!Number.isInteger(input.interval_minutes) || input.interval_minutes < 5 || input.interval_minutes > 10_080) {
        throw new FeedDomainError("拉取间隔必须在 5 分钟到 7 天之间", "feed_source_invalid_schedule");
      }
      schedule = {
        mode: "interval",
        enabled: input.enabled,
        interval_minutes: input.interval_minutes,
        next_pull_at: input.enabled
          ? new Date(now.getTime() + input.interval_minutes * 60_000).toISOString()
          : null,
      };
    }
    const updated = this.feed.upsertSource({
      ...source,
      schedule,
      updated_at: now.toISOString(),
    });
    this.ports.appendEvent(this.boardId, sourceId, "feed_source.schedule_updated", "来源拉取计划已更新", {
      mode: schedule.mode,
      ...(schedule.mode === "interval" ? {
        enabled: schedule.enabled,
        interval_minutes: schedule.interval_minutes,
        next_pull_at: schedule.next_pull_at,
      } : {}),
    });
    return updated;
  }

  dueSources(at: Date = this.now()): FeedSourceRecord[] {
    const timestamp = at.getTime();
    return this.feed.snapshot(this.boardId).sources.filter((source) => {
      const schedule = source.schedule;
      if (!source.enabled || source.status === "paused" || source.status === "disconnected") return false;
      if (schedule.mode !== "interval" || !schedule.enabled || !schedule.next_pull_at) return false;
      const next = Date.parse(schedule.next_pull_at);
      return Number.isFinite(next) && next <= timestamp;
    });
  }

  advanceSchedule(sourceId: string, plannedAt: string, attemptedAt: Date = this.now()): FeedSourceRecord | null {
    const source = this.feed.getSource(this.boardId, sourceId);
    if (sourceDeletedAt(source) || source.schedule.mode !== "interval") return null;
    if (source.schedule.next_pull_at !== plannedAt) return source;
    const intervalMs = source.schedule.interval_minutes * 60_000;
    let next = Date.parse(plannedAt);
    if (!Number.isFinite(next)) next = attemptedAt.getTime();
    do next += intervalMs;
    while (next <= attemptedAt.getTime());
    return this.feed.upsertSource({
      ...source,
      schedule: { ...source.schedule, next_pull_at: new Date(next).toISOString() },
      updated_at: attemptedAt.toISOString(),
    });
  }

  disconnect(sourceId: string): FeedSourceRecord {
    const source = this.activeSource(sourceId);
    const now = this.now().toISOString();
    const disconnected = this.feed.upsertSource({
      ...source,
      status: "disconnected",
      enabled: false,
      schedule: { mode: "manual" },
      cursor: {},
      credential_ref: null,
      config: { ...source.config, token_refs: undefined },
      last_error_code: null,
      updated_at: now,
    });
    this.ports.appendEvent(this.boardId, sourceId, "feed_source.disconnected", "来源已断开并停止拉取");
    return disconnected;
  }

  delete(sourceId: string, historyDecision: SourceHistoryDecision): FeedSourceRecord {
    this.activeSource(sourceId);
    return this.feed.retireSource(this.boardId, sourceId, historyDecision);
  }

  private activeSource(sourceId: string): FeedSourceRecord {
    const source = this.feed.getSource(this.boardId, sourceId);
    if (sourceDeletedAt(source)) throw new FeedDomainError("找不到这个来源", "feed_source_not_found");
    return source;
  }

}
