import type { Opportunity, PulseReport } from "../../domain/discovery/pulse.js";
import type { PulseSourceId } from "../../domain/discovery/source.js";
import type { SqliteDatabase } from "./open-database.js";

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

/** The reports a run produced: `pulse_reports`, with the opportunities and signal links written in the same transaction. */
export class SqlitePulseReportRepository {
  constructor(private readonly database: SqliteDatabase) {}

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
