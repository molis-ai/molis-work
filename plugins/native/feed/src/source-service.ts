import { feedErrors } from "./contract/feed.js";
import { sourceDeletedAt } from "./contract/sources.js";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord, FeedSourceSchedule, SourceHistoryDecision } from "./projection.js";
import type { AddFeedAccountSourceInput, FeedSourcePorts, RegisterFeedSourceInput, UpdateFeedSourceInput, ConfigureFeedSourceScheduleInput, FeedSourceSyncResult, FeedSourceSyncInput } from "./source-ports.js";
import { normalizeRegistration } from "./source-request.js";
import { stableId, sha256, bounded, sameHttpsUrl } from "./source-input.js";
import { PublicSourceSync } from "./source-sync.js";
export class FeedSourceService {
  readonly feed: FeedApplication;
  private readonly publicSync: PublicSourceSync;
  constructor(readonly ports: FeedSourcePorts, readonly projectId: string, private readonly now: () => Date = () => new Date()) {
    this.feed = ports.feed;
    this.publicSync = new PublicSourceSync(ports, projectId);
  }
  async sync(sourceId: string, input: FeedSourceSyncInput): Promise<FeedSourceSyncResult> {
    const release = this.ports.acquireSync?.(this.projectId, sourceId);
    try {
      const source = this.activeSource(sourceId);
      if (source.kind === "research_library") {
        if (!this.ports.syncRepository) throw feedErrors.source_invalid_configuration("研究库适配器不可用");
        return await this.ports.syncRepository(source, input);
      }
      return await this.publicSync.sync(source, input);
    } finally { release?.(); }
  }

