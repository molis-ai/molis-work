import type { StoredModuleEvent } from "@molis-ai/molis-work-contracts/platform/storage";
import type {
  ExecutionClaimRecord,
  ExecutionRunRecord,
  ExecutionRunWithClaim,
} from "@molis-ai/molis-work-contracts/modules/execution";

type Row = Record<string, unknown>;

export interface ExecutionSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
}

export interface ExecutionSqliteDatabase {
  prepare(sql: string): ExecutionSqliteStatement;
  exec(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export const EXECUTION_SCHEMA_SQL = `
  CREATE TABLE claims (
    claim_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id),
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('clarifier', 'executor', 'self_verifier', 'cross_reviewer', 'adversarial_reviewer', 'revalidator')),
    contract_revision INTEGER NOT NULL DEFAULT 1,
    action_kind TEXT,
    action_target_id TEXT,
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
  CREATE INDEX claims_board_state_idx ON claims(board_id, state, expires_at);
  CREATE INDEX claims_goal_idx ON claims(goal_id, state);
  CREATE INDEX claims_action_idx ON claims(board_id, action_kind, action_target_id, state);
  CREATE UNIQUE INDEX claims_one_active_per_goal ON claims(goal_id) WHERE state = 'active';

  CREATE TABLE runs (
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
  CREATE UNIQUE INDEX runs_one_nonterminal_per_claim ON runs(claim_id) WHERE state IN ('started', 'blocked');
`;

export function createExecutionSchema(db: ExecutionSqliteDatabase): void {
  db.exec(EXECUTION_SCHEMA_SQL);
}

export class ExecutionRepository {
  constructor(readonly db: ExecutionSqliteDatabase) {}

  listLifecycleEvents(boardId: string): StoredModuleEvent[] {
    return (this.db.prepare(`SELECT seq, type, object_type, object_id, payload_json, at FROM events
      WHERE board_id = ? AND type IN ('run.started', 'run.completed') ORDER BY seq`)
      .all(boardId) as Row[]).map(row => ({
      seq: Number(row.seq ?? 0), type: text(row.type), object_type: text(row.object_type), object_id: text(row.object_id),
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}), at: text(row.at),
    }));
  }

  getClaim(boardId: string, claimId: string): ExecutionClaimRecord | null {
    const row = this.db
      .prepare("SELECT * FROM claims WHERE board_id = ? AND claim_id = ?")
      .get(boardId, claimId) as Row | undefined;
    return row ? mapExecutionClaim(row) : null;
  }

  listClaims(boardId: string): ExecutionClaimRecord[] {
    return (this.db
      .prepare("SELECT * FROM claims WHERE board_id = ? ORDER BY claimed_at DESC, claim_id")
      .all(boardId) as Row[]).map(mapExecutionClaim);
  }

  listClaimsForGoal(boardId: string, goalId: string): ExecutionClaimRecord[] {
    return (this.db.prepare(`
      SELECT * FROM claims WHERE board_id = ? AND goal_id = ? ORDER BY claimed_at, claim_id
    `).all(boardId, goalId) as Row[]).map(mapExecutionClaim);
  }

  getRun(boardId: string, runId: string): ExecutionRunRecord | null {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE board_id = ? AND run_id = ?")
      .get(boardId, runId) as Row | undefined;
    return row ? mapExecutionRun(row) : null;
  }

