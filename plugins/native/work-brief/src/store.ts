import { createHash } from "node:crypto";
import type { PluginDatabaseReader, PluginDatabaseTransaction, PluginSqlRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ActionCard } from "@molis-ai/molis-work-plugin-sdk";
import { workBriefErrors } from "./error.js";
import { BRIEF_LIMITS, type BriefBody, type BriefEdit, type BriefFixed, type BriefProposal, type BriefRecord, type BriefScope, type BriefVersion, type BriefVersionHead,
  type NextMark, type NextMarkState, type ProducedBy, type ProposalConflict } from "./model.js";

const text = (value: unknown) => String(value ?? "");
const parse = <T>(value: unknown, fallback: T): T => typeof value === "string" && value ? JSON.parse(value) as T : fallback;

/** Deterministic id for a singleton brief (home per project, personal per person), so offline devices share one sync key. */
export function singletonBriefId(scope: "home" | "personal", ownerId: string): string {
  return `brief-${scope}-${createHash("sha256").update(ownerId).digest("hex").slice(0, 32)}`;
}

function briefOf(row: PluginSqlRow): BriefRecord {
  return { brief_id: text(row.id), project_id: text(row.project_id), scope: text(row.scope) as BriefScope, title: text(row.title), current_version: Number(row.current_version),
    revision: Number(row.version), created_at: text(row.created_at), updated_at: text(row.updated_at), fixed: parse<Record<string, BriefFixed>>(row.fixed_json, {}) };
}
function headOf(row: PluginSqlRow, fixed: Record<string, BriefFixed>): BriefVersionHead {
  return { version: Number(row.version), base_version: row.base_version === null ? null : Number(row.base_version), as_of: text(row.as_of), created_at: text(row.created_at),
    produced_by: parse<ProducedBy>(row.produced_by_json, { kind: "person" }), fixed: fixed[String(row.version)] ?? null };
}

/**
 * Work Brief's rows, read through whichever connection the caller holds (the library for a read, a transaction for a write).
 * `projectId` is the trusted scope of the half that opened it: a project's half reaches only its project's briefs; the Home half
 * (`projectId` null) reaches the briefs of the projects it is told the person reaches, and that person's own brief.
 */
export class BriefStore {
  constructor(private readonly db: PluginDatabaseReader | PluginDatabaseTransaction, private readonly projectId: string | null) {}

  private get tx(): PluginDatabaseTransaction {
    if (!("run" in this.db)) throw workBriefErrors.unavailable("简报的读取不写入");
    return this.db;
  }

  /** The briefs of this half's project, newest change first; the project's own (home) brief leads. */
  list(): BriefRecord[] {
    if (!this.projectId) return [];
    return this.db.all("SELECT * FROM briefs WHERE project_id = ? AND scope != 'personal' ORDER BY scope = 'home' DESC, updated_at DESC, id", [this.projectId]).map(briefOf);
  }
  find(briefId: string): BriefRecord | null {
    const row = this.projectId ? this.db.get("SELECT * FROM briefs WHERE id = ? AND project_id = ? AND scope != 'personal'", [briefId, this.projectId]) : null;
    return row ? briefOf(row) : null;
  }
  get(briefId: string): BriefRecord {
    const brief = this.find(briefId);
    if (!brief) throw workBriefErrors.not_found("这份简报已不存在", { brief_id: briefId });
    return brief;
  }
  home(): BriefRecord | null {
    const row = this.projectId ? this.db.get("SELECT * FROM briefs WHERE project_id = ? AND scope = 'home'", [this.projectId]) : null;
    return row ? briefOf(row) : null;
  }
  /** The person's own brief; only the Home half asks. */
  personal(actorId: string): BriefRecord | null {
    const row = this.db.get("SELECT * FROM briefs WHERE actor_id = ? AND scope = 'personal'", [actorId]);
    return row ? briefOf(row) : null;
  }
  /** The home briefs of the given projects (the person's reach), for the personal brief. */
  homesOf(projectIds: readonly string[]): BriefRecord[] {
    return projectIds.flatMap(projectId => {
      const row = this.db.get("SELECT * FROM briefs WHERE project_id = ? AND scope = 'home'", [projectId]);
      return row ? [briefOf(row)] : [];
    });
  }

