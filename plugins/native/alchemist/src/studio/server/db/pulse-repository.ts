import type { Opportunity, PulseReport, PulseRun } from "../../domain/discovery/pulse.js";
import { transitionOpportunity } from "../../domain/discovery/pulse.js";
import type {
  PulseSourceId,
  SourceCollectionResult,
  SourceSetting,
  SupplySignal,
} from "../../domain/discovery/source.js";
import type { RunStage, RunStatus } from "../../domain/kernel/run.js";
import type { SqliteDatabase } from "./open-database.js";

interface PulseRunRow {
  id: string;
  workspace_id: string;
  status: RunStatus;
  stage: RunStage;
  source_ids_json: string;
  runtime_label: string;
  job_id: string;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

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

interface PulseReportRow {
  id: string;
  run_id: string;
  revision: number;
  status: PulseReport["status"];
  title: string;
  summary: string;
  period_start: string;
  period_end: string;
  runtime_label: string;
  successful_source_ids_json: string;
  failed_source_ids_json: string;
  coverage_gaps_json: string;
  findings_json: string;
  created_at: string;
}

interface OpportunityRow {
  id: string;
  report_id: string;
  title: string;
  highlight: string;
  rationale: string;
  demand_inference: string;
  counter_signals_json: string;
  unknowns_json: string;
  status: Opportunity["status"];
  saved_at: string | null;
  dismissed_at: string | null;
  converted_at: string | null;
  converted_direction_id: string | null;
  created_at: string;
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

export class SqlitePulseRepository {
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
    return (
      this.database
        .prepare(
          `SELECT * FROM source_settings
           ORDER BY CASE source_id WHEN 'toolify' THEN 1 WHEN 'watcha' THEN 2 ELSE 3 END`,
        )
        .all() as SourceSettingRow[]
    ).map(mapSourceSetting);
  }

  updateSourceSetting(sourceId: PulseSourceId, enabled: boolean, now: string): SourceSetting {
    const result = this.database
      .prepare("UPDATE source_settings SET enabled = ?, updated_at = ? WHERE source_id = ?")
      .run(enabled ? 1 : 0, now, sourceId);
    if (result.changes !== 1) throw new Error("PULSE_SOURCE_NOT_FOUND");
    return this.requireSourceSetting(sourceId);
  }

