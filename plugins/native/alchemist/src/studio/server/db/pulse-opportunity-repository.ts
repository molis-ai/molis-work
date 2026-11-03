import type { Opportunity } from "../../domain/discovery/pulse.js";
import { transitionOpportunity } from "../../domain/discovery/pulse.js";
import type { SqliteDatabase } from "./open-database.js";

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

/** The opportunities a report found, and the person's decisions on them: `opportunities`, `opportunity_signals`. */
export class SqlitePulseOpportunityRepository {
  constructor(private readonly database: SqliteDatabase) {}

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

  private requireOpportunity(id: string): Opportunity {
    const opportunity = this.getOpportunity(id);
    if (!opportunity) throw new Error("alchemist.opportunity_not_found");
    return opportunity;
  }
}
