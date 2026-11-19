import { createHash } from "node:crypto";
import type { AcceptanceGap, AcceptanceHandoverSubject, AcceptanceTier } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { GOALS_PLUGIN_ID } from "./identity.js";
import { goalDecisionOutcomeDigest, readGoalApprovalOutcome } from "./approval-outcomes.js";
import { GOALS_REQUIREMENT_LINKS_SQL } from "./project-database-event-facts.js";
import { GOALS_V6_CLOSURES_SQL, GOALS_V6_DECISION_REQUESTS_SQL } from "./project-database-event-state.js";

/*
 * Goals' requirements, judgments and conclusions handed to the platform's requirements and acceptance, in the project library's 5→6 step
 * and nowhere else (contract-design §10.4; CONTRACT-CHANGES 「当前保留机制」, a migration exception beside PEQ-03's whitelist). Only Goals
 * reads and writes its own tables here. `compute` reads them and works out, with the rules Goals used up to v5 (frozen below, as
 * `readCurrentGoalEventRequirements` and `requirementSatisfaction` had them), the platform rows and what Goals read of each requirement;
 * `finish` leaves Goals' tables as its v6 declaration. Remove both, and this file, once the earliest supported golden already has the
 * platform's tables.
 */

interface Db {
  exec(sql: string): unknown;
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
}
type Row = Record<string, unknown>;
interface Requirement { requirement_id: string; goal_id: string; statement: string; bound_type_id: string | null; created_at: string; created_in_config_version: number; actor_id: string;
  source_json: string | null; human: boolean; retired: boolean; revision: number; valid_after: number }
interface Judgment { event_id: string; goal_id: string; requirement_id: string; verdict: "supports" | "contradicts" | "unknown"; basis: Basis | null; tier: string; gap: string | null;
  reporter_session: string | null; actor_id: string; received_at: string; seq: number }
interface Basis { checked: { artifact_id: string; version: number }; method: string; observed: string; evidence?: Array<{ kind: string; [key: string]: unknown }> }
interface Conclusion { decision_id: string; goal_id: string; requirement_id: string; verdict: "accepted" | "rejected"; actor_id: string; received_at: string; seq: number;
  checked: { artifact_id: string; version: number } | null; note: string | null; governance_decision_id: string }
interface Round { seq: number; version: string; actor_id: string; at: string; touches: Set<string> }

const SYSTEM = "system:upgrade";
const text = (value: unknown) => String(value);
const sameChecked = (a: Conclusion["checked"], b: Basis["checked"] | null) => a !== null && b !== null && a.artifact_id === b.artifact_id && a.version === b.version;
const TIERS: Record<string, AcceptanceTier> = { self_reported: "self_reported", machine_verified: "machine_checked", peer_reviewed: "peer_reviewed" };
const GAPS: Record<string, AcceptanceGap> = { evidence_missing: "evidence_missing", evidence_unreadable: "evidence_unreadable", subject_mismatch: "wrong_object", check_failed: "check_failed" };
/** What a judgment without a basis said, in the platform's words: Goals kept no method or observation for it. */
const UNSTATED = { method: "（Goals 的报告没有写核对方法）", observed: "（Goals 的报告没有写看到了什么）" };

