import { randomUUID } from "node:crypto";
import type { SqliteBaselineDatabase } from "@molis-ai/molis-work-storage";
import type { AcceptanceCheck, AcceptanceDecisionOrigin, AcceptanceEvidenceRef, AcceptanceSubject } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { CheckRow, DecisionRow, DeliveryRow, RequirementRow, SubjectRows } from "./state.js";

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : null);

type TransactionalDatabase = SqliteBaselineDatabase & {
  transaction?<T>(operation: () => T): (() => T) & { immediate(): T };
};

/** The acceptance tables of one project library. It appends and reads; what the rows mean is in `state.ts` and `service.ts`. */
export class AcceptanceStore {
  private depth = 0;
  constructor(readonly db: SqliteBaselineDatabase, readonly projectId: string) {}

  /**
   * One write: everything in `work` is saved, or nothing is. Uses `BEGIN IMMEDIATE` (auto-nesting via SAVEPOINT inside an outer
   * transaction on a `ProjectConnection`) when the connection supports it, and falls back to SAVEPOINT on bare connections.
   */
  write<T>(work: () => T): T {
    const transactional = this.db as TransactionalDatabase;
    if (typeof transactional.transaction === "function") return transactional.transaction(work).immediate();
    const name = `acceptance_write_${this.depth}`;
    this.db.exec(`SAVEPOINT ${name}`);
    this.depth += 1;
    try { const result = work(); this.depth -= 1; this.db.exec(`RELEASE ${name}`); return result; } catch (error) {
      this.depth -= 1;
      this.db.exec(`ROLLBACK TO ${name}`); this.db.exec(`RELEASE ${name}`);
      throw error;
    }
  }

  subjectNo(subject: AcceptanceSubject, create: { at: string } | null): number | null {
    const key = [this.projectId, subject.provider_id, subject.subject.kind, subject.subject.id];
    const found = this.db.prepare("SELECT subject_no FROM acceptance_subjects WHERE project_id = ? AND provider_id = ? AND subject_kind = ? AND subject_id = ?").get(...key) as Row | undefined;
    if (found) return Number(found.subject_no);
    if (!create) return null;
    this.db.prepare("INSERT INTO acceptance_subjects (project_id, provider_id, subject_kind, subject_id, created_at) VALUES (?, ?, ?, ?, ?)").run(...key, create.at);
    return Number((this.db.prepare("SELECT subject_no FROM acceptance_subjects WHERE project_id = ? AND provider_id = ? AND subject_kind = ? AND subject_id = ?").get(...key) as Row).subject_no);
  }

  /** Every subject of this project, for the sync replica. */
  subjects(): Array<AcceptanceSubject & { subject_no: number; created_at: string }> {
    return (this.db.prepare("SELECT * FROM acceptance_subjects WHERE project_id = ? ORDER BY subject_no").all(this.projectId) as Row[]).map(row => ({
      subject_no: Number(row.subject_no), provider_id: String(row.provider_id), subject: { kind: String(row.subject_kind), id: String(row.subject_id) }, created_at: String(row.created_at) }));
  }