  getRunById(runId: string): ExecutionRunRecord | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as Row | undefined;
    return row ? mapExecutionRun(row) : null;
  }

  getRunWithClaim(boardId: string, runId: string): ExecutionRunWithClaim | null {
    const run = this.getRun(boardId, runId);
    if (!run) return null;
    const claim = this.getClaim(boardId, run.claim_id);
    return claim ? { run, claim } : null;
  }

  listRuns(boardId: string): ExecutionRunRecord[] {
    return (this.db
      .prepare("SELECT * FROM runs WHERE board_id = ? ORDER BY started_at DESC, run_id")
      .all(boardId) as Row[]).map(mapExecutionRun);
  }

  listRunsForGoal(boardId: string, goalId: string): ExecutionRunRecord[] {
    return (this.db.prepare(`
      SELECT * FROM runs WHERE board_id = ? AND goal_id = ? ORDER BY started_at, run_id
    `).all(boardId, goalId) as Row[]).map(mapExecutionRun);
  }

  latestRunForGoal(
    boardId: string,
    goalId: string,
    roles?: readonly ExecutionRunRecord["role"][],
  ): ExecutionRunRecord | null {
    return this.listRunsForGoal(boardId, goalId)
      .filter((run) => !roles || roles.includes(run.role))
      .sort((left, right) =>
        right.started_at.localeCompare(left.started_at) || right.run_id.localeCompare(left.run_id)
      )[0] ?? null;
  }

  latestClaimForGoal(
    boardId: string,
    goalId: string,
    roles?: readonly ExecutionClaimRecord["role"][],
  ): ExecutionClaimRecord | null {
    return this.listClaimsForGoal(boardId, goalId)
      .filter((claim) => !roles || roles.includes(claim.role))
      .sort((left, right) =>
        right.claimed_at.localeCompare(left.claimed_at) || right.claim_id.localeCompare(left.claim_id)
      )[0] ?? null;
  }

  latestActiveRunForClaim(claimId: string): ExecutionRunRecord | null {
    return this.activeRunIdsForClaim(claimId)
      .map((runId) => this.getRunById(runId))
      .filter((run): run is ExecutionRunRecord => run != null)
      .sort((left, right) =>
        right.started_at.localeCompare(left.started_at) || right.run_id.localeCompare(left.run_id)
      )[0] ?? null;
  }

  listNonterminalRuns(boardId: string): ExecutionRunRecord[] {
    return this.listRuns(boardId).filter((run) => run.state === "started" || run.state === "blocked");
  }

  activeClaimCount(boardId: string, at: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM claims
      WHERE board_id = ? AND state = 'active' AND expires_at > ?
    `).get(boardId, at) as Row | undefined;
    return number(row?.count);
  }

  nonterminalRunCount(boardId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM runs
      WHERE board_id = ? AND state IN ('started', 'blocked')
    `).get(boardId) as Row | undefined;
    return number(row?.count);
  }

  activeClaimIdsForGoal(boardId: string, goalId: string, at?: string): string[] {
    const rows = at
      ? this.db.prepare(`
          SELECT claim_id FROM claims
          WHERE board_id = ? AND goal_id = ? AND state = 'active' AND expires_at > ?
          ORDER BY claim_id
        `).all(boardId, goalId, at)
      : this.db.prepare(`
          SELECT claim_id FROM claims
          WHERE board_id = ? AND goal_id = ? AND state = 'active'
          ORDER BY claim_id
        `).all(boardId, goalId);
    return (rows as Row[]).map((row) => text(row.claim_id));
  }

  activeRunIdsForGoal(boardId: string, goalId: string): string[] {
    return (this.db.prepare(`
      SELECT run_id FROM runs
      WHERE board_id = ? AND goal_id = ? AND state IN ('started', 'blocked')
      ORDER BY run_id
    `).all(boardId, goalId) as Row[]).map((row) => text(row.run_id));
  }

  activeRunIdsForClaim(claimId: string): string[] {
    return (this.db.prepare(`
      SELECT run_id FROM runs WHERE claim_id = ? AND state IN ('started', 'blocked') ORDER BY run_id
    `).all(claimId) as Row[]).map((row) => text(row.run_id));
  }

}

export function mapExecutionClaim(row: Row): ExecutionClaimRecord {
  return {
    claim_id: text(row.claim_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    actor_id: text(row.actor_id),
    role: text(row.role) as ExecutionClaimRecord["role"],
    contract_revision: Math.max(1, number(row.contract_revision) || 1),
    action_kind: nullableText(row.action_kind) as ExecutionClaimRecord["action_kind"],
    action_target_id: nullableText(row.action_target_id),
    state: text(row.state) as ExecutionClaimRecord["state"],
    capabilities: parseJson<string[]>(row.capabilities_json, []),
    goal_mode_attestation: number(row.goal_mode_attestation) === 1,
    resolved_policy: parseJson(row.resolved_policy_json, {} as ExecutionClaimRecord["resolved_policy"]),
    claimed_at: text(row.claimed_at),
    expires_at: text(row.expires_at),
    renewed_at: nullableText(row.renewed_at),
    released_at: nullableText(row.released_at),
    release_reason: nullableText(row.release_reason),
  };
}

export function mapExecutionRun(row: Row): ExecutionRunRecord {
  return {
    run_id: text(row.run_id),
    board_id: text(row.board_id),
    goal_id: text(row.goal_id),
    claim_id: text(row.claim_id),
    actor_id: text(row.actor_id),
    role: text(row.role) as ExecutionRunRecord["role"],
    state: text(row.state) as ExecutionRunRecord["state"],
    block_reason: nullableText(row.block_reason),
    output_refs: parseJson<string[]>(row.output_refs_json, []),
    discovery_refs: parseJson<string[]>(row.discovery_refs_json, []),
    started_at: text(row.started_at),
    ended_at: nullableText(row.ended_at),
  };
}

function text(value: unknown): string {
  return String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