function load(db: Db, projectId: string) {
  const requirements = (db.prepare("SELECT * FROM goal_event_requirements WHERE project_id = ? ORDER BY goal_id, requirement_id").all(projectId) as Row[]).map((row): Requirement => ({
    requirement_id: text(row.requirement_id), goal_id: text(row.goal_id), statement: text(row.statement), bound_type_id: row.bound_type_id == null ? null : text(row.bound_type_id),
    created_at: text(row.created_at), created_in_config_version: Number(row.created_in_config_version), actor_id: text(row.actor_id), source_json: row.source_json == null ? null : text(row.source_json),
    human: Number(row.human_decision_required) === 1, retired: row.current_status === "retired", revision: Number(row.revision), valid_after: Number(row.support_valid_after_seq) }));
  const judgments = (db.prepare(`SELECT j.*, e.goal_id, e.actor_id, e.received_at, e.journal_seq FROM goal_work_event_judgments j JOIN goal_work_events e ON e.event_id = j.event_id
    WHERE e.project_id = ? AND e.kind = 'report' ORDER BY e.journal_seq, e.event_id, j.requirement_id`).all(projectId) as Row[]).map((row): Judgment => ({
    event_id: text(row.event_id), goal_id: text(row.goal_id), requirement_id: text(row.requirement_id), verdict: row.verdict as Judgment["verdict"],
    basis: row.basis_json == null ? null : JSON.parse(text(row.basis_json)) as Basis, tier: text(row.tier), gap: row.gap == null ? null : text(row.gap),
    reporter_session: row.reporter_session == null ? null : text(row.reporter_session), actor_id: text(row.actor_id), received_at: text(row.received_at), seq: Number(row.journal_seq) }));
  const conclusions = (db.prepare(`SELECT c.*, d.conclusion, d.governance_decision_id FROM goal_event_requirement_conclusions c JOIN goal_event_applied_decisions d ON d.decision_id = c.decision_id
    WHERE c.project_id = ? ORDER BY c.journal_seq, c.decision_id`).all(projectId) as Row[]).map((row): Conclusion => ({
    decision_id: text(row.decision_id), goal_id: text(row.goal_id), requirement_id: text(row.requirement_id), verdict: row.verdict as Conclusion["verdict"], actor_id: text(row.actor_id),
    received_at: text(row.received_at), seq: Number(row.journal_seq), checked: row.checked_artifact_id == null ? null : { artifact_id: text(row.checked_artifact_id), version: Number(row.checked_version) },
    note: row.conclusion == null ? null : text(row.conclusion), governance_decision_id: text(row.governance_decision_id) }));
  return { requirements, judgments, conclusions };
}

/**
 * Goals' own reading of one current requirement, as v5 had it: the latest report after the requirement last changed, the latest conclusion
 * after it, whether a later report moved off the version the conclusion was about (superseded) or said `contradicts`/`unknown` after it
 * (withdrawn, user 2026-11-05), and so whether it stands and whether the requirement is satisfied. The deliverables condition is read as
 * met: this step cannot read the 成果库, and the platform does not weigh it (§10.9 question 7).
 */
function goalsReading(requirement: Requirement, judgments: readonly Judgment[], conclusions: readonly Conclusion[]) {
  const mine = judgments.filter(row => row.requirement_id === requirement.requirement_id);
  const latest = mine.at(-1) ?? null, report = latest && latest.seq > requirement.valid_after ? latest : null;
  const withdrawing = [...mine].reverse().find(row => row.verdict !== "supports")?.seq ?? null;
  const lastConclusion = conclusions.filter(row => row.requirement_id === requirement.requirement_id).at(-1) ?? null;
  const conclusion = lastConclusion && lastConclusion.seq > requirement.valid_after ? lastConclusion : null;
  const checked = report?.basis?.checked ?? null;
  const superseded = Boolean(conclusion && checked && report && report.seq > conclusion.seq && !sameChecked(conclusion.checked, checked));
  const accepted = conclusion?.verdict === "accepted" && !superseded && (withdrawing === null || withdrawing < conclusion.seq);
  const verified = report?.verdict === "supports" && report.tier !== "self_reported" && checked !== null && !requirement.human && (conclusion?.verdict !== "rejected" || superseded);
  const stands = conclusion !== null && !superseded && (conclusion.verdict === "rejected" || accepted);
  const reportAfter = [...mine].reverse().find(row => row.seq > requirement.valid_after) ?? null;
  return { satisfied: accepted || verified, standing: stands ? conclusion : null, reportAfter };
}

/** Where a requirement came from, as Goals stored it; only an imported acceptance criterion's pass condition is used. */
function origin(json: string | null): { kind?: unknown; pass_condition?: unknown } | null {
  try { const value: unknown = json ? JSON.parse(json) : null; return value && typeof value === "object" ? value as { kind?: unknown; pass_condition?: unknown } : null; } catch { return null; }
}

const checkId = (projectId: string, eventId: string, requirementId: string) =>
  "goal-check:" + createHash("sha256").update(JSON.stringify([projectId, eventId, requirementId])).digest("hex");

