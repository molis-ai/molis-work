import type { DatabaseSync } from "node:sqlite";
import { clearInExistingHomeSqlite, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import type { AcceptanceCheck, AcceptanceEvidenceRef, AcceptanceSubject } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { ACCEPTANCE_BASELINE, ACCEPTANCE_STORE } from "./schema.js";
import type { CheckRow, DecisionRow, DeliveryRow, RequirementRow, SubjectRows } from "./state.js";

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : null);

/** The logs of `<Home>/acceptance/acceptance.db`. It appends and reads; what the rows mean is in `state.ts` and `service.ts`. */
export class AcceptanceStore {
  constructor(private readonly db: DatabaseSync) { db.exec("PRAGMA busy_timeout = 5000;"); }
  close(): void { this.db.close(); }

  /** One write: everything in `work` is saved, or nothing is. */
  write<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  subjectNo(projectId: string, subject: AcceptanceSubject, create: { at: string } | null): number | null {
    const key = [projectId, subject.provider_id, subject.subject.kind, subject.subject.id];
    const found = this.db.prepare("SELECT subject_no FROM acceptance_subjects WHERE project_id = ? AND provider_id = ? AND subject_kind = ? AND subject_id = ?").get(...key) as Row | undefined;
    if (found) return Number(found.subject_no);
    if (!create) return null;
    return Number(this.db.prepare("INSERT INTO acceptance_subjects (project_id, provider_id, subject_kind, subject_id, created_at) VALUES (?, ?, ?, ?, ?)").run(...key, create.at).lastInsertRowid);
  }

  rows(subjectNo: number): SubjectRows {
    const all = (table: string) => this.db.prepare(`SELECT * FROM acceptance_${table} WHERE subject_no = ? ORDER BY seq`).all(subjectNo) as Row[];
    return {
      requirements: all("requirements").map((row): RequirementRow => ({ seq: Number(row.seq), requirement_id: String(row.requirement_id), version: Number(row.version), statement: String(row.statement), expected: text(row.expected),
        part: text(row.part), requires_person: row.requires_person === 1, withdrawn: row.withdrawn === 1, position: Number(row.position), by_person: row.by_person === 1, created_at: String(row.created_at) })),
      deliveries: all("deliveries").map((row): DeliveryRow => ({ round: Number(row.round), version: String(row.version), summary: text(row.summary), touches: row.touches_json === null ? null : JSON.parse(String(row.touches_json)) as string[],
        made_in_session: text(row.made_in_session), made_in_run: text(row.made_in_run), delivered_at: String(row.delivered_at) })),
      checks: all("checks").map((row): CheckRow => ({ seq: Number(row.seq), requirement_id: String(row.requirement_id), requirement_version: Number(row.requirement_version), round: Number(row.round),
        kind: row.kind as AcceptanceCheck["kind"], verdict: row.verdict as AcceptanceCheck["verdict"], tier: row.tier as AcceptanceCheck["tier"], gap: text(row.gap) as AcceptanceCheck["gap"],
        checked_version: String(row.checked_version), method: String(row.method), observed: String(row.observed), evidence: JSON.parse(String(row.evidence_json)) as AcceptanceEvidenceRef[], reported_at: String(row.reported_at) })),
      decisions: all("decisions").map((row): DecisionRow => ({ seq: Number(row.seq), decision_id: String(row.decision_id), requirement_id: String(row.requirement_id), requirement_version: Number(row.requirement_version),
        stands_round: Number(row.stands_round), version: String(row.version), decision: row.decision as DecisionRow["decision"], note: text(row.note), actor_id: String(row.actor_id), decided_at: String(row.decided_at) })),
    };
  }

  addRequirement(subjectNo: number, row: Omit<RequirementRow, "seq">, actorId: string): void {
    this.db.prepare("INSERT INTO acceptance_requirements (subject_no, requirement_id, version, statement, expected, part, requires_person, withdrawn, position, by_person, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(subjectNo, row.requirement_id, row.version, row.statement, row.expected, row.part, row.requires_person ? 1 : 0, row.withdrawn ? 1 : 0, row.position, row.by_person ? 1 : 0, actorId, row.created_at);
  }
  addDelivery(subjectNo: number, row: DeliveryRow, actorId: string): void {
    this.db.prepare("INSERT INTO acceptance_deliveries (subject_no, round, version, summary, touches_json, made_in_session, made_in_run, actor_id, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(subjectNo, row.round, row.version, row.summary, row.touches === null ? null : JSON.stringify(row.touches), row.made_in_session, row.made_in_run, actorId, row.delivered_at);
  }
  addCheck(subjectNo: number, row: Omit<CheckRow, "seq">, reporter: { session: string | null; actor_id: string }): void {
    this.db.prepare("INSERT INTO acceptance_checks (subject_no, requirement_id, requirement_version, round, kind, verdict, tier, gap, checked_version, method, observed, evidence_json, reporter_session, actor_id, reported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(subjectNo, row.requirement_id, row.requirement_version, row.round, row.kind, row.verdict, row.tier, row.gap, row.checked_version, row.method, row.observed, JSON.stringify(row.evidence), reporter.session, reporter.actor_id, row.reported_at);
  }
  addDecision(subjectNo: number, row: Omit<DecisionRow, "seq">): void {
    this.db.prepare("INSERT INTO acceptance_decisions (decision_id, subject_no, requirement_id, requirement_version, stands_round, version, decision, note, actor_id, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.decision_id, subjectNo, row.requirement_id, row.requirement_version, row.stands_round, row.version, row.decision, row.note, row.actor_id, row.decided_at);
  }
}

export function openStore(homeDirectory: string): AcceptanceStore {
  return new AcceptanceStore(openBaselineHomeSqlite(homeDirectory, ACCEPTANCE_STORE, ACCEPTANCE_BASELINE));
}

/** The project is deleted: everything attached to its objects goes. Works on the library's file; running it again finds nothing. */
export function purgeAcceptanceProject(homeDirectory: string, projectId: string): void {
  clearInExistingHomeSqlite(homeDirectory, ACCEPTANCE_STORE, ACCEPTANCE_BASELINE, db => {
    for (const table of ["requirements", "deliveries", "checks", "decisions"]) db.prepare(`DELETE FROM acceptance_${table} WHERE subject_no IN (SELECT subject_no FROM acceptance_subjects WHERE project_id = ?)`).run(projectId);
    db.prepare("DELETE FROM acceptance_subjects WHERE project_id = ?").run(projectId);
  });
}

/** What this module keeps in the Home for a project and how the project's deletion clears it. Not a plugin, so the Host lists it by hand. */
export const acceptanceProjectData: ProjectDataDeclaration = { label: { key: "workbench.project-deletion.acceptance" }, order: 72, purge: purgeAcceptanceProject };
