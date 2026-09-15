import type { ExecutionSqliteDatabase } from "./repository.js";

export interface ExecutionMigrationDatabase extends ExecutionSqliteDatabase {
  pragma(source: string): unknown;
}

export function migrateClarifierRoles(db: ExecutionMigrationDatabase): void {
  rebuildExecutionTables(db, 2, `
    CREATE TABLE claims_v2 (
      claim_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      goal_id TEXT NOT NULL REFERENCES goals(goal_id),
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
      state TEXT NOT NULL CHECK (state IN ('active', 'released', 'expired', 'revoked')),
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      goal_mode_attestation INTEGER NOT NULL DEFAULT 0,
      resolved_policy_json TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      renewed_at TEXT,
      released_at TEXT,
      release_reason TEXT
    );
    INSERT INTO claims_v2 SELECT * FROM claims;
    CREATE TABLE runs_v2 (
      run_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      goal_id TEXT NOT NULL REFERENCES goals(goal_id),
      claim_id TEXT NOT NULL REFERENCES claims(claim_id),
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'revalidator')),
      state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
      block_reason TEXT,
      output_refs_json TEXT NOT NULL DEFAULT '[]',
      discovery_refs_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
    INSERT INTO runs_v2 SELECT * FROM runs;
    DROP TABLE runs;
    DROP TABLE claims;
    ALTER TABLE claims_v2 RENAME TO claims;
    ALTER TABLE runs_v2 RENAME TO runs;
    CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
    CREATE INDEX claims_goal_idx ON claims(goal_id, state);
    CREATE UNIQUE INDEX claims_one_active_executor ON claims(goal_id)
      WHERE state = 'active' AND role IN ('executor', 'revalidator');
    CREATE UNIQUE INDEX claims_one_active_clarifier ON claims(goal_id)
      WHERE state = 'active' AND role = 'clarifier';
    CREATE UNIQUE INDEX runs_one_nonterminal_per_claim ON runs(claim_id)
      WHERE state IN ('started', 'blocked');
  `);
}

export function migrateReviewerRunRoles(db: ExecutionMigrationDatabase): void {
  rebuildExecutionTables(db, 6, `
    CREATE TABLE runs_v3 (
      run_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      goal_id TEXT NOT NULL REFERENCES goals(goal_id),
      claim_id TEXT NOT NULL REFERENCES claims(claim_id),
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
      state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
      block_reason TEXT,
      output_refs_json TEXT NOT NULL DEFAULT '[]',
      discovery_refs_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
    INSERT INTO runs_v3 SELECT * FROM runs;
    DROP TABLE runs;
    ALTER TABLE runs_v3 RENAME TO runs;
    CREATE UNIQUE INDEX runs_one_nonterminal_per_claim ON runs(claim_id)
      WHERE state IN ('started', 'blocked');
  `);
}

export function migrateUnifiedClaimRolesAndExclusivity(db: ExecutionMigrationDatabase): void {
  rebuildExecutionTables(db, 7, `
    CREATE TABLE claims_v4 (
      claim_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      goal_id TEXT NOT NULL REFERENCES goals(goal_id),
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
      state TEXT NOT NULL CHECK (state IN ('active', 'released', 'expired', 'revoked')),
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      goal_mode_attestation INTEGER NOT NULL DEFAULT 0,
      resolved_policy_json TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      renewed_at TEXT,
      released_at TEXT,
      release_reason TEXT
    );
    INSERT INTO claims_v4 SELECT * FROM claims;
    CREATE TABLE runs_v4 (
      run_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      goal_id TEXT NOT NULL REFERENCES goals(goal_id),
      claim_id TEXT NOT NULL REFERENCES claims(claim_id),
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
      state TEXT NOT NULL CHECK (state IN ('started', 'blocked', 'completed', 'failed', 'abandoned')),
      block_reason TEXT,
      output_refs_json TEXT NOT NULL DEFAULT '[]',
      discovery_refs_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
    INSERT INTO runs_v4 SELECT * FROM runs;
    DROP TABLE runs;
    DROP TABLE claims;
    ALTER TABLE claims_v4 RENAME TO claims;
    ALTER TABLE runs_v4 RENAME TO runs;
    CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
    CREATE INDEX claims_goal_idx ON claims(goal_id, state);
    CREATE UNIQUE INDEX claims_one_active_per_goal ON claims(goal_id) WHERE state = 'active';
    CREATE UNIQUE INDEX runs_one_nonterminal_per_claim ON runs(claim_id)
      WHERE state IN ('started', 'blocked');
  `);
}

export function migrateExecutionActionColumns(db: ExecutionMigrationDatabase): void {
  addColumn(db, "claims", "contract_revision", "INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "claims", "action_kind", "TEXT");
  addColumn(db, "claims", "action_target_id", "TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS claims_action_idx
      ON claims(board_id, action_kind, action_target_id, state);
    UPDATE claims SET action_kind = CASE role
      WHEN 'clarifier' THEN 'clarify'
      WHEN 'revalidator' THEN 'revalidate'
      WHEN 'executor' THEN 'execute'
      ELSE 'review'
    END
    WHERE action_kind IS NULL;
    UPDATE claims SET action_target_id = goal_id WHERE action_target_id IS NULL;
  `);
}

function addColumn(
  db: ExecutionMigrationDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function rebuildExecutionTables(
  db: ExecutionMigrationDatabase,
  migrationId: number,
  sql: string,
): void {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)")
        .run(migrationId, new Date().toISOString());
    }).immediate();
  } finally {
    db.pragma("foreign_keys = ON");
  }
  const violations = db.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(`Molis Work migration ${migrationId} foreign key check failed: ${JSON.stringify(violations)}`);
  }
}