  rows(subjectNo: number): SubjectRows {
    const all = (table: string, order: string) => this.db.prepare(`SELECT * FROM acceptance_${table} WHERE subject_no = ? ORDER BY ${order}`).all(subjectNo) as Row[];
    return {
      requirements: all("requirements", "seq").map((row): RequirementRow => ({ seq: Number(row.seq), requirement_id: String(row.requirement_id), version: Number(row.version), statement: String(row.statement), expected: text(row.expected),
        part: text(row.part), requires_person: Number(row.requires_person) === 1, withdrawn: Number(row.withdrawn) === 1, position: Number(row.position), by_person: Number(row.by_person) === 1, created_at: String(row.created_at) })),
      deliveries: all("deliveries", "round").map((row): DeliveryRow => ({ round: Number(row.round), version: String(row.version), summary: text(row.summary), touches: row.touches_json === null ? null : JSON.parse(String(row.touches_json)) as string[],
        made_in_session: text(row.made_in_session), made_in_run: text(row.made_in_run), delivered_at: String(row.delivered_at) })),
      checks: all("checks", "clock, check_id").map((row): CheckRow => ({ check_id: String(row.check_id), clock: Number(row.clock), requirement_id: String(row.requirement_id), requirement_version: Number(row.requirement_version), round: Number(row.round),
        kind: row.kind as AcceptanceCheck["kind"], verdict: row.verdict as AcceptanceCheck["verdict"], tier: row.tier as AcceptanceCheck["tier"], gap: text(row.gap) as AcceptanceCheck["gap"],
        checked_version: String(row.checked_version), method: String(row.method), observed: String(row.observed), evidence: JSON.parse(String(row.evidence_json)) as AcceptanceEvidenceRef[], reported_at: String(row.reported_at) })),
      decisions: all("decisions", "clock, decision_id, requirement_id").map((row): DecisionRow => ({ clock: Number(row.clock), decision_id: String(row.decision_id), origin: row.origin as AcceptanceDecisionOrigin, origin_ref: String(row.origin_ref),
        requirement_id: String(row.requirement_id), requirement_version: Number(row.requirement_version), stands_round: Number(row.stands_round), version: String(row.version), decision: row.decision as DecisionRow["decision"],
        note: text(row.note), actor_id: String(row.actor_id), decided_at: String(row.decided_at) })),
    };
  }

  /** The next tick of a subject's logical clock: one past every check and decision it has, whichever device wrote them (§10.5). */
  nextClock(subjectNo: number): number {
    const row = this.db.prepare("SELECT max(clock) AS clock FROM (SELECT clock FROM acceptance_checks WHERE subject_no = ? UNION ALL SELECT clock FROM acceptance_decisions WHERE subject_no = ?)")
      .get(subjectNo, subjectNo) as Row | undefined;
    return Number(row?.clock ?? 0) + 1;
  }

  addRequirement(subjectNo: number, row: Omit<RequirementRow, "seq">, actorId: string): void {
    this.db.prepare("INSERT INTO acceptance_requirements (subject_no, requirement_id, version, statement, expected, part, requires_person, withdrawn, position, by_person, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(subjectNo, row.requirement_id, row.version, row.statement, row.expected, row.part, row.requires_person ? 1 : 0, row.withdrawn ? 1 : 0, row.position, row.by_person ? 1 : 0, actorId, row.created_at);
  }
  addDelivery(subjectNo: number, row: DeliveryRow, actorId: string): void {
    this.db.prepare("INSERT INTO acceptance_deliveries (subject_no, round, version, summary, touches_json, made_in_session, made_in_run, actor_id, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(subjectNo, row.round, row.version, row.summary, row.touches === null ? null : JSON.stringify(row.touches), row.made_in_session, row.made_in_run, actorId, row.delivered_at);
  }
  addCheck(subjectNo: number, row: Omit<CheckRow, "check_id" | "clock"> & { check_id?: string; clock?: number }, reporter: { session: string | null; actor_id: string }): void {
    this.db.prepare("INSERT INTO acceptance_checks (check_id, subject_no, clock, requirement_id, requirement_version, round, kind, verdict, tier, gap, checked_version, method, observed, evidence_json, reporter_session, actor_id, reported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.check_id ?? randomUUID(), subjectNo, row.clock ?? this.nextClock(subjectNo), row.requirement_id, row.requirement_version, row.round, row.kind, row.verdict, row.tier, row.gap, row.checked_version, row.method, row.observed,
        JSON.stringify(row.evidence), reporter.session, reporter.actor_id, row.reported_at);
  }
  addDecision(subjectNo: number, row: Omit<DecisionRow, "clock" | "origin" | "origin_ref"> & Partial<Pick<DecisionRow, "clock" | "origin" | "origin_ref">>): void {
    this.db.prepare("INSERT INTO acceptance_decisions (decision_id, subject_no, clock, requirement_id, requirement_version, stands_round, version, decision, note, origin, origin_ref, actor_id, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.decision_id, subjectNo, row.clock ?? this.nextClock(subjectNo), row.requirement_id, row.requirement_version, row.stands_round, row.version, row.decision, row.note,
        row.origin ?? "trusted_decision", row.origin_ref ?? row.decision_id, row.actor_id, row.decided_at);
  }
}