/** The platform rows for every Goal with requirements, worked out from Goals' own tables; reads only. */
export function computeAcceptanceHandover(db: Db, projectId: string): AcceptanceHandoverSubject[] {
  // A row of any other project: the library is not what this step knows, and the upgrade stops with it as it was (§10.4 step 9).
  const strays = db.prepare(`SELECT (SELECT count(*) FROM goal_event_requirements WHERE project_id <> ?1)
    + (SELECT count(*) FROM goal_event_requirement_conclusions WHERE project_id <> ?1)
    + (SELECT count(*) FROM goal_work_event_judgments j JOIN goal_work_events e ON e.event_id = j.event_id WHERE e.project_id <> ?1) AS n`).get(projectId) as Row;
  if (Number(strays.n) !== 0) throw new Error("Goals 的要求、判断或结论里有不属于这个项目的行，项目库不升级");
  const all = load(db, projectId), out: AcceptanceHandoverSubject[] = [];
  const eventAt = (seq: number) => (db.prepare("SELECT received_at FROM goal_work_events WHERE project_id = ? AND journal_seq = ?").get(projectId, seq) as Row | undefined)?.received_at;
  for (const goalId of [...new Set(all.requirements.map(row => row.goal_id))]) {
    const requirements = all.requirements.filter(row => row.goal_id === goalId);
    const judgments = all.judgments.filter(row => row.goal_id === goalId), conclusions = all.conclusions.filter(row => row.goal_id === goalId);
    const rounds = new Map<number, Round>();
    const round = (seq: number, version: string, actor: string, at: string) => { if (!rounds.has(seq)) rounds.set(seq, { seq, version, actor_id: actor, at, touches: new Set() }); return rounds.get(seq)!; };
    for (const row of judgments) round(row.seq, `goal-event:${row.event_id}`, row.actor_id, row.received_at);
    const readings = new Map(requirements.map(row => [row.requirement_id, goalsReading(row, judgments, conclusions)]));
    const atOrBefore = (seq: number) => [...rounds.values()].filter(item => item.seq <= seq).sort((a, b) => b.seq - a.seq)[0] ?? null;
    const agreement = (requirement: Requirement) => round(requirement.valid_after, `goal-agreement:${requirement.valid_after}`, SYSTEM, text(eventAt(requirement.valid_after) ?? requirement.created_at));
    // The rounds a requirement needs beyond its reports: where it last changed, when nothing after that stands on a later round.
    for (const requirement of requirements) {
      if (requirement.retired || requirement.valid_after === 0) continue;
      const { standing, reportAfter } = readings.get(requirement.requirement_id)!;
      const before = standing ? atOrBefore(standing.seq) : null;
      if (standing ? before === null || before.seq < requirement.valid_after : reportAfter === null) agreement(requirement);
    }
    for (const row of conclusions) if (atOrBefore(row.seq) === null) round(row.seq, `goal-decision:${row.decision_id}`, SYSTEM, row.received_at);
    const ordered = [...rounds.values()].sort((a, b) => a.seq - b.seq);
    const number = new Map(ordered.map((item, index) => [item.seq, index + 1]));
    // Where each current requirement stands: the round of its standing conclusion, else its latest report, else where it last changed.
    const anchor = new Map<string, Round>();
    for (const requirement of requirements) {
      if (requirement.retired) continue;
      const { standing, reportAfter } = readings.get(requirement.requirement_id)!;
      const at = standing ? atOrBefore(standing.seq) : reportAfter ? rounds.get(reportAfter.seq)! : requirement.valid_after > 0 ? rounds.get(requirement.valid_after)! : ordered[0] ?? null;
      if (at) { anchor.set(requirement.requirement_id, at); at.touches.add(requirement.requirement_id); }
    }
    const version = (requirement: Requirement) => requirement.retired ? requirement.revision - 1 : requirement.revision;
    const byId = new Map(requirements.map(row => [row.requirement_id, row]));
    out.push({
      subject: { provider_id: GOALS_PLUGIN_ID, subject: { kind: "goal", id: goalId } },
      created_at: requirements.map(row => row.created_at).sort()[0]!,
      requirements: requirements.flatMap((row, position) => {
        const source = origin(row.source_json);
        const base = { requirement_id: row.requirement_id, statement: row.statement, expected: source?.kind === "imported_acceptance_criterion" && typeof source.pass_condition === "string" && source.pass_condition ? source.pass_condition : null,
          part: null, requires_person: row.human, position, by_person: row.actor_id === LOCAL_PERSON_ACTOR_ID, actor_id: row.actor_id };
        return row.retired
          ? [{ ...base, version: row.revision - 1, withdrawn: false, created_at: row.created_at }, { ...base, version: row.revision, withdrawn: true, created_at: text(eventAt(row.valid_after) ?? row.created_at) }]
          : [{ ...base, version: row.revision, withdrawn: false, created_at: row.created_at }];
      }),
      deliveries: ordered.map((item, index) => ({ round: index + 1, version: item.version, touches: index === 0 ? null : [...item.touches].sort(), actor_id: item.actor_id, delivered_at: item.at })),
      checks: judgments.filter(row => row.verdict !== "unknown" && byId.has(row.requirement_id)).map(row => {
        const requirement = byId.get(row.requirement_id)!, at = rounds.get(row.seq)!, stands = anchor.get(row.requirement_id);
        return { check_id: checkId(projectId, row.event_id, row.requirement_id), clock: row.seq, requirement_id: row.requirement_id, requirement_version: version(requirement),
          round: number.get(row.seq)!, verdict: row.verdict as "supports" | "contradicts", tier: TIERS[row.tier] ?? "self_reported",
          // A check of a later round than the one the requirement stands on checked another delivered version (§10.4 step 6).
          gap: stands && at.seq > stands.seq ? "evidence_stale" as const : row.gap ? GAPS[row.gap] ?? "evidence_missing" : null,
          checked_version: at.version, method: row.basis?.method ?? UNSTATED.method, observed: row.basis?.observed ?? UNSTATED.observed,
          evidence: (row.basis?.evidence ?? []) as AcceptanceHandoverSubject["checks"][number]["evidence"], reporter_session: row.reporter_session, actor_id: row.actor_id, reported_at: row.received_at };
      }),
      decisions: conclusions.filter(row => byId.has(row.requirement_id)).map(row => {
        const on = atOrBefore(row.seq)!;
        return { decision_id: row.decision_id, clock: row.seq, requirement_id: row.requirement_id, requirement_version: version(byId.get(row.requirement_id)!), stands_round: number.get(on.seq)!,
          version: on.version, decision: row.verdict === "accepted" ? "accepted" as const : "returned" as const, note: row.verdict === "rejected" ? row.note ?? "（Goals 的决定没有写原因）" : null,
          origin_ref: row.governance_decision_id, actor_id: row.actor_id, decided_at: row.received_at };
      }),
      satisfied: Object.fromEntries(requirements.filter(row => !row.retired).map(row => [row.requirement_id, readings.get(row.requirement_id)!.satisfied])),
    });
  }
  return out;
}

