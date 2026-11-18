import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CommitIntentRow { decision_id: string; project_id: string; record_json: string; created_at: string }

/**
 * The platform record of an acceptance decision, kept beside `acceptance.db` until the project library has committed it. A file, not a
 * table: the acceptance database and the project library are different SQLite files, and this intent is the durable two-phase record that
 * lets the Host restore the project decision after a crash or a failed project commit. Writes are temp-file + fsync + rename, so a reader
 * never sees half a record.
 */
export class AcceptanceCommitIntents {
  private readonly directory: string;
  constructor(homeDirectory: string) { this.directory = join(homeDirectory, "acceptance", "commit-intents"); }

  add(decisionId: string, projectId: string, recordJson: string, at: string): void {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(decisionId), temp = `${path}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify({ decision_id: decisionId, project_id: projectId, record_json: recordJson, created_at: at }), { mode: 0o600 });
      const handle = openSync(temp, "r+");
      try { fsyncSync(handle); } finally { closeSync(handle); }
      renameSync(temp, path);
    } catch (error) { rmSync(temp, { force: true }); throw error; }
    try { const directory = openSync(this.directory, "r"); try { fsyncSync(directory); } finally { closeSync(directory); } } catch { /* the file is already durable on this platform */ }
  }

  list(projectId?: string): CommitIntentRow[] {
    let names: string[];
    try { names = readdirSync(this.directory); } catch { return []; }
    const rows: CommitIntentRow[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const row = JSON.parse(readFileSync(join(this.directory, name), "utf8")) as CommitIntentRow;
        if (row.decision_id !== name.slice(0, -5) || typeof row.project_id !== "string" || typeof row.record_json !== "string"
          || typeof row.created_at !== "string" || projectId !== undefined && row.project_id !== projectId) continue;
        rows.push(row);
      } catch { /* a temporary or unreadable file is not a commit record */ }
    }
    return rows.sort((left, right) => left.created_at.localeCompare(right.created_at) || left.decision_id.localeCompare(right.decision_id));
  }

  remove(decisionId: string): void { rmSync(this.path(decisionId), { force: true }); }

  removeProject(projectId: string): void { for (const row of this.list(projectId)) this.remove(row.decision_id); }

  private path(decisionId: string): string {
    if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(decisionId)) throw new Error("acceptance commit intent id is not a safe key");
    return join(this.directory, `${decisionId}.json`);
  }
}
