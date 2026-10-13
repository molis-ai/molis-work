import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";

type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;
type UsageTotals = { input: number; output: number; cached_input: number; rounds: number };

/** Each finished round's reported usage, kept once in the Assistant's own table, and what it adds up to. */
export class AssistantUsageLedger {
  constructor(private readonly db: DatabaseSync) {}

  /** One finished round's reported usage, kept once. */
  record(actorId: string, usage: { work_id: string; run_id: string; ended_at: string; input: number; output: number; cached: number }): void {
    this.db.prepare("INSERT OR IGNORE INTO assistant_usage(run_id,actor_id,work_id,ended_at,input,output,cached) VALUES (?,?,?,?,?,?,?)")
      .run(usage.run_id, actorId, usage.work_id, usage.ended_at, usage.input, usage.output, usage.cached);
  }

  /** Runs whose usage is already kept, among these. */
  recorded(runIds: readonly string[]): Set<string> {
    if (!runIds.length) return new Set();
    return new Set(this.db.prepare(`SELECT run_id FROM assistant_usage WHERE run_id IN (${runIds.map(() => "?").join(",")})`).all(...runIds).map(row => String(row.run_id)));
  }

  /** Kept usage of these works' rounds. */
  of(actorId: string, workIds: readonly string[]): UsageTotals {
    if (!workIds.length) return { input: 0, output: 0, cached_input: 0, rounds: 0 };
    const row = this.db.prepare(`SELECT COALESCE(SUM(input),0) AS input, COALESCE(SUM(output),0) AS output, COALESCE(SUM(cached),0) AS cached, COUNT(*) AS rounds FROM assistant_usage WHERE actor_id=? AND work_id IN (${workIds.map(() => "?").join(",")})`)
      .get(actorId, ...workIds) as { input: number; output: number; cached: number; rounds: number };
    return { input: Number(row.input), output: Number(row.output), cached_input: Number(row.cached), rounds: Number(row.rounds) };
  }

  since(actorId: string, since: string): UsageTotals {
    const row = this.db.prepare("SELECT COALESCE(SUM(input),0) AS input, COALESCE(SUM(output),0) AS output, COALESCE(SUM(cached),0) AS cached, COUNT(*) AS rounds FROM assistant_usage WHERE actor_id=? AND ended_at>=?").get(actorId, since) as { input: number; output: number; cached: number; rounds: number };
    return { input: Number(row.input), output: Number(row.output), cached_input: Number(row.cached), rounds: Number(row.rounds) };
  }
}
