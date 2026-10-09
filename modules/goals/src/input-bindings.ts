import type { GoalInputBindingRecord, GoalInputBindingsApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ContextAccess, ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { GoalsSqliteDatabase } from "./repository.js";
import { GoalsCommandError } from "./errors.js";

export const GOAL_INPUT_BINDINGS_SCHEMA_SQL = `
  CREATE TABLE input_bindings (
    binding_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    input_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    source_edge_key TEXT,
    snapshot_digest TEXT,
    state TEXT NOT NULL CHECK (state IN ('proposed', 'confirmed', 'inactive')),
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

type BindingRow = GoalInputBindingRecord & { source_edge_key: string | null };

/** Goals owns confirmation receipts; Ledger owns their cross-module source endpoints. */
export class GoalInputBindings implements GoalInputBindingsApi {
  constructor(private readonly db: GoalsSqliteDatabase, private readonly ledger: ContextLedgerApi) {}

  list(projectId: string): GoalInputBindingRecord[] {
    return (this.db.prepare("SELECT * FROM input_bindings WHERE project_id = ? ORDER BY created_at, binding_id")
      .all(projectId) as BindingRow[]).map((row) => ({
      binding_id: String(row.binding_id), project_id: String(row.project_id), goal_id: String(row.goal_id),
      input_name: String(row.input_name), source_type: String(row.source_type), source_ref: this.sourceLocator(row),
      snapshot_digest: row.snapshot_digest == null ? null : String(row.snapshot_digest),
      state: row.state as GoalInputBindingRecord["state"], reason: String(row.reason),
      created_by: String(row.created_by), created_at: String(row.created_at),
    }));
  }

  register(input: GoalInputBindingRecord): void {
    if (!this.db.prepare("SELECT 1 FROM goals WHERE project_id = ? AND goal_id = ?").get(input.project_id, input.goal_id)) {
      throw new GoalsCommandError("goal.not_found", "输入绑定的 Goal 不属于这个 Project");
    }
    this.db.transaction(() => {
      const edgeKey = this.recordSource(input);
      this.db.prepare(`INSERT INTO input_bindings (
      binding_id, project_id, goal_id, input_name, source_type, source_ref,
      snapshot_digest, state, reason, created_by, created_at, source_edge_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.binding_id, input.project_id, input.goal_id, input.input_name, input.source_type,
        edgeKey ? "" : input.source_ref, input.snapshot_digest, input.state, input.reason, input.created_by, input.created_at, edgeKey);
    }).immediate();
  }

  deactivate(projectId: string, bindingId: string): boolean {
    const result = this.db.prepare("UPDATE input_bindings SET state = 'inactive' WHERE project_id = ? AND binding_id = ? AND state <> 'inactive'").run(projectId, bindingId);
    return Number(result.changes) > 0;
  }

  private access(projectId: string, actorId = "module:goals"): ContextAccess {
    return { actor_id: actorId, scope: { kind: "personal", id: projectId } };
  }

  private recordSource(input: GoalInputBindingRecord): string | null {
    if (input.source_type !== "feed_item" || !input.source_ref.startsWith("feed-item:")) return null;
    const id = input.source_ref.slice("feed-item:".length);
    if (!id.trim()) return null;
    const access = this.access(input.project_id, input.created_by);
    const key = `goal.input:${input.binding_id}`;
    this.ledger.commands.put(access, {
      key, type: "goal.input", source: { module: "goals", id: input.goal_id, version: null, scope: access.scope },
      target: { module: "feed", id, version: null, scope: access.scope },
      cause: "goals.input_source", recorded_at: input.created_at,
    });
    return key;
  }

  private sourceLocator(input: BindingRow): string {
    if (!input.source_edge_key) return input.source_ref;
    const edge = this.ledger.query.get(this.access(input.project_id), input.source_edge_key);
    if (!edge || edge.type !== "goal.input" || edge.source.module !== "goals" || edge.source.id !== input.goal_id
      || edge.target.module !== "feed") {
      throw new GoalsCommandError("goal.input_source_missing", "输入确认记录的来源关系缺失或不匹配");
    }
    return `feed-item:${edge.target.id}`;
  }
}
