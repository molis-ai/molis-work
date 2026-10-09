import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * One record per round that used the computer (specs/computer-use goal §5–6): the goal, the steps in time order with
 * each step's redacted screenshot and receipt, the result and what was left undone.
 *
 * Kept only in this Home, under `computer/records/<id>/`. Screenshots hold screen content, so they are deleted after the
 * retention period (D07: 30 days) while the steps' words stay; the person may delete a whole record at any time.
 * Nothing here is indexed for search or memory. What was typed into a password-like field never reaches a record (the
 * driver refuses to type there at all).
 */
export const SCREENSHOT_RETENTION_DAYS = 30;

export type ComputerStepKind = "look" | "act" | "asked" | "allowed" | "declined" | "refused" | "failed" | "note";

export interface ComputerStep {
  readonly at: string;
  readonly kind: ComputerStepKind;
  /** The app the step was about; null before any app was targeted. */
  readonly app: { readonly bundle_id: string; readonly name: string } | null;
  /** What happened, in the person's words. */
  readonly summary: string;
  /** Prologue's receipt for an action: its state, how many times it acted, and why not when it did not. */
  readonly receipt?: { readonly state: string; readonly actions: number; readonly refusal?: string; readonly why?: string };
  /** File name of the step's redacted screenshot in the record folder; dropped when the retention period ends. */
  readonly shot?: string;
  /** Where the step pointed, in points of the shot. */
  readonly point?: { readonly x: number; readonly y: number };
}

export interface ComputerRecord {
  readonly version: 1;
  readonly id: string;
  readonly session_id: string;
  readonly run_id: string | null;
  readonly project_id: string | null;
  readonly goal: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  /** completed / failed / stopped; null while the round runs. */
  readonly outcome: "completed" | "failed" | "stopped" | null;
  readonly conclusion: string;
  readonly unfinished: readonly string[];
  readonly steps: readonly ComputerStep[];
  /** Set when the screenshots were removed at the end of the retention period. */
  readonly shots_removed_at: string | null;
}

const MAX_STEPS = 400;

export class ComputerRecords {
  private readonly root: string;

  constructor(homeDirectory: string) {
    this.root = path.join(homeDirectory, "computer", "records");
  }

  private folder(id: string): string {
    if (!/^[a-z0-9-]{8,80}$/u.test(id)) throw new Error("记录编号不对");
    return path.join(this.root, id);
  }

  private save(record: ComputerRecord): ComputerRecord {
    const folder = this.folder(record.id);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const file = path.join(folder, "record.json");
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
    fs.renameSync(temp, file);
    return record;
  }

  start(input: { readonly session_id: string; readonly run_id: string | null; readonly project_id: string | null; readonly goal: string }): ComputerRecord {
    return this.save({ version: 1, id: randomUUID(), session_id: input.session_id, run_id: input.run_id, project_id: input.project_id,
      goal: input.goal.slice(0, 4_000), started_at: new Date().toISOString(), ended_at: null, outcome: null, conclusion: "", unfinished: [],
      steps: [], shots_removed_at: null });
  }

  get(id: string): ComputerRecord | null {
    try { return JSON.parse(fs.readFileSync(path.join(this.folder(id), "record.json"), "utf8")) as ComputerRecord; } catch { return null; }
  }

  list(filter: { readonly session_id?: string } = {}): readonly ComputerRecord[] {
    let names: string[];
    try { names = fs.readdirSync(this.root); } catch { return []; }
    return names.map(name => this.get(name)).filter((record): record is ComputerRecord => !!record
      && (filter.session_id === undefined || record.session_id === filter.session_id))
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }

  /** Adds a step, with its redacted screenshot when there is one. Beyond the step limit only the words are kept. */
  step(id: string, step: Omit<ComputerStep, "at" | "shot">, png?: Uint8Array): ComputerRecord | null {
    const record = this.get(id);
    if (!record || record.ended_at) return record;
    let shot: string | undefined;
    if (png && record.steps.length < MAX_STEPS) {
      shot = `${String(record.steps.length + 1).padStart(3, "0")}.png`;
      fs.writeFileSync(path.join(this.folder(id), shot), png, { mode: 0o600 });
    }
    const next: ComputerStep = { ...step, at: new Date().toISOString(), ...(shot ? { shot } : {}) };
    return this.save({ ...record, steps: [...record.steps, next].slice(-MAX_STEPS) });
  }

  finish(id: string, input: { readonly outcome: "completed" | "failed" | "stopped"; readonly conclusion: string; readonly unfinished: readonly string[] }): ComputerRecord | null {
    const record = this.get(id);
    if (!record || record.ended_at) return record;
    return this.save({ ...record, ended_at: new Date().toISOString(), outcome: input.outcome, conclusion: input.conclusion.slice(0, 4_000),
      unfinished: input.unfinished.slice(0, 50) });
  }

  /** The bytes of one screenshot of a record; null when it is gone (deleted, or past the retention period). */
  shot(id: string, name: string): Buffer | null {
    if (!/^\d{3}\.png$/u.test(name)) return null;
    try { return fs.readFileSync(path.join(this.folder(id), name)); } catch { return null; }
  }

  remove(id: string): boolean {
    const folder = this.folder(id);
    if (!fs.existsSync(folder)) return false;
    fs.rmSync(folder, { recursive: true, force: true });
    return true;
  }

  /** Removes screenshots of records that ended more than the retention period ago; the steps' words stay. */
  sweep(now = Date.now(), retentionDays = SCREENSHOT_RETENTION_DAYS): number {
    let removed = 0;
    for (const record of this.list()) {
      if (!record.ended_at || record.shots_removed_at) continue;
      if (now - Date.parse(record.ended_at) < retentionDays * 24 * 60 * 60 * 1000) continue;
      for (const step of record.steps) if (step.shot) { fs.rmSync(path.join(this.folder(record.id), step.shot), { force: true }); removed += 1; }
      this.save({ ...record, steps: record.steps.map(({ shot: _shot, ...rest }) => rest), shots_removed_at: new Date(now).toISOString() });
    }
    return removed;
  }
}
