import { randomUUID } from "node:crypto";

import type { GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

export interface GoalLifecycleMigrationDatabase extends GoalsSqliteDatabase {
  exec(sql: string): unknown;
  pragma(source: string): unknown;
}

export function migrateGoalArchiveSchema(
  db: GoalLifecycleMigrationDatabase,
  now: () => Date = () => new Date(),
): void {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE goals ADD COLUMN archived_at TEXT;
      ALTER TABLE goals ADD COLUMN archived_by TEXT;
      CREATE INDEX goals_archive_idx ON goals(board_id, archived_at);
    `);
    recordMigration(db, 4, now().toISOString());
  }).immediate();
}

export function migrateGoalTrashSchema(
  db: GoalLifecycleMigrationDatabase,
  now: () => Date = () => new Date(),
): void {
  db.transaction(() => {
    const goalColumns = db.pragma("table_info(goals)") as Array<{ name: string }>;
    const existingColumns = new Set(goalColumns.map((column) => column.name));
    if (!existingColumns.has("trashed_at")) db.exec("ALTER TABLE goals ADD COLUMN trashed_at TEXT");
    if (!existingColumns.has("trashed_by")) db.exec("ALTER TABLE goals ADD COLUMN trashed_by TEXT");
    db.exec(`
      CREATE INDEX IF NOT EXISTS goals_trash_idx ON goals(board_id, trashed_at);

      CREATE TABLE IF NOT EXISTS goal_trash_records (
        trash_record_id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
        goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
        trashed_at TEXT NOT NULL,
        trashed_by TEXT NOT NULL,
        trash_reason TEXT NOT NULL,
        restored_at TEXT,
        restored_by TEXT,
        restore_reason TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS goal_trash_one_open_per_goal
        ON goal_trash_records(board_id, goal_id)
        WHERE restored_at IS NULL;
      CREATE INDEX IF NOT EXISTS goal_trash_records_goal_idx
        ON goal_trash_records(board_id, goal_id, restored_at, trashed_at);

      CREATE TABLE IF NOT EXISTS goal_trash_relation_records (
        trash_record_id TEXT NOT NULL REFERENCES goal_trash_records(trash_record_id) ON DELETE CASCADE,
        relation_id TEXT NOT NULL REFERENCES goal_relations(relation_id) ON DELETE CASCADE,
        prior_state TEXT NOT NULL CHECK (prior_state = 'active'),
        deactivated_at TEXT NOT NULL,
        restored_at TEXT,
        PRIMARY KEY (trash_record_id, relation_id)
      );
      CREATE INDEX IF NOT EXISTS goal_trash_relation_records_relation_idx
        ON goal_trash_relation_records(relation_id, restored_at);
    `);
    recordMigration(db, 11, now().toISOString());
  }).immediate();
}

export function migrateGoalLifecycleState(
  db: GoalLifecycleMigrationDatabase,
  now: () => Date = () => new Date(),
): void {
  db.transaction(() => {
    const migratedAt = now().toISOString();
    const migrationActor = "molis-work:migration-12";
    const staleRuns = db.prepare(`
      SELECT r.run_id, r.board_id, r.goal_id, r.claim_id,
        r.state AS run_state, c.state AS claim_state, c.released_at
      FROM runs r
      JOIN claims c ON c.claim_id = r.claim_id
      WHERE r.state IN ('started', 'blocked') AND c.state != 'active'
      ORDER BY r.run_id
    `).all() as Row[];
    for (const row of staleRuns) {
      const claimState = text(row.claim_state);
      const reason = `关联 Claim 已是 ${claimState}，迁移时关闭历史遗留 Run`;
      const endedAt = optionalText(row.released_at) ?? migratedAt;
      db.prepare(`
        UPDATE runs SET state = 'abandoned', block_reason = ?, ended_at = ?
        WHERE run_id = ? AND state IN ('started', 'blocked')
      `).run(reason, endedAt, text(row.run_id));
      appendEvent(db, {
        boardId: text(row.board_id),
        actorId: migrationActor,
        type: "run.abandoned",
        objectType: "run",
        objectId: text(row.run_id),
        reason,
        payload: {
          claim_id: text(row.claim_id),
          claim_state: claimState,
          goal_id: text(row.goal_id),
          previous_state: text(row.run_state),
          recovery: true,
          migration_id: 12,
        },
        at: migratedAt,
      });
    }

    const staleClarifications = db.prepare(`
      SELECT cs.session_id, cs.board_id, cs.goal_id,
        cs.state AS session_state, g.definition_state, g.accepted_at
      FROM clarification_sessions cs
      JOIN goals g ON g.board_id = cs.board_id AND g.goal_id = cs.goal_id
      WHERE cs.state != 'closed' AND g.definition_state != 'draft'
      ORDER BY cs.session_id
    `).all() as Row[];
    for (const row of staleClarifications) {
      const closedAt = optionalText(row.accepted_at) ?? migratedAt;
      const reason = "Goal 已结束 Draft 澄清，迁移时关闭历史遗留澄清会话";
      db.prepare(`
        UPDATE clarification_sessions
        SET state = 'closed', updated_at = ?, closed_at = ?
        WHERE session_id = ? AND state != 'closed'
      `).run(migratedAt, closedAt, text(row.session_id));
      appendEvent(db, {
        boardId: text(row.board_id),
        actorId: migrationActor,
        type: "clarification.closed",
        objectType: "clarification_session",
        objectId: text(row.session_id),
        reason,
        payload: {
          goal_id: text(row.goal_id),
          definition_state: text(row.definition_state),
          previous_state: text(row.session_state),
          recovery: true,
          migration_id: 12,
        },
        at: migratedAt,
      });
    }
    recordMigration(db, 12, migratedAt);
  }).immediate();
}

export function migrateActiveGoalLifecycle(
  db: GoalLifecycleMigrationDatabase,
  now: () => Date = () => new Date(),
): void {
  db.transaction(() => {
    const migratedAt = now().toISOString();
    const migrationActor = "molis-work:migration-13";
    const staleActiveGoals = db.prepare(`
      SELECT b.board_id, b.active_goal_id, g.goal_id,
        g.fulfillment_state, g.archived_at, g.trashed_at
      FROM boards b
      LEFT JOIN goals g ON g.board_id = b.board_id AND g.goal_id = b.active_goal_id
      WHERE b.active_goal_id IS NOT NULL
        AND (
          g.goal_id IS NULL OR g.fulfillment_state = 'satisfied'
          OR g.archived_at IS NOT NULL OR g.trashed_at IS NOT NULL
        )
      ORDER BY b.board_id
    `).all() as Row[];
    for (const row of staleActiveGoals) {
      const boardId = text(row.board_id);
      const goalId = text(row.active_goal_id);
      const reason = row.goal_id == null
        ? "Active Goal 已不存在，迁移时清空历史指针"
        : row.trashed_at != null
          ? "Active Goal 已在回收站，迁移时清空历史指针"
          : row.archived_at != null
            ? "Active Goal 已归档，迁移时清空历史指针"
            : "Active Goal 已完成，迁移时清空历史指针";
      db.prepare(
        "UPDATE boards SET active_goal_id = NULL, updated_at = ? WHERE board_id = ? AND active_goal_id = ?",
      ).run(migratedAt, boardId, goalId);
      appendEvent(db, {
        boardId,
        actorId: migrationActor,
        type: "board.active_goal_cleared",
        objectType: "goal",
        objectId: goalId,
        reason,
        payload: {
          previous_active_goal_id: goalId,
          fulfillment_state: optionalText(row.fulfillment_state),
          recovery: true,
          migration_id: 13,
        },
        at: migratedAt,
      });
    }
    recordMigration(db, 13, migratedAt);
  }).immediate();
}

export function migrateGoalContractCoverageSchema(
  db: GoalLifecycleMigrationDatabase,
  now: () => Date = () => new Date(),
): void {
  db.transaction(() => {
    const goalColumns = db.pragma("table_info(goals)") as Array<{ name: string }>;
    if (!goalColumns.some((column) => column.name === "decomposition_review_json")) {
      db.exec("ALTER TABLE goals ADD COLUMN decomposition_review_json TEXT");
    }
    const riskColumns = db.pragma("table_info(risks)") as Array<{ name: string }>;
    if (!riskColumns.some((column) => column.name === "resolution_basis_json")) {
      db.exec("ALTER TABLE risks ADD COLUMN resolution_basis_json TEXT");
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (21, ?)")
      .run(now().toISOString());
  }).immediate();
}

export function migratePlanningMethodPacksSchema(
  db: GoalLifecycleMigrationDatabase,
  now: () => Date = () => new Date(),
): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS planning_method_packs (
        board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
        method_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        pack_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (board_id, method_id)
      );
    `);
    db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (16, ?)")
      .run(now().toISOString());
  }).immediate();
}

function recordMigration(db: GoalLifecycleMigrationDatabase, migrationId: number, at: string): void {
  db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)").run(migrationId, at);
}

function appendEvent(
  db: GoalLifecycleMigrationDatabase,
  input: {
    boardId: string;
    actorId: string;
    type: string;
    objectType: string;
    objectId: string;
    reason: string;
    payload: unknown;
    at: string;
  },
): void {
  db.prepare(`
    INSERT INTO events (
      event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.boardId,
    input.actorId,
    input.type,
    input.objectType,
    input.objectId,
    input.reason,
    JSON.stringify(input.payload ?? null),
    input.at,
  );
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}
