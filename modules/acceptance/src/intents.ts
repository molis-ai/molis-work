import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface CommitIntentRow { decision_id: string; project_id: string; record_json: string; created_at: string }

/** Existing recovery records from the former separate-commit path. New decisions use the Host's attached transaction. */
export class AcceptanceCommitIntents {
  private readonly directory: string;
  constructor(homeDirectory: string) { this.directory = join(homeDirectory, "acceptance", "commit-intents"); }

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
