import type {
  PulseSourceId,
  SourceCollectionResult,
  SourceSetting,
  SupplySignal,
} from "../../domain/discovery/source.js";
import type { SqliteDatabase } from "./open-database.js";

interface SourceSettingRow {
  source_id: PulseSourceId;
  label: string;
  enabled: number;
  homepage_url: string;
  capability: string;
  limitation: string;
  updated_at: string;
}

interface SourceFetchRow {
  id: string;
  run_id: string;
  source_id: PulseSourceId;
  request_url: string;
  status: SourceCollectionResult["status"];
  http_status: number | null;
  fetched_at: string;
  content_hash: string | null;
  error_code: string | null;
  rate_limit_remaining: number | null;
  rate_limit_reset: string | null;
}

interface SignalRow {
  id: string;
  source_id: PulseSourceId;
  title: string;
  url: string;
  summary: string;
  observed_at: string;
  published_at: string | null;
  categories_json: string;
  native_metrics_json: string;
  supports_json: string;
  cannot_prove_json: string;
}

const defaultSourceSettings: ReadonlyArray<Omit<SourceSetting, "updatedAt">> = [
  {
    sourceId: "toolify",
    label: "Toolify Trending",
    enabled: true,
    homepageUrl: "https://www.toolify.ai/Best-trending-AI-Tools",
    capability: "月度 AI 工具供给与估算流量增长",
    limitation: "目录和第三方估算信号，不能证明采用、收入或留存",
  },
  {
    sourceId: "watcha",
    label: "观猹",
    enabled: true,
    homepageUrl: "https://watcha.cn/",
    capability: "中文 AI 产品供给、站内热度与互动",
    limitation: "站内注意力不能证明全市场需求或付费",
  },
  {
    sourceId: "github",
    label: "GitHub",
    enabled: true,
    homepageUrl: "https://github.com/",
    capability: "近期公开仓库、Star、Fork 与更新活动",
    limitation: "开发者注意力不能证明终端采用、收入或留存",
  },
];

/** The sources a pulse reads: their settings, what each run fetched from them, and the signals those fetches carried. */
export class SqlitePulseSourceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  ensureDefaultSourceSettings(now: string): void {
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO source_settings
       (source_id, label, enabled, homepage_url, capability, limitation, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.database.transaction(() => {
      for (const setting of defaultSourceSettings) {
        insert.run(
          setting.sourceId,
          setting.label,
          setting.enabled ? 1 : 0,
          setting.homepageUrl,
          setting.capability,
          setting.limitation,
          now,
        );
      }
    })();
  }

  listSourceSettings(): SourceSetting[] {
    const rows = this.database.prepare(`SELECT * FROM source_settings
      ORDER BY CASE source_id WHEN 'toolify' THEN 1 WHEN 'watcha' THEN 2 ELSE 3 END`).all() as SourceSettingRow[];
    const settings = rows.map(mapSourceSetting);
    return settings.length ? settings : defaultSourceSettings.map(setting => ({ ...setting, updatedAt: "1970-01-01T00:00:00.000Z" }));
  }

  updateSourceSetting(sourceId: PulseSourceId, enabled: boolean, now: string): SourceSetting {
    const result = this.database
      .prepare("UPDATE source_settings SET enabled = ?, updated_at = ? WHERE source_id = ?")
      .run(enabled ? 1 : 0, now, sourceId);
    if (result.changes !== 1) throw new Error("alchemist.pulse_source_not_found");
    return this.requireSourceSetting(sourceId);
  }

