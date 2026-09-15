import process from "node:process";
import path from "node:path";

import Database from "better-sqlite3";

const databasePath = process.argv[2];
if (!databasePath) {
  console.error("usage: node tooling/migrations/audit-goal-lifecycle.mjs /absolute/path/to/molis-work.sqlite");
  process.exitCode = 2;
} else {
  const resolvedPath = path.resolve(databasePath);
  const database = new Database(resolvedPath, { readonly: true, fileMustExist: true });
  try {
    const requiredMigrations = [4, 11, 12, 13, 21];
    const tables = new Set(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String(row.name)),
    );
    const columns = (table) => tables.has(table)
      ? new Set(database.pragma(`table_info(${table})`).map((row) => String(row.name)))
      : new Set();
    const goalColumns = columns("goals");
    const missingSchemaSurfaces = [
      ["goals.archived_at", goalColumns.has("archived_at")],
      ["goals.archived_by", goalColumns.has("archived_by")],
      ["goals.trashed_at", goalColumns.has("trashed_at")],
      ["goals.trashed_by", goalColumns.has("trashed_by")],
      ["goals.decomposition_review_json", goalColumns.has("decomposition_review_json")],
      ["goal_trash_records", tables.has("goal_trash_records")],
      ["goal_trash_relation_records", tables.has("goal_trash_relation_records")],
      ["goal_contract_revisions", tables.has("goal_contract_revisions")],
    ].filter(([, present]) => !present).map(([name]) => name);
    const appliedMigrations = new Set(
      tables.has("schema_migrations")
        ? database.prepare(`
            SELECT migration_id FROM schema_migrations
            WHERE migration_id IN (4, 11, 12, 13, 21)
          `).all().map((row) => Number(row.migration_id))
        : [],
    );
    const staleRuns = tables.has("runs") && tables.has("claims")
      ? Number(database.prepare(`
          SELECT COUNT(*) AS count
          FROM runs run
          JOIN claims claim ON claim.claim_id = run.claim_id
          WHERE run.state IN ('started', 'blocked') AND claim.state != 'active'
        `).get().count)
      : null;
    const staleClarifications = tables.has("clarification_sessions") && tables.has("goals")
      ? Number(database.prepare(`
          SELECT COUNT(*) AS count
          FROM clarification_sessions session
          JOIN goals goal ON goal.board_id = session.board_id AND goal.goal_id = session.goal_id
          WHERE session.state != 'closed' AND goal.definition_state != 'draft'
        `).get().count)
      : null;
    const staleActiveGoals = tables.has("boards")
      && tables.has("goals")
      && goalColumns.has("archived_at")
      && goalColumns.has("trashed_at")
      ? Number(database.prepare(`
          SELECT COUNT(*) AS count
          FROM boards board
          LEFT JOIN goals goal
            ON goal.board_id = board.board_id AND goal.goal_id = board.active_goal_id
          WHERE board.active_goal_id IS NOT NULL
            AND (
              goal.goal_id IS NULL OR goal.fulfillment_state = 'satisfied'
              OR goal.archived_at IS NOT NULL OR goal.trashed_at IS NOT NULL
            )
        `).get().count)
      : null;
    const missingContractRevisions = tables.has("goals")
      && tables.has("goal_contract_revisions")
      && goalColumns.has("current_contract_revision")
      ? Number(database.prepare(`
          SELECT COUNT(*) AS count
          FROM goals goal
          LEFT JOIN goal_contract_revisions revision
            ON revision.board_id = goal.board_id
            AND revision.goal_id = goal.goal_id
            AND revision.revision = goal.current_contract_revision
          WHERE revision.goal_id IS NULL
        `).get().count)
      : null;
    const report = {
      database: resolvedPath,
      missing_migration_ids: requiredMigrations.filter((id) => !appliedMigrations.has(id)),
      missing_schema_surfaces: missingSchemaSurfaces,
      stale_runs: staleRuns,
      stale_clarification_sessions: staleClarifications,
      stale_active_goal_pointers: staleActiveGoals,
      goals_without_current_contract_revision: missingContractRevisions,
    };
    console.log(JSON.stringify(report, null, 2));
    if (
      report.missing_migration_ids.length > 0
      || missingSchemaSurfaces.length > 0
      || staleRuns == null || staleRuns > 0
      || staleClarifications == null || staleClarifications > 0
      || staleActiveGoals == null || staleActiveGoals > 0
      || missingContractRevisions == null || missingContractRevisions > 0
    ) process.exitCode = 1;
  } finally {
    database.close();
  }
}