/**
 * How a decision's outcome digest changes with the move (user 2026-11-19, CONTRACT-CHANGES 「当前保留机制」): a Goal decision that
 * concluded on requirements froze a digest over its applied decision, its event and those conclusions (v5, frozen here as it was); from
 * v6 the conclusions are the platform's and the digest leaves them out. Null for any other decision. Reads only, before `finish` drops
 * the conclusions.
 */
export function goalDecisionDigestBeforeHandover(db: Db, projectId: string, governanceDecisionId: string): { previous: string; next: string } | null {
  const row = db.prepare("SELECT * FROM goal_event_applied_decisions WHERE project_id = ? AND governance_decision_id = ?").get(projectId, governanceDecisionId) as Row | undefined;
  if (!row) return null;
  const conclusions = db.prepare("SELECT * FROM goal_event_requirement_conclusions WHERE project_id = ? AND decision_id = ?").all(projectId, text(row.decision_id)) as Row[];
  if (!conclusions.length) return null;
  const next = readGoalApprovalOutcome(db, projectId, governanceDecisionId, "goal")!.digest;
  const event = db.prepare("SELECT * FROM goal_work_events WHERE project_id = ? AND event_id = ?").get(projectId, text(row.event_id)) as Row;
  const { journal_seq, ...stableEvent } = event;
  const stable = conclusions.map(({ journal_seq: sequence, ...conclusion }) => {
    if (sequence !== journal_seq || conclusion.actor_id !== row.actor_id || conclusion.goal_id !== row.goal_id) throw new Error("Goals 的结论与它的决定不符，项目库不升级");
    return conclusion;
  }).sort((a, b) => text(a.requirement_id) < text(b.requirement_id) ? -1 : Number(text(a.requirement_id) > text(b.requirement_id)));
  return { previous: goalDecisionOutcomeDigest("goal", [row, stableEvent, stable]), next };
}

