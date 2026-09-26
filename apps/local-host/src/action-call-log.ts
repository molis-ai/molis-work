import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import type { ActionCallContext, ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

/** One finished command: what ran, for whom, and how it ended. Inputs and results are never kept. */
export interface ActionCallRecord {
  at: string;
  capability_id: string;
  version: number;
  provider_id: string;
  provider_title: string;
  title: string;
  actor_id: string;
  audience: string;
  project_id: string | null;
  ok: boolean;
  code?: string;
  message?: string;
}

const RELATIVE_PATH = "logs/action-calls.jsonl";
const KEEP = 1000;

/**
 * A short local history of commands (writes), kept in the Home next to other local records.
 * Queries are not recorded: pages poll them constantly and they change nothing.
 */
export class ActionCallLog {
  private readonly file: string;
  private lines = -1;
  constructor(homeDirectory: string) { this.file = path.join(homeDirectory, RELATIVE_PATH); }

  record(caller: ActionCallContext, action: ActionReference & { operation: string; title: string; provider_title: string },
    outcome: { ok: true } | { ok: false; code?: string; message: string }): void {
    if (action.operation !== "command") return;
    const row: ActionCallRecord = { at: new Date().toISOString(), capability_id: action.capability_id, version: action.version, provider_id: action.provider_id ?? "",
      provider_title: action.provider_title, title: action.title, actor_id: caller.actor_id, audience: caller.audience ?? "user", project_id: caller.project_id ?? null,
      ok: outcome.ok, ...(outcome.ok ? {} : { ...(outcome.code ? { code: outcome.code } : {}), message: outcome.message }) };
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(row) + "\n", "utf8");
    if (this.lines < 0) this.lines = this.readAll().length; else this.lines++;
    // Keep the file short: once it doubles, rewrite the newest records atomically.
    if (this.lines > KEEP * 2) {
      const kept = this.readAll().slice(-KEEP);
      const temporary = `${this.file}.${process.pid}.tmp`;
      writeFileSync(temporary, kept.map(entry => JSON.stringify(entry)).join("\n") + "\n", "utf8");
      renameSync(temporary, this.file);
      this.lines = kept.length;
    }
  }

  /** Newest first, for one project or for Home (null). */
  list(projectId: string | null, limit = 200): ActionCallRecord[] {
    return this.readAll().filter(row => row.project_id === projectId).reverse().slice(0, limit);
  }

  private readAll(): ActionCallRecord[] {
    let text = "";
    try { text = readFileSync(this.file, "utf8"); } catch { return []; }
    return text.split("\n").flatMap(line => {
      if (!line.trim()) return [];
      try { return [JSON.parse(line) as ActionCallRecord]; } catch { return []; }
    });
  }
}