  createRun(input: Omit<PulseRun, "createdAt" | "updatedAt"> & { now: string }): PulseRun {
    this.database
      .prepare(
        `INSERT INTO pulse_runs
         (id, workspace_id, status, stage, source_ids_json, runtime_label, job_id, error_code,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.workspaceId,
        input.status,
        input.stage,
        JSON.stringify(input.sourceIds),
        input.runtimeLabel,
        input.jobId,
        input.errorCode ?? null,
        input.now,
        input.now,
      );
    return this.requireRun(input.id);
  }

  getRun(id: string): PulseRun | undefined {
    const row = this.database.prepare("SELECT * FROM pulse_runs WHERE id = ?").get(id) as
      | PulseRunRow
      | undefined;
    return row ? mapRun(row) : undefined;
  }

  getLatestRun(): PulseRun | undefined {
    const row = this.database
      .prepare("SELECT * FROM pulse_runs ORDER BY created_at DESC, id DESC LIMIT 1")
      .get() as PulseRunRow | undefined;
    return row ? mapRun(row) : undefined;
  }

  updateRun(
    id: string,
    update: { status?: RunStatus; stage?: RunStage; errorCode?: string; now: string },
  ): PulseRun {
    const current = this.requireRun(id);
    this.database
      .prepare("UPDATE pulse_runs SET status = ?, stage = ?, error_code = ?, updated_at = ? WHERE id = ?")
      .run(
        update.status ?? current.status,
        update.stage ?? current.stage,
        update.errorCode ?? current.errorCode ?? null,
        update.now,
        id,
      );
    return this.requireRun(id);
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
        : { ...base, status: "error" as const, errorCode: fetch.error_code ?? "SOURCE_FAILED" };
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

  saveReport(input: { report: PulseReport; opportunities: readonly Opportunity[] }): PulseReport {
    return this.database.transaction(() => {
      const existing = this.getReport(input.report.id);
      if (existing) return existing;
      const report = input.report;
      this.database
        .prepare(
          `INSERT INTO pulse_reports
           (id, run_id, revision, status, title, summary, period_start, period_end, runtime_label,
            successful_source_ids_json, failed_source_ids_json, coverage_gaps_json, findings_json,
            created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          report.id,
          report.runId,
          report.revision,
          report.status,
          report.title,
          report.summary,
          report.periodStart,
          report.periodEnd,
          report.runtimeLabel,
          JSON.stringify(report.successfulSourceIds),
          JSON.stringify(report.failedSourceIds),
          JSON.stringify(report.coverageGaps),
          JSON.stringify(report.findings),
          report.createdAt,
        );
      const reportSignalIds = new Set(report.findings.flatMap((finding) => finding.sourceSignalIds));
      const linkReport = this.database.prepare(
        "INSERT INTO pulse_report_signals (report_id, signal_id) VALUES (?, ?)",
      );
      for (const signalId of reportSignalIds) linkReport.run(report.id, signalId);
      const insertOpportunity = this.database.prepare(
        `INSERT INTO opportunities
         (id, report_id, position, title, highlight, rationale, demand_inference,
          counter_signals_json, unknowns_json, status, saved_at, dismissed_at, converted_at,
          converted_direction_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const linkOpportunity = this.database.prepare(
        "INSERT INTO opportunity_signals (opportunity_id, signal_id) VALUES (?, ?)",
      );
      for (const [position, opportunity] of input.opportunities.entries()) {
        insertOpportunity.run(
          opportunity.id,
          opportunity.reportId,
          position,
          opportunity.title,
          opportunity.highlight,
          opportunity.rationale,
          opportunity.demandInference,
          JSON.stringify(opportunity.counterSignals),
          JSON.stringify(opportunity.unknowns),
          opportunity.status,
          opportunity.savedAt ?? null,
          opportunity.dismissedAt ?? null,
          opportunity.convertedAt ?? null,
          opportunity.convertedDirectionId ?? null,
          opportunity.createdAt,
        );
        for (const signalId of opportunity.sourceSignalIds) {
          linkOpportunity.run(opportunity.id, signalId);
        }
      }
      return report;
    })();
  }

  getReport(id: string): PulseReport | undefined {
    const row = this.database.prepare("SELECT * FROM pulse_reports WHERE id = ?").get(id) as
      | PulseReportRow
      | undefined;
    return row ? mapReport(row) : undefined;
  }

  listReports(): PulseReport[] {
    return (
      this.database
        .prepare("SELECT * FROM pulse_reports ORDER BY created_at DESC, revision DESC")
        .all() as PulseReportRow[]
    ).map(mapReport);
  }

  listOpportunities(reportId?: string): Opportunity[] {
    const rows = (
      reportId
        ? this.database
            .prepare("SELECT * FROM opportunities WHERE report_id = ? ORDER BY position")
            .all(reportId)
        : this.database.prepare("SELECT * FROM opportunities ORDER BY created_at DESC, position").all()
    ) as OpportunityRow[];
    return rows.map((row) => this.mapOpportunity(row));
  }

  getOpportunity(id: string): Opportunity | undefined {
    const row = this.database.prepare("SELECT * FROM opportunities WHERE id = ?").get(id) as
      | OpportunityRow
      | undefined;
    return row ? this.mapOpportunity(row) : undefined;
  }

  saveOpportunityForLater(id: string, now: string): Opportunity {
    const next = transitionOpportunity(this.requireOpportunity(id), { action: "save_for_later", now });
    return this.persistOpportunity(next);
  }

  convertOpportunity(id: string, directionId: string, now: string): Opportunity {
    const next = transitionOpportunity(this.requireOpportunity(id), {
      action: "convert_to_direction",
      directionId,
      now,
    });
    return this.persistOpportunity(next);
  }

  private mapOpportunity(row: OpportunityRow): Opportunity {
    const signalIds = (
      this.database
        .prepare("SELECT signal_id FROM opportunity_signals WHERE opportunity_id = ? ORDER BY signal_id")
        .all(row.id) as Array<{ signal_id: string }>
    ).map((item) => item.signal_id);
    return {
      id: row.id,
      reportId: row.report_id,
      title: row.title,
      highlight: row.highlight,
      rationale: row.rationale,
      demandInference: row.demand_inference,
      counterSignals: JSON.parse(row.counter_signals_json) as string[],
      unknowns: JSON.parse(row.unknowns_json) as string[],
      sourceSignalIds: signalIds,
      status: row.status,
      ...(row.saved_at ? { savedAt: row.saved_at } : {}),
      ...(row.dismissed_at ? { dismissedAt: row.dismissed_at } : {}),
      ...(row.converted_at ? { convertedAt: row.converted_at } : {}),
      ...(row.converted_direction_id ? { convertedDirectionId: row.converted_direction_id } : {}),
      createdAt: row.created_at,
    };
  }

  private persistOpportunity(opportunity: Opportunity): Opportunity {
    this.database
      .prepare(
        `UPDATE opportunities SET status = ?, saved_at = ?, dismissed_at = ?, converted_at = ?,
         converted_direction_id = ? WHERE id = ?`,
      )
      .run(
        opportunity.status,
        opportunity.savedAt ?? null,
        opportunity.dismissedAt ?? null,
        opportunity.convertedAt ?? null,
        opportunity.convertedDirectionId ?? null,
        opportunity.id,
      );
    return this.requireOpportunity(opportunity.id);
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
    if (collision) throw new Error("PULSE_SIGNAL_SNAPSHOT_ID_CONFLICT");
    return snapshotId;
  }

  private requireSourceSetting(sourceId: PulseSourceId): SourceSetting {
    const row = this.database.prepare("SELECT * FROM source_settings WHERE source_id = ?").get(sourceId) as
      | SourceSettingRow
      | undefined;
    if (!row) throw new Error("PULSE_SOURCE_NOT_FOUND");
    return mapSourceSetting(row);
  }

  private requireRun(id: string): PulseRun {
    const run = this.getRun(id);
    if (!run) throw new Error("PULSE_RUN_NOT_FOUND");
    return run;
  }

  private requireOpportunity(id: string): Opportunity {
    const opportunity = this.getOpportunity(id);
    if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");
    return opportunity;
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

function mapRun(row: PulseRunRow): PulseRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status,
    stage: row.stage,
    sourceIds: JSON.parse(row.source_ids_json) as PulseSourceId[],
    runtimeLabel: row.runtime_label,
    jobId: row.job_id,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    createdAt: row.created_at,
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

function mapReport(row: PulseReportRow): PulseReport {
  return {
    id: row.id,
    runId: row.run_id,
    revision: row.revision,
    status: row.status,
    title: row.title,
    summary: row.summary,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    runtimeLabel: row.runtime_label,
    successfulSourceIds: JSON.parse(row.successful_source_ids_json) as PulseSourceId[],
    failedSourceIds: JSON.parse(row.failed_source_ids_json) as PulseSourceId[],
    coverageGaps: JSON.parse(row.coverage_gaps_json) as string[],
    findings: JSON.parse(row.findings_json) as PulseReport["findings"],
    createdAt: row.created_at,
  };
}