  /** Deterministic id for this store's singleton home or personal brief. */
  singletonId(scope: "home" | "personal", actorId?: string): string {
    return singletonBriefId(scope, scope === "personal" ? actorId ?? "" : this.projectId ?? "");
  }
  create(input: { brief_id: string; scope: BriefScope; title: string; actor_id?: string }, at: string): BriefRecord {
    this.tx.run("INSERT INTO briefs (id, project_id, actor_id, scope, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [input.brief_id, input.scope === "personal" ? "" : this.projectId ?? "", input.actor_id ?? "", input.scope, input.title, at, at]);
    return briefOf(this.db.get("SELECT * FROM briefs WHERE id = ?", [input.brief_id])!);
  }

  versions(brief: BriefRecord): BriefVersionHead[] {
    return this.db.all("SELECT version, base_version, as_of, created_at, produced_by_json FROM brief_versions WHERE brief_id = ? ORDER BY version DESC", [brief.brief_id])
      .map(row => headOf(row, brief.fixed));
  }
  version(brief: BriefRecord, version = brief.current_version): BriefVersion | null {
    const row = this.db.get("SELECT * FROM brief_versions WHERE brief_id = ? AND version = ?", [brief.brief_id, version]);
    return row ? { brief_id: brief.brief_id, ...headOf(row, brief.fixed), ...parse<BriefBody>(row.body_json, { sources: [], claims: [], attention: [], next: [] }) } : null;
  }

  /**
   * Appends a version and makes it current, when the brief is still at `expectedRevision`; older versions past the limit go, never
   * a fixed one nor the one before this. Returns the brief as it is now.
   */
  append(brief: BriefRecord, expectedRevision: number, body: BriefBody, producedBy: ProducedBy, at: string, title?: string): BriefRecord {
    const version = Number(this.db.get("SELECT COALESCE(MAX(version), 0) AS top FROM brief_versions WHERE brief_id = ?", [brief.brief_id])?.top ?? 0) + 1;
    const moved = this.tx.run("UPDATE briefs SET current_version = ?, version = version + 1, updated_at = ?, title = ? WHERE id = ? AND version = ?",
      [version, at, title ?? brief.title, brief.brief_id, expectedRevision]);
    if (Number(moved.changes) !== 1) throw workBriefErrors.conflict("简报刚被别处更新，请重新读取后再试", { brief_id: brief.brief_id });
    this.tx.run("INSERT INTO brief_versions (brief_id, version, base_version, as_of, created_at, produced_by_json, body_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [brief.brief_id, version, brief.current_version || null, at, at, JSON.stringify(producedBy), JSON.stringify(body)]);
    const kept = new Set([...Object.keys(brief.fixed).map(Number), version, brief.current_version]);
    const old = this.db.all("SELECT version FROM brief_versions WHERE brief_id = ? ORDER BY version DESC", [brief.brief_id]).map(row => Number(row.version))
      .filter(entry => !kept.has(entry)).slice(BRIEF_LIMITS.versions - 2);
    for (const entry of old) this.tx.run("DELETE FROM brief_versions WHERE brief_id = ? AND version = ?", [brief.brief_id, entry]);
    return briefOf(this.db.get("SELECT * FROM briefs WHERE id = ?", [brief.brief_id])!);
  }

  edits(briefId: string): BriefEdit[] {
    return this.db.all("SELECT * FROM brief_edits WHERE brief_id = ? ORDER BY at, id", [briefId]).map(row => ({ edit_id: text(row.id), claim_id: text(row.claim_id),
      text: row.text === null ? null : text(row.text), base_version: Number(row.base_version), actor_id: text(row.actor_id), at: text(row.at) }));
  }
  /** One open edit per sentence: a later change of the same sentence replaces the earlier one. */
  recordEdit(briefId: string, edit: BriefEdit): void {
    this.tx.run("DELETE FROM brief_edits WHERE brief_id = ? AND claim_id = ?", [briefId, edit.claim_id]);
    this.tx.run("INSERT INTO brief_edits (id, brief_id, claim_id, text, base_version, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [edit.edit_id, briefId, edit.claim_id, edit.text, edit.base_version, edit.actor_id, edit.at]);
  }
  clearEdits(briefId: string, claimIds?: readonly string[]): void {
    if (!claimIds) { this.tx.run("DELETE FROM brief_edits WHERE brief_id = ?", [briefId]); return; }
    for (const claimId of claimIds) this.tx.run("DELETE FROM brief_edits WHERE brief_id = ? AND claim_id = ?", [briefId, claimId]);
  }

  proposal(briefId: string): BriefProposal | null {
    const row = this.db.get("SELECT * FROM brief_proposals WHERE brief_id = ?", [briefId]);
    return row ? { proposal_id: text(row.id), base_version: Number(row.base_version), created_at: text(row.created_at), produced_by: parse<ProducedBy>(row.produced_by_json, { kind: "assistant" }),
      body: parse<BriefBody>(row.body_json, { sources: [], claims: [], attention: [], next: [] }), conflicts: parse<ProposalConflict[]>(row.conflicts_json, []) } : null;
  }
  putProposal(briefId: string, proposal: BriefProposal): void {
    this.tx.run("INSERT INTO brief_proposals (id, brief_id, base_version, created_at, produced_by_json, body_json, conflicts_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [proposal.proposal_id, briefId, proposal.base_version, proposal.created_at, JSON.stringify(proposal.produced_by), JSON.stringify(proposal.body), JSON.stringify(proposal.conflicts)]);
  }
  dropProposal(briefId: string): void { this.tx.run("DELETE FROM brief_proposals WHERE brief_id = ?", [briefId]); }

  marks(briefId: string): NextMark[] {
    return this.db.all("SELECT * FROM brief_next_marks WHERE brief_id = ? ORDER BY at, option_id", [briefId]).map(row => ({ option_id: text(row.option_id),
      state: text(row.state) as NextMarkState, ...(row.card_json ? { card: parse<ActionCard | undefined>(row.card_json, undefined) } : {}), actor_id: text(row.actor_id), at: text(row.at) }));
  }
  mark(briefId: string, mark: NextMark | { option_id: string; state: null }): void {
    this.tx.run("DELETE FROM brief_next_marks WHERE brief_id = ? AND option_id = ?", [briefId, mark.option_id]);
    if (mark.state === null) return;
    this.tx.run("INSERT INTO brief_next_marks (brief_id, option_id, state, card_json, actor_id, at) VALUES (?, ?, ?, ?, ?, ?)",
      [briefId, mark.option_id, mark.state, mark.card ? JSON.stringify(mark.card) : null, mark.actor_id, mark.at]);
  }

  /** A request already answered returns its answer; the same id with another body is refused, so a retry never lands a second version. */
  answered<T>(actorId: string, requestId: string, hash: string): T | null {
    const row = this.db.get("SELECT request_hash, result_json FROM brief_requests WHERE project_id = ? AND actor_id = ? AND request_id = ?", [this.projectId ?? "", actorId, requestId]);
    if (!row) return null;
    if (text(row.request_hash) !== hash) throw workBriefErrors.conflict("这个 request_id 已用于另一份草稿", { request_id: requestId });
    return parse<T | null>(row.result_json, null);
  }
  answer(actorId: string, requestId: string, hash: string, result: unknown, at: string): void {
    this.tx.run("INSERT INTO brief_requests (project_id, actor_id, request_id, request_hash, result_json, at) VALUES (?, ?, ?, ?, ?, ?)",
      [this.projectId ?? "", actorId, requestId, hash, JSON.stringify(result), at]);
  }
}