/**
 * Goals' tables as its v6 declaration has them, once the platform holds the record: where each requirement came from and its bound event
 * type stay with Goals; a request still waiting for the person's acceptance becomes `moved` (the platform's per-item review takes it);
 * closures gain the acceptance round a completion stands on (empty for the ones before); the three tables go. Writes only Goals' own tables, in the upgrade's transaction.
 */
export function finishAcceptanceHandover(db: Db, projectId: string): { moved_requests: string[] } {
  db.exec(GOALS_REQUIREMENT_LINKS_SQL);
  db.prepare(`INSERT INTO goal_requirement_links (project_id, goal_id, requirement_id, origin_json, created_in_config_version, created_at)
    SELECT project_id, goal_id, requirement_id, source_json, created_in_config_version, created_at FROM goal_event_requirements WHERE project_id = ?`).run(projectId);
  db.prepare(`INSERT OR IGNORE INTO goal_event_requirement_bindings (project_id, goal_id, type_id, requirement_id, created_in_config_version, created_at)
    SELECT project_id, goal_id, bound_type_id, requirement_id, created_in_config_version, created_at FROM goal_event_requirements WHERE project_id = ? AND bound_type_id IS NOT NULL`).run(projectId);
  const moved = (db.prepare("SELECT request_id FROM goal_event_decision_requests WHERE project_id = ? AND status = 'pending' AND purpose = 'requirement_acceptance' ORDER BY request_id")
    .all(projectId) as Row[]).map(row => text(row.request_id));
  // The status list gains `moved`, and closures their last column: each table is made again from v6's own statement, rows unchanged.
  remakeTable(db, "goal_event_decision_requests", GOALS_V6_DECISION_REQUESTS_SQL, "");
  db.prepare(`UPDATE goal_event_decision_requests SET status = 'moved' WHERE project_id = ? AND status = 'pending' AND purpose = 'requirement_acceptance'`).run(projectId);
  // Closures from before the platform's acceptance stood on no delivery round of it.
  remakeTable(db, "goal_event_closures", GOALS_V6_CLOSURES_SQL, ", NULL");
  for (const table of ["goal_work_event_judgments", "goal_event_requirement_conclusions", "goal_event_requirements"]) db.exec(`DROP TABLE ${table}`);
  return { moved_requests: moved };
}

/**
 * Makes `table` again from `statement` (which also makes its index) with the rows it held, each followed by `added` for the columns
 * the new statement adds last. A copy holds the rows meanwhile; dropping the table drops its index with it. Runs inside the step's
 * transaction, foreign keys off.
 */
function remakeTable(db: Db, table: string, statement: string, added: string): void {
  db.exec(`CREATE TABLE ${table}_v5 AS SELECT * FROM ${table}`);
  db.exec(`DROP TABLE ${table}`);
  db.exec(statement);
  db.exec(`INSERT INTO ${table} SELECT *${added} FROM ${table}_v5`);
  db.exec(`DROP TABLE ${table}_v5`);
}

/** The tables the handover empties, for the step's `reduces_rows`. */
export const ACCEPTANCE_HANDOVER_DROPPED_TABLES = ["goal_work_event_judgments", "goal_event_requirement_conclusions", "goal_event_requirements"] as const;
