import type { Decision } from "../../domain/decision/decision.js";
import type { SqliteDatabase } from "./open-database.js";

interface DecisionRow {
  id: string;
  idea_id: string;
  idea_version: number;
  mvp_scope_version: number;
  outcome: Decision["outcome"];
  reason: string;
  revisit_condition: string;
  source_kind: Decision["sourceKind"];
  market_report_id: string;
  market_report_revision: number;
  cost_report_id: string;
  cost_report_revision: number;
  actor_id: string;
  created_at: string;
}

export class SqliteDecisionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(decision: Decision): Decision {
    return this.database.transaction(() => {
      const market = decision.reportBindings.find((binding) => binding.lens === "market_space");
      const cost = decision.reportBindings.find((binding) => binding.lens === "build_cost");
      if (!market || !cost) throw new Error("DECISION_REPORT_BINDINGS_INVALID");
      this.database
        .prepare(
          `INSERT INTO decisions
           (id, idea_id, idea_version, mvp_scope_version, outcome, reason,
            market_report_id, market_report_revision, cost_report_id, cost_report_revision,
            actor_id, created_at, revisit_condition, source_kind)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          decision.id,
          decision.ideaId,
          decision.ideaVersion,
          decision.mvpScopeVersion,
          decision.outcome,
          decision.reason,
          market.reportId,
          market.revision,
          cost.reportId,
          cost.revision,
          decision.actorId,
          decision.createdAt,
          decision.revisitCondition,
          decision.sourceKind,
        );
      const update = this.database
        .prepare("UPDATE ideas SET lifecycle = ?, updated_at = ? WHERE id = ?")
        .run(decision.outcome, decision.createdAt, decision.ideaId);
      if (update.changes !== 1) throw new Error("IDEA_NOT_FOUND");
      const workspace = this.database
        .prepare(
          `SELECT directions.workspace_id AS workspace_id
           FROM ideas JOIN directions ON directions.id = ideas.direction_id
           WHERE ideas.id = ?`,
        )
        .get(decision.ideaId) as { workspace_id: string } | undefined;
      if (!workspace) throw new Error("IDEA_NOT_FOUND");
      this.database
        .prepare(
          `INSERT INTO activity_events
           (id, workspace_id, kind, target_kind, target_id, payload_json, created_at)
           VALUES (?, ?, 'decision.confirmed', 'idea', ?, ?, ?)`,
        )
        .run(
          `activity_${decision.id}`,
          workspace.workspace_id,
          decision.ideaId,
          JSON.stringify({
            ideaVersion: decision.ideaVersion,
            outcome: decision.outcome,
            reason: decision.reason,
            revisitCondition: decision.revisitCondition,
            sourceKind: decision.sourceKind,
            reportBindings: decision.reportBindings,
          }),
          decision.createdAt,
        );
      return decision;
    })();
  }

  get(id: string): Decision | undefined {
    const row = this.database.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as
      | DecisionRow
      | undefined;
    return row ? mapDecision(row) : undefined;
  }

  getForVersion(ideaId: string, ideaVersion: number): Decision | undefined {
    const row = this.database
      .prepare("SELECT * FROM decisions WHERE idea_id = ? AND idea_version = ?")
      .get(ideaId, ideaVersion) as DecisionRow | undefined;
    return row ? mapDecision(row) : undefined;
  }

  list(): Decision[] {
    return (
      this.database.prepare("SELECT * FROM decisions ORDER BY created_at DESC").all() as DecisionRow[]
    ).map(mapDecision);
  }
}

function mapDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaVersion: row.idea_version,
    mvpScopeVersion: row.mvp_scope_version,
    outcome: row.outcome,
    reason: row.reason,
    revisitCondition: row.revisit_condition,
    sourceKind: row.source_kind,
    reportBindings: [
      {
        reportId: row.market_report_id,
        revision: row.market_report_revision,
        lens: "market_space",
      },
      { reportId: row.cost_report_id, revision: row.cost_report_revision, lens: "build_cost" },
    ],
    actorId: row.actor_id,
    createdAt: row.created_at,
  };
}
