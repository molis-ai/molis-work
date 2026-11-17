import { randomUUID } from "node:crypto";
import { rollbackPreservingError, type openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { SKILL_DISCARDED_KEPT_DAYS, type SkillAuthoredFields, type SkillCase, type SkillCaseFields, type SkillDraftOrigin, type SkillDraftTarget,
  type SkillSourceRef, type SkillTrial } from "@molis-ai/molis-work-contracts/services/skills";

// Drafts of Skills, their known answers, replays and the copies' sources (batch 42, specs/skill-packs/authoring-path-design.md §3): four
// tables of the Agent definitions store, read and written only here. A draft is used by no round; the Skill itself is the scope's
// package of own Skills, which the install service keeps. `scope_ref` is a scope as `skill_settings` writes it: `home` or a project id.

type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

/** The four tables, as the store's baseline creates them and as the 2 → 3 step adds them (the step only creates them, empty). */
export const SKILL_WORK_TABLES_SQL = `
CREATE TABLE skill_drafts (
  draft_id TEXT PRIMARY KEY, scope_ref TEXT NOT NULL, target TEXT NOT NULL, fields TEXT NOT NULL, replacements TEXT NOT NULL, revision INTEGER NOT NULL,
  origin TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL, discarded_at TEXT
);
CREATE INDEX skill_drafts_by_scope ON skill_drafts(scope_ref, discarded_at);
CREATE TABLE skill_cases (
  case_id TEXT PRIMARY KEY, owner_ref TEXT NOT NULL, title TEXT NOT NULL, task TEXT NOT NULL, material TEXT, expected TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX skill_cases_by_owner ON skill_cases(owner_ref, created_at);
CREATE TABLE skill_trials (
  trial_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, draft_revision INTEGER NOT NULL, case_id TEXT NOT NULL, cells TEXT NOT NULL, verdict TEXT NOT NULL,
  ran_at TEXT NOT NULL, actor_id TEXT NOT NULL
);
CREATE INDEX skill_trials_by_draft ON skill_trials(draft_id, ran_at);
CREATE TABLE skill_lineage (
  scope_ref TEXT NOT NULL, skill_id TEXT NOT NULL, source TEXT NOT NULL, replacements TEXT NOT NULL, seen_version INTEGER NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (scope_ref, skill_id)
);`;

/** A stored draft, its JSON columns read back. */
export interface StoredSkillDraft {
  draft_id: string;
  scope_ref: string;
  target: SkillDraftTarget;
  fields: SkillAuthoredFields;
  replacements: Record<string, string>;
  revision: number;
  origin: SkillDraftOrigin;
  created_at: string;
  updated_at: string;
  actor_id: string;
  discarded_at?: string;
}
/** A copy's source, the placeholders it replaced, and the source's version the person last looked at and left. */
export interface SkillLineage {
  scope_ref: string;
  skill_id: string;
  source: SkillSourceRef;
  replacements: Record<string, string>;
  seen_version: number;
}

/** Replays kept per draft: the latest is what adopting checks; a few before it are kept for nothing else, so they go. */
const TRIALS_KEPT = 5;
/** Whose known answers these are: a draft's, or an adopted Skill's (kept with it for the next draft of it). */
/** The known answers with no replay on this revision: adopting waits for each (S-skill-authoring). */
export const untriedCases = (cases: readonly { case_id: string }[], trials: readonly { case_id: string }[]) =>
  cases.filter(item => !trials.some(trial => trial.case_id === item.case_id)).map(item => item.case_id);

export const draftCases = (draftId: string) => `draft:${draftId}`;
export const skillCases = (scopeRef: string, skillId: string) => `skill:${scopeRef}/${skillId}`;

type Row = Record<string, string | number | null>;
const draftOf = (row: Row): StoredSkillDraft => ({ draft_id: row.draft_id as string, scope_ref: row.scope_ref as string, target: JSON.parse(row.target as string),
  fields: JSON.parse(row.fields as string), replacements: JSON.parse(row.replacements as string), revision: Number(row.revision), origin: JSON.parse(row.origin as string),
  created_at: row.created_at as string, updated_at: row.updated_at as string, actor_id: row.actor_id as string, ...(row.discarded_at ? { discarded_at: row.discarded_at as string } : {}) });
const caseOf = (row: Row): SkillCase => ({ case_id: row.case_id as string, title: row.title as string, task: row.task as string,
  ...(row.material ? { material: row.material as string } : {}), expected: row.expected as string, origin: row.origin as SkillCase["origin"] });

export class SkillDraftStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => Date) {}

  private transaction<Result>(work: () => Result): Result {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; } catch (error) { rollbackPreservingError(error, () => this.db.exec("ROLLBACK")); throw error; }
  }

  /** One draft, discarded or not; a discarded one past its keeping is gone (removed by the next write, read as gone now). */
  draft(draftId: string): StoredSkillDraft | undefined {
    const row = this.db.prepare("SELECT * FROM skill_drafts WHERE draft_id = ? AND (discarded_at IS NULL OR discarded_at >= ?)").get(draftId, this.keptSince()) as Row | undefined;
    return row && draftOf(row);
  }

  /** The open drafts of these scopes, newest change first. */
  drafts(scopeRefs: readonly string[]): StoredSkillDraft[] {
    if (!scopeRefs.length) return [];
    return (this.db.prepare(`SELECT * FROM skill_drafts WHERE discarded_at IS NULL AND scope_ref IN (${scopeRefs.map(() => "?").join(",")}) ORDER BY updated_at DESC`)
      .all(...scopeRefs) as Row[]).map(draftOf);
  }

  /** A new draft at revision 1, with its known answers (copied from an adopted Skill's, or the one given). */
  create(input: { scope_ref: string; target: SkillDraftTarget; fields: SkillAuthoredFields; replacements: Record<string, string>; origin: SkillDraftOrigin; actor_id: string;
    cases: ReadonlyArray<SkillCaseFields & { origin: SkillCase["origin"] }> }): StoredSkillDraft {
    const at = this.now().toISOString(), draftId = `draft-${randomUUID()}`;
    this.purge();
    return this.transaction(() => {
      this.db.prepare("INSERT INTO skill_drafts(draft_id,scope_ref,target,fields,replacements,revision,origin,created_at,updated_at,actor_id) VALUES (?,?,?,?,?,1,?,?,?,?)")
        .run(draftId, input.scope_ref, JSON.stringify(input.target), JSON.stringify(input.fields), JSON.stringify(input.replacements), JSON.stringify(input.origin), at, at, input.actor_id);
      for (const item of input.cases) this.insertCase(draftCases(draftId), item, item.origin, at);
      return this.draft(draftId)!;
    });
  }

  /**
   * The draft's next revision against the revision read: its fields, the target it was brought to, and the placeholders it replaced.
   * `missing` for a draft that is not open.
   */
  update(draftId: string, expected: number, change: { fields: SkillAuthoredFields; replacements?: Record<string, string>; target?: SkillDraftTarget }, actorId: string):
    StoredSkillDraft | "conflict" | "missing" {
    const current = this.draft(draftId);
    if (!current || current.discarded_at) return "missing";
    if (current.revision !== expected) return "conflict";
    const at = this.now().toISOString();
    const changed = this.db.prepare("UPDATE skill_drafts SET fields = ?, replacements = ?, target = ?, revision = revision + 1, updated_at = ?, actor_id = ? WHERE draft_id = ? AND revision = ?")
      .run(JSON.stringify(change.fields), JSON.stringify(change.replacements ?? current.replacements), JSON.stringify(change.target ?? current.target), at, actorId, draftId, expected);
    return Number(changed.changes) === 1 ? this.draft(draftId)! : "conflict";
  }

  /** Discards a draft, or takes a discarded one back while it is kept. Answers whether it is discarded now; `missing` when there is none. */
  discard(draftId: string, restore: boolean): boolean | "missing" {
    this.purge();
    const current = this.draft(draftId);
    if (!current) return "missing";
    this.db.prepare("UPDATE skill_drafts SET discarded_at = ? WHERE draft_id = ?").run(restore ? null : current.discarded_at ?? this.now().toISOString(), draftId);
    return !restore;
  }

  /** An adopted draft is gone; its known answers become the Skill's, in place of those it had. */
  adopted(draftId: string, scopeRef: string, skillId: string, lineage?: Omit<SkillLineage, "scope_ref" | "skill_id">): void {
    this.transaction(() => {
      const owner = skillCases(scopeRef, skillId);
      this.db.prepare("DELETE FROM skill_cases WHERE owner_ref = ?").run(owner);
      this.db.prepare("UPDATE skill_cases SET owner_ref = ? WHERE owner_ref = ?").run(owner, draftCases(draftId));
      this.db.prepare("DELETE FROM skill_trials WHERE draft_id = ?").run(draftId);
      this.db.prepare("DELETE FROM skill_drafts WHERE draft_id = ?").run(draftId);
      if (lineage) {
        this.db.prepare(`INSERT INTO skill_lineage(scope_ref,skill_id,source,replacements,seen_version,updated_at) VALUES (?,?,?,?,?,?)
          ON CONFLICT(scope_ref,skill_id) DO UPDATE SET source=excluded.source, replacements=excluded.replacements, seen_version=excluded.seen_version, updated_at=excluded.updated_at`)
          .run(scopeRef, skillId, JSON.stringify(lineage.source), JSON.stringify(lineage.replacements), lineage.seen_version, this.now().toISOString());
      }
    });
  }

  /**
   * A Skill of one's own that is taken away leaves no known answers and no source behind. Its open drafts stay in the drafts list for
   * the person to read and discard; adopting one is refused (`skills.authored_unknown`), since the Skill it changes is gone.
   */
  forgetSkill(scopeRef: string, skillId: string): void {
    this.db.prepare("DELETE FROM skill_cases WHERE owner_ref = ?").run(skillCases(scopeRef, skillId));
    this.db.prepare("DELETE FROM skill_lineage WHERE scope_ref = ? AND skill_id = ?").run(scopeRef, skillId);
  }

  cases(owner: string): SkillCase[] {
    return (this.db.prepare("SELECT * FROM skill_cases WHERE owner_ref = ? ORDER BY created_at, case_id").all(owner) as Row[]).map(caseOf);
  }

  private insertCase(owner: string, fields: SkillCaseFields, origin: SkillCase["origin"], at: string, caseId = `case-${randomUUID()}`): string {
    this.db.prepare("INSERT INTO skill_cases(case_id,owner_ref,title,task,material,expected,origin,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(caseId, owner, fields.title, fields.task, fields.material ?? null, fields.expected, origin, at);
    return caseId;
  }

  /** Adds a known answer to a draft, or changes one of its own; `missing` when `case_id` is not the draft's. */
  putCase(draftId: string, fields: SkillCaseFields, caseId?: string): SkillCase | "missing" {
    const owner = draftCases(draftId);
    if (caseId) {
      const changed = this.db.prepare("UPDATE skill_cases SET title = ?, task = ?, material = ?, expected = ? WHERE case_id = ? AND owner_ref = ?")
        .run(fields.title, fields.task, fields.material ?? null, fields.expected, caseId, owner);
      if (Number(changed.changes) !== 1) return "missing";
      // A changed known answer is a new question: the replays of the old one say nothing of it.
      this.db.prepare("DELETE FROM skill_trials WHERE draft_id = ? AND case_id = ?").run(draftId, caseId);
      return this.cases(owner).find(item => item.case_id === caseId)!;
    }
    const id = this.insertCase(owner, fields, "person", this.now().toISOString());
    return this.cases(owner).find(item => item.case_id === id)!;
  }

  removeCase(draftId: string, caseId: string): boolean {
    const removed = this.db.prepare("DELETE FROM skill_cases WHERE case_id = ? AND owner_ref = ?").run(caseId, draftCases(draftId));
    this.db.prepare("DELETE FROM skill_trials WHERE draft_id = ? AND case_id = ?").run(draftId, caseId);
    return Number(removed.changes) === 1;
  }

  /** Keeps a replay, unless the draft moved past the revision it replayed while the model answered (`conflict`) or is gone (`missing`). */
  recordTrial(draftId: string, trial: Omit<SkillTrial, "trial_id">, actorId: string): SkillTrial | "conflict" | "missing" {
    return this.transaction(() => {
      const current = this.draft(draftId);
      if (!current || current.discarded_at) return "missing";
      if (current.revision !== trial.draft_revision) return "conflict";
      if (!this.cases(draftCases(draftId)).some(item => item.case_id === trial.case_id)) return "missing";
      const trialId = `trial-${randomUUID()}`;
      this.db.prepare("INSERT INTO skill_trials(trial_id,draft_id,draft_revision,case_id,cells,verdict,ran_at,actor_id) VALUES (?,?,?,?,?,?,?,?)")
        .run(trialId, draftId, trial.draft_revision, trial.case_id, JSON.stringify(trial.cells), trial.verdict, trial.ran_at, actorId);
      this.db.prepare("DELETE FROM skill_trials WHERE draft_id = ? AND trial_id NOT IN (SELECT trial_id FROM skill_trials WHERE draft_id = ? ORDER BY ran_at DESC, rowid DESC LIMIT ?)")
        .run(draftId, draftId, TRIALS_KEPT);
      return { trial_id: trialId, ...trial };
    });
  }

  latestTrial(draftId: string): SkillTrial | undefined {
    const row = this.db.prepare("SELECT * FROM skill_trials WHERE draft_id = ? ORDER BY ran_at DESC, rowid DESC LIMIT 1").get(draftId) as Row | undefined;
    return row && { trial_id: row.trial_id as string, draft_revision: Number(row.draft_revision), case_id: row.case_id as string, ran_at: row.ran_at as string,
      cells: JSON.parse(row.cells as string), verdict: row.verdict as SkillTrial["verdict"] };
  }

  /** The replays of one revision, newest first: adopting checks that every known answer was replayed on it. */
  trialsOf(draftId: string, revision: number): SkillTrial[] {
    return (this.db.prepare("SELECT * FROM skill_trials WHERE draft_id = ? AND draft_revision = ? ORDER BY ran_at DESC, rowid DESC").all(draftId, revision) as Row[])
      .map(row => ({ trial_id: row.trial_id as string, draft_revision: Number(row.draft_revision), case_id: row.case_id as string, ran_at: row.ran_at as string,
        cells: JSON.parse(row.cells as string), verdict: row.verdict as SkillTrial["verdict"] }));
  }

  lineage(scopeRef: string): SkillLineage[] {
    return (this.db.prepare("SELECT * FROM skill_lineage WHERE scope_ref = ?").all(scopeRef) as Row[]).map(row => ({ scope_ref: row.scope_ref as string, skill_id: row.skill_id as string,
      source: JSON.parse(row.source as string), replacements: JSON.parse(row.replacements as string), seen_version: Number(row.seen_version) }));
  }

  lineageOf(scopeRef: string, skillId: string): SkillLineage | undefined {
    return this.lineage(scopeRef).find(row => row.skill_id === skillId);
  }

  /** Records the source's version the person looked at and left; never lowers it. `missing` for a Skill that is no copy. */
  dismiss(scopeRef: string, skillId: string, version: number): number | "missing" {
    const current = this.lineageOf(scopeRef, skillId);
    if (!current) return "missing";
    const seen = Math.max(current.seen_version, version);
    this.db.prepare("UPDATE skill_lineage SET seen_version = ?, updated_at = ? WHERE scope_ref = ? AND skill_id = ?").run(seen, this.now().toISOString(), scopeRef, skillId);
    return seen;
  }

  /** When a discarded draft kept since then is still kept. */
  private keptSince(): string { return new Date(this.now().getTime() - SKILL_DISCARDED_KEPT_DAYS * 86_400_000).toISOString(); }

  /** Discarded drafts past their keeping leave with their known answers and replays; run by the writes, reads only leave them out. */
  private purge(): void {
    const before = this.keptSince();
    const gone = (this.db.prepare("SELECT draft_id FROM skill_drafts WHERE discarded_at IS NOT NULL AND discarded_at < ?").all(before) as Array<{ draft_id: string }>).map(row => row.draft_id);
    for (const id of gone) {
      this.db.prepare("DELETE FROM skill_cases WHERE owner_ref = ?").run(draftCases(id));
      this.db.prepare("DELETE FROM skill_trials WHERE draft_id = ?").run(id);
      this.db.prepare("DELETE FROM skill_drafts WHERE draft_id = ?").run(id);
    }
  }
}
