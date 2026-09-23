import {
  assertValidPlaybookScope,
  type PlaybookRule,
  type PlaybookScope,
  type TasteRule,
} from "../../domain/memory/rules.js";
import type { SqliteDatabase } from "./open-database.js";

interface TasteRow {
  id: string;
  workspace_id: string;
  actor_id: string;
  version: number;
  title: string;
  statement: string;
  applies_to: string;
  exceptions_json: string;
  source_kind: TasteRule["source"]["kind"];
  source_id: string;
  status: TasteRule["status"];
  created_at: string;
  updated_at: string;
}

interface PlaybookRow {
  id: string;
  workspace_id: string;
  actor_id: string;
  version: number;
  original_feedback: string;
  method_change: string;
  positive_examples_json: string;
  negative_examples_json: string;
  scope_kind: PlaybookScope["kind"];
  report_id: string | null;
  direction_id: string | null;
  source_kind: PlaybookRule["source"]["kind"];
  source_id: string;
  status: PlaybookRule["status"];
  created_at: string;
  updated_at: string;
}

export interface MemoryRuleApplication {
  id: string;
  ruleId: string;
  planId: string;
  runId?: string;
  appliedAt: string;
}

interface ApplicationRow {
  id: string;
  rule_id: string;
  plan_id: string;
  run_id: string | null;
  applied_at: string;
}

export class SqliteMemoryRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createTasteRule(rule: TasteRule): TasteRule {
    this.database
      .prepare(
        `INSERT INTO taste_rules
         (id, workspace_id, actor_id, version, title, statement, applies_to, exceptions_json,
          source_kind, source_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rule.id,
        rule.workspaceId,
        rule.actorId,
        rule.version,
        rule.title,
        rule.statement,
        rule.appliesTo,
        JSON.stringify(rule.exceptions),
        rule.source.kind,
        rule.source.id,
        rule.status,
        rule.createdAt,
        rule.updatedAt,
      );
    return rule;
  }

  listTasteRules(workspaceId: string): TasteRule[] {
    return (
      this.database
        .prepare("SELECT * FROM taste_rules WHERE workspace_id = ? ORDER BY updated_at DESC, id")
        .all(workspaceId) as TasteRow[]
    ).map(mapTaste);
  }

  getTasteRule(id: string): TasteRule | undefined {
    const row = this.database.prepare("SELECT * FROM taste_rules WHERE id = ?").get(id) as
      | TasteRow
      | undefined;
    return row ? mapTaste(row) : undefined;
  }

  updateTasteStatus(id: string, status: "active" | "disabled" | "deleted", now: string): TasteRule {
    const result = this.database
      .prepare("UPDATE taste_rules SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, id);
    if (result.changes !== 1) throw new Error("TASTE_RULE_NOT_FOUND");
    return this.getTasteRule(id) as TasteRule;
  }

  createPlaybookRule(rule: PlaybookRule): PlaybookRule {
    const scope = assertValidPlaybookScope(rule.scope);
    this.database
      .prepare(
        `INSERT INTO research_playbook_rules
         (id, workspace_id, actor_id, version, original_feedback, method_change,
          positive_examples_json, negative_examples_json, scope_kind, report_id, direction_id,
          source_kind, source_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rule.id,
        rule.workspaceId,
        rule.actorId,
        rule.version,
        rule.originalFeedback,
        rule.methodChange,
        JSON.stringify(rule.positiveExamples),
        JSON.stringify(rule.negativeExamples),
        scope.kind,
        scope.kind === "report" ? scope.reportId : null,
        scope.kind === "direction" ? scope.directionId : null,
        rule.source.kind,
        rule.source.id,
        rule.status,
        rule.createdAt,
        rule.updatedAt,
      );
    return rule;
  }

  listPlaybookRules(workspaceId: string): PlaybookRule[] {
    return (
      this.database
        .prepare("SELECT * FROM research_playbook_rules WHERE workspace_id = ? ORDER BY updated_at DESC, id")
        .all(workspaceId) as PlaybookRow[]
    ).map(mapPlaybook);
  }

  getPlaybookRule(id: string): PlaybookRule | undefined {
    const row = this.database.prepare("SELECT * FROM research_playbook_rules WHERE id = ?").get(id) as
      | PlaybookRow
      | undefined;
    return row ? mapPlaybook(row) : undefined;
  }

  updatePlaybookStatus(id: string, status: "active" | "disabled", now: string): PlaybookRule {
    const result = this.database
      .prepare("UPDATE research_playbook_rules SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, id);
    if (result.changes !== 1) throw new Error("PLAYBOOK_RULE_NOT_FOUND");
    return this.getPlaybookRule(id) as PlaybookRule;
  }

  listApplicablePlaybookRules(input: {
    workspaceId: string;
    reportId?: string;
    directionId: string;
  }): PlaybookRule[] {
    return this.listPlaybookRules(input.workspaceId).filter(
      (rule) =>
        rule.status === "active" &&
        (rule.scope.kind === "global_market_space" ||
          (rule.scope.kind === "report" && rule.scope.reportId === input.reportId) ||
          (rule.scope.kind === "direction" && rule.scope.directionId === input.directionId)),
    );
  }

  recordPlaybookApplication(application: MemoryRuleApplication): MemoryRuleApplication {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO memory_rule_applications
         (id, rule_id, plan_id, run_id, applied_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        application.id,
        application.ruleId,
        application.planId,
        application.runId ?? null,
        application.appliedAt,
      );
    return application;
  }

  listApplications(ruleId: string): MemoryRuleApplication[] {
    return (
      this.database
        .prepare("SELECT * FROM memory_rule_applications WHERE rule_id = ? ORDER BY applied_at, id")
        .all(ruleId) as ApplicationRow[]
    ).map((row) => ({
      id: row.id,
      ruleId: row.rule_id,
      planId: row.plan_id,
      ...(row.run_id ? { runId: row.run_id } : {}),
      appliedAt: row.applied_at,
    }));
  }
}

function mapTaste(row: TasteRow): TasteRule {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    version: row.version,
    title: row.title,
    statement: row.statement,
    appliesTo: row.applies_to,
    exceptions: JSON.parse(row.exceptions_json) as string[],
    source: { kind: row.source_kind, id: row.source_id },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlaybook(row: PlaybookRow): PlaybookRule {
  const scope: PlaybookScope =
    row.scope_kind === "report"
      ? { kind: "report", reportId: row.report_id as string }
      : row.scope_kind === "direction"
        ? { kind: "direction", directionId: row.direction_id as string }
        : { kind: "global_market_space" };
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    version: row.version,
    originalFeedback: row.original_feedback,
    methodChange: row.method_change,
    positiveExamples: JSON.parse(row.positive_examples_json) as string[],
    negativeExamples: JSON.parse(row.negative_examples_json) as string[],
    scope,
    source: { kind: row.source_kind, id: row.source_id },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