  saveSourceCollection(runId: string, fetchId: string, result: SourceCollectionResult): void {
    this.database.transaction(() => {
      const existing = this.database
        .prepare("SELECT id FROM source_fetches WHERE run_id = ? AND source_id = ?")
        .get(runId, result.sourceId) as { id: string } | undefined;
      if (existing) return;
      this.database
        .prepare(
          `INSERT INTO source_fetches
           (id, run_id, source_id, request_url, status, http_status, fetched_at, content_hash,
            error_code, rate_limit_remaining, rate_limit_reset)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          fetchId,
          runId,
          result.sourceId,
          result.requestUrl,
          result.status,
          result.httpStatus ?? null,
          result.fetchedAt,
          result.contentHash ?? null,
          result.status === "error" ? result.errorCode : null,
          result.rateLimitRemaining ?? null,
          result.rateLimitReset ?? null,
        );
      const insertSignal = this.database.prepare(
        `INSERT INTO supply_signals
         (id, fetch_id, source_id, title, url, summary, observed_at, published_at,
          categories_json, native_metrics_json, supports_json, cannot_prove_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const signal of result.signals) {
        const signalSnapshotId = this.resolveSignalSnapshotId(fetchId, signal.id);
        insertSignal.run(
          signalSnapshotId,
          fetchId,
          signal.sourceId,
          signal.title,
          signal.url,
          signal.summary,
          signal.observedAt,
          signal.publishedAt ?? null,
          JSON.stringify(signal.categories),
          JSON.stringify(signal.nativeMetrics),
          JSON.stringify(signal.supports),
          JSON.stringify(signal.cannotProve),
        );
      }
    })();
  }

  listSourceCollections(runId: string): Array<SourceCollectionResult & { fetchId: string }> {
    const fetches = this.database
      .prepare("SELECT * FROM source_fetches WHERE run_id = ? ORDER BY fetched_at, source_id")
      .all(runId) as SourceFetchRow[];
    return fetches.map((fetch) => {
      const signals = (
        this.database
          .prepare("SELECT * FROM supply_signals WHERE fetch_id = ? ORDER BY id")
          .all(fetch.id) as SignalRow[]
      ).map(mapSignal);
      const base = {
        fetchId: fetch.id,
        sourceId: fetch.source_id,
        requestUrl: fetch.request_url,
        fetchedAt: fetch.fetched_at,
        signals,
        ...(fetch.http_status !== null ? { httpStatus: fetch.http_status } : {}),
        ...(fetch.content_hash ? { contentHash: fetch.content_hash } : {}),
        ...(fetch.rate_limit_remaining !== null ? { rateLimitRemaining: fetch.rate_limit_remaining } : {}),
        ...(fetch.rate_limit_reset ? { rateLimitReset: fetch.rate_limit_reset } : {}),
      };
      return fetch.status === "completed"
        ? { ...base, status: "completed" as const }
        : { ...base, status: "error" as const, errorCode: fetch.error_code ?? "alchemist.source_failed" };
    });
  }

  listSignals(runId: string): SupplySignal[] {
    return (
      this.database
        .prepare(
          `SELECT s.* FROM supply_signals s
           JOIN source_fetches f ON f.id = s.fetch_id
           WHERE f.run_id = ? ORDER BY s.observed_at DESC, s.id`,
        )
        .all(runId) as SignalRow[]
    ).map(mapSignal);
  }

  private resolveSignalSnapshotId(fetchId: string, sourceSignalId: string): string {
    const existing = this.database
      .prepare("SELECT fetch_id FROM supply_signals WHERE id = ?")
      .get(sourceSignalId) as { fetch_id: string } | undefined;
    if (!existing || existing.fetch_id === fetchId) return sourceSignalId;

    const snapshotId = `${fetchId}:${sourceSignalId}`;
    const collision = this.database.prepare("SELECT 1 FROM supply_signals WHERE id = ?").get(snapshotId) as
      | { 1: number }
      | undefined;
    if (collision) throw new Error("alchemist.pulse_signal_snapshot_id_conflict");
    return snapshotId;
  }

  private requireSourceSetting(sourceId: PulseSourceId): SourceSetting {
    const row = this.database.prepare("SELECT * FROM source_settings WHERE source_id = ?").get(sourceId) as
      | SourceSettingRow
      | undefined;
    if (!row) throw new Error("alchemist.pulse_source_not_found");
    return mapSourceSetting(row);
  }
}

function mapSourceSetting(row: SourceSettingRow): SourceSetting {
  return {
    sourceId: row.source_id,
    label: row.label,
    enabled: row.enabled === 1,
    homepageUrl: row.homepage_url,
    capability: row.capability,
    limitation: row.limitation,
    updatedAt: row.updated_at,
  };
}

function mapSignal(row: SignalRow): SupplySignal {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    summary: row.summary,
    observedAt: row.observed_at,
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
    categories: JSON.parse(row.categories_json) as string[],
    nativeMetrics: JSON.parse(row.native_metrics_json) as SupplySignal["nativeMetrics"],
    supports: JSON.parse(row.supports_json) as string[],
    cannotProve: JSON.parse(row.cannot_prove_json) as string[],
  };
}