  register(input: RegisterFeedSourceInput): { source: FeedSourceRecord; registered: boolean } {
    const normalized = normalizeRegistration(input, this.ports.providers);
    const syncKind = "public_source";
    const existing = this.feed.sources.find(
      this.projectId,
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
        throw feedErrors.source_use_catalog("这个地址已在 RSS 目录，请直接添加目录来源");
      }
    }
    const now = new Date().toISOString();
    const source = this.feed.sources.upsert({
      project_id: this.projectId,
      source_id: stableId("feed-source", `${this.projectId}\u0000${normalized.kind}\u0000${normalized.configFingerprint}`),
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
    this.ports.appendEvent(this.projectId, source.source_id, "feed_source.registered", "已注册 Feed 来源；尚未联网读取");
    return { source, registered: true };
  }

  /**
   * Adds an account source: it holds no account. The person binds one to it on the platform (the source is the record of the service's
   * `per_record` slot); until then a pull is refused for want of an account. The same service and name give back the source already there.
   */
  addAccount(input: AddFeedAccountSourceInput): { source: FeedSourceRecord; registered: boolean } {
    const name = bounded(input.name.trim(), 80);
    if (!name) throw feedErrors.source_invalid_configuration("来源名称不能为空");
    const sourceId = stableId("feed-source", `${this.projectId}\u0000account\u0000${input.service}\u0000${name}`);
    const existing = this.feed.snapshot(this.projectId).sources.find(source => source.source_id === sourceId);
    if (existing) return { source: existing, registered: false };
    const now = this.now().toISOString();
    const source = this.feed.sources.upsert({
      project_id: this.projectId, source_id: sourceId, kind: input.service, definition_id: input.service, sync_kind: input.service,
      name, description: "", status: "active", enabled: true, item_count: 0, origin: "molis_work", config: {}, schedule: { mode: "manual" },
      cursor: {}, credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now,
    });
    this.ports.appendEvent(this.projectId, source.source_id, "feed_source.registered", "已添加账号来源；选好账号后才能拉取");
    return { source, registered: true };
  }

  setEnabled(sourceId: string, enabled: boolean): FeedSourceRecord {
    this.activeSource(sourceId);
    const source = this.feed.sources.setEnabled(this.projectId, sourceId, enabled);
    this.ports.appendEvent(
      this.projectId,
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
    if (!name) throw feedErrors.source_invalid_configuration("来源名称不能为空");
    const description = input.description == null
      ? source.description
      : bounded(input.description.trim(), 320);
    let scope = input.scope == null ? source.config.scope : bounded(input.scope.trim(), 500);
    let config = { ...source.config };
    let cursor = source.cursor;
    if (source.sync_kind === "gmail" && input.scope != null) {
      if (!input.scope.trim()) {
        scope = this.ports.providers.gmail.defaultScope;
      } else {
        const supported = this.ports.providers.gmail.parseScope(input.scope);
        if (!supported) {
          throw feedErrors.source_invalid_configuration(
            "Gmail 拉取范围必须选择未读收件箱、全部收件箱、星标邮件或重要邮件",
          );
        }
        scope = supported;
      }
    }
    if (input.feed_url != null) {
      if (source.kind !== "custom_rss") {
        throw feedErrors.source_invalid_configuration(
          "只有自定义 RSS / Atom 可以修改 Feed 地址",
        );
      }
      const feedUrl = this.ports.providers.customRss.normalizeUrl(input.feed_url);
      if (this.ports.providers.listCatalog().some((entry) => sameHttpsUrl(entry.feedUrl, feedUrl))) {
        throw feedErrors.source_use_catalog("这个地址已在 RSS 目录，请直接添加目录来源");
      }
      const fingerprint = sha256(feedUrl);
      const existing = this.feed.sources.find(this.projectId, "public_source", this.ports.providers.customRss.definitionId, fingerprint);
      if (existing && existing.source_id !== source.source_id) {
        throw feedErrors.source_idempotency_conflict("这个自定义 RSS / Atom 已经存在");
      }
      config = { ...config, feed_url: feedUrl, config_fingerprint: fingerprint };
      cursor = {};
    }
    // The account an account source reads with is the person's binding on the platform (`connectors.plugin_slot.bind@2`, the source
    // being the record), never a field of the source: changing it is disconnecting and binding again.
    const updated = this.feed.sources.upsert({
      ...source,
      name,
      description,
      config: { ...config, ...(scope == null ? {} : { scope }) },
      cursor,
      ...(input.feed_url == null ? {} : { status: source.enabled ? "active" : "paused", last_error_code: null }),
      updated_at: now,
    });
    this.ports.appendEvent(this.projectId, updated.source_id, "feed_source.configuration_updated", "来源配置已更新");
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
        throw feedErrors.source_invalid_schedule("拉取间隔必须在 5 分钟到 7 天之间");
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
    const updated = this.feed.sources.upsert({
      ...source,
      schedule,
      updated_at: now.toISOString(),
    });
    this.ports.appendEvent(this.projectId, sourceId, "feed_source.schedule_updated", "来源拉取计划已更新", {
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
    return this.feed.snapshot(this.projectId).sources.filter((source) => {
      const schedule = source.schedule;
      if (!source.enabled || source.status === "paused" || source.status === "disconnected") return false;
      if (schedule.mode !== "interval" || !schedule.enabled || !schedule.next_pull_at) return false;
      const next = Date.parse(schedule.next_pull_at);
      return Number.isFinite(next) && next <= timestamp;
    });
  }

  advanceSchedule(sourceId: string, plannedAt: string, attemptedAt: Date = this.now()): FeedSourceRecord | null {
    const source = this.feed.sources.get(this.projectId, sourceId);
    if (sourceDeletedAt(source) || source.schedule.mode !== "interval") return null;
    if (source.schedule.next_pull_at !== plannedAt) return source;
    const intervalMs = source.schedule.interval_minutes * 60_000;
    let next = Date.parse(plannedAt);
    if (!Number.isFinite(next)) next = attemptedAt.getTime();
    do next += intervalMs;
    while (next <= attemptedAt.getTime());
    return this.feed.sources.upsert({
      ...source,
      schedule: { ...source.schedule, next_pull_at: new Date(next).toISOString() },
      updated_at: attemptedAt.toISOString(),
    });
  }

  disconnect(sourceId: string): FeedSourceRecord {
    const source = this.activeSource(sourceId);
    const now = this.now().toISOString();
    const disconnected = this.feed.sources.upsert({
      ...source,
      status: "disconnected",
      enabled: false,
      schedule: { mode: "manual" },
      cursor: {},
      credential_ref: null,
      last_error_code: null,
      updated_at: now,
    });
    this.ports.appendEvent(this.projectId, sourceId, "feed_source.disconnected", "来源已断开并停止拉取");
    return disconnected;
  }

  delete(sourceId: string, historyDecision: SourceHistoryDecision): FeedSourceRecord {
    this.activeSource(sourceId);
    return this.feed.sources.retire(this.projectId, sourceId, historyDecision);
  }

  private activeSource(sourceId: string): FeedSourceRecord {
    const source = this.feed.sources.get(this.projectId, sourceId);
    if (sourceDeletedAt(source)) throw feedErrors.source_not_found("找不到这个来源");
    return source;
  }

}
