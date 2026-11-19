import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase, PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { openAcceptance } from "@molis-ai/molis-work-module-acceptance";
import type { AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { runSqliteUpgrade } from "@molis-ai/molis-work-storage";
import { computeAcceptanceHandover, goalDecisionDigestBeforeHandover } from "@molis-ai/molis-work-plugin-goals/v5-acceptance-handover";
import { readGoalApprovalOutcome } from "@molis-ai/molis-work-plugin-goals";

// PEQ-02 (specs/plugin-equal-standing/contract-design.md §10.4, §10.7; CONTRACT-CHANGES 「第 44 批存量搬迁」 B1): the project library's 6→7
// step hands Goals' requirements, judgments and conclusions to the platform's requirements and acceptance. The library is the 0.1.1-dev.8
// golden's own, at 6; each mapping case is one more Goal written into Goals' v5 tables the way Goals wrote them, so the step meets every
// case in one library. What the platform reads afterwards is checked against what each case means, not against the step's own reading.

const PROJECT = "molis-work-v1-demo";
const GOLDEN = new URL(`./fixtures/golden-homes/0.1.1-dev.8/stores/projects/${PROJECT}/molis-work.db.sql`, import.meta.url);
const GOALS = "io.molis.work.goals";
const at = (seq: number) => new Date(Date.UTC(2026, 9, 1) + seq * 1000).toISOString();

interface Requirement { id: string; statement?: string; human?: boolean; retired?: boolean; revision?: number; valid_after?: number }
interface Judgment { requirement: string; verdict: "supports" | "contradicts" | "unknown"; tier?: string; checked?: [string, number] }
interface Conclusion { seq: number; requirement: string; verdict: "accepted" | "rejected"; checked?: [string, number] }
interface Case { requirements: Requirement[]; reports?: Array<{ seq: number; judgments: Judgment[] }>; conclusions?: Conclusion[]; waiting?: boolean }

type Raw = DatabaseSync;

/** The golden's library at 6, in a directory of its own. */
function goldenAt6(t: { after(fn: () => void): void }) {
  const directory = mkdtempSync(join(tmpdir(), "acceptance-6-7-")), file = join(directory, "molis-work.db");
  const raw = new DatabaseSync(file);
  raw.exec(readFileSync(GOLDEN, "utf8"));
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 6, "the golden's library is at 6");
  t.after(() => { try { raw.close(); } catch { /* closed by the test */ } rmSync(directory, { recursive: true, force: true }); });
  return { raw, file };
}

/** One more Goal in Goals' v5 tables, written as Goals wrote them: a copy of CORE's row, its requirements, reports, conclusions. */
function writeCase(raw: Raw, goalId: string, value: Case): void {
  const core = raw.prepare("SELECT * FROM goals WHERE project_id = ? AND goal_id = 'CORE'").get(PROJECT) as Record<string, string | number | null>;
  const columns = Object.keys(core);
  raw.prepare(`INSERT INTO goals (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
    .run(...columns.map(column => column === "goal_id" ? goalId : column === "title" ? `案例 ${goalId}` : core[column]!));
  for (const requirement of value.requirements) {
    raw.prepare(`INSERT INTO goal_event_requirements (requirement_id, project_id, goal_id, statement, bound_type_id, created_at, created_in_config_version, actor_id,
      source_json, human_decision_required, current_status, revision, support_valid_after_seq) VALUES (?, ?, ?, ?, NULL, ?, 1, 'runtime-1', NULL, ?, ?, ?, ?)`)
      .run(requirement.id, PROJECT, goalId, requirement.statement ?? `${requirement.id} 的说法`, at(10_000), requirement.human ? 1 : 0,
        requirement.retired ? "retired" : "active", requirement.revision ?? 1, requirement.valid_after ?? 0);
  }
  for (const report of value.reports ?? []) {
    const eventId = `gevt-${goalId}-${report.seq}`;
    raw.prepare(`INSERT INTO goal_work_events (event_id, project_id, goal_id, kind, type_id, type_version, title, payload_json, actor_id, actor_kind, received_at, journal_seq, config_version)
      VALUES (?, ?, ?, 'report', 'delivery', 1, '交付', '{}', 'runtime-1', 'runtime', ?, ?, 1)`).run(eventId, PROJECT, goalId, at(report.seq), report.seq);
    for (const judgment of report.judgments) {
      const basis = judgment.checked ? JSON.stringify({ checked: { artifact_id: judgment.checked[0], version: judgment.checked[1] }, method: "打开看了", observed: "和要求一致" }) : null;
      raw.prepare("INSERT INTO goal_work_event_judgments (event_id, requirement_id, verdict, basis_json, tier, gap, reporter_session) VALUES (?, ?, ?, ?, ?, NULL, NULL)")
        .run(eventId, judgment.requirement, judgment.verdict, basis, judgment.tier ?? "self_reported");
    }
  }
  for (const conclusion of value.conclusions ?? []) {
    const decisionId = `gdec-${goalId}-${conclusion.seq}`;
    raw.prepare(`INSERT INTO goal_event_applied_decisions (decision_id, project_id, goal_id, governance_decision_id, request_id, event_id, selected_option_id, conclusion,
      accepts_requirements, effects_json, scope_json, actor_id, authority_source, recorded_at) VALUES (?, ?, ?, ?, NULL, ?, NULL, '看过了', ?, '[]', '{}', 'demo-user', 'web', ?)`)
      .run(decisionId, PROJECT, goalId, `gov-${goalId}-${conclusion.seq}`, `gevt-${goalId}-d${conclusion.seq}`, conclusion.verdict === "accepted" ? 1 : 0, at(conclusion.seq));
    raw.prepare(`INSERT INTO goal_event_requirement_conclusions (project_id, goal_id, requirement_id, decision_id, actor_id, verdict, received_at, journal_seq, checked_artifact_id, checked_version)
      VALUES (?, ?, ?, ?, 'demo-user', ?, ?, ?, ?, ?)`).run(PROJECT, goalId, conclusion.requirement, decisionId, conclusion.verdict, at(conclusion.seq), conclusion.seq,
      conclusion.checked?.[0] ?? null, conclusion.checked?.[1] ?? null);
  }
  if (value.waiting) {
    raw.prepare(`INSERT INTO goal_event_decision_requests (request_id, project_id, goal_id, event_id, question, options_json, scope_json, purpose, status, created_at)
      VALUES (?, ?, ?, ?, '这些要求可以认可吗？', '[]', ?, 'requirement_acceptance', 'pending', ?)`)
      .run(`gdec-req-${goalId}`, PROJECT, goalId, `gevt-${goalId}-ask`, JSON.stringify({ requirement_ids: value.requirements.map(item => item.id) }), at(10_001));
  }
}

const CASES: Record<string, Case> = {
  // Withdrawn at revision 2: the platform has version 1 and the withdrawal as version 2, not a third.
  RETIRED: { requirements: [{ id: "RETIRED-R", retired: true, revision: 2, valid_after: 10_010 }, { id: "RETIRED-KEPT" }] },
  // Revised twice: the platform's current version is 3, with the words it has now.
  REVISED: { requirements: [{ id: "REVISED-R", statement: "第三次的说法", revision: 3, valid_after: 10_020 }],
    reports: [{ seq: 10_019, judgments: [{ requirement: "REVISED-R", verdict: "supports", tier: "machine_verified", checked: ["a", 1] }] }] },
  // `unknown` was no check: nothing of it reaches the platform.
  UNKNOWN: { requirements: [{ id: "UNKNOWN-R" }], reports: [{ seq: 10_030, judgments: [{ requirement: "UNKNOWN-R", verdict: "unknown" }] }] },
  // A later `contradicts` withdraws an earlier acceptance (user 2026-11-05).
  CONTRADICTED: { requirements: [{ id: "CONTRA-R" }],
    reports: [{ seq: 10_040, judgments: [{ requirement: "CONTRA-R", verdict: "supports" }] }, { seq: 10_042, judgments: [{ requirement: "CONTRA-R", verdict: "contradicts" }] }],
    conclusions: [{ seq: 10_041, requirement: "CONTRA-R", verdict: "accepted" }] },
  // A later report on another version supersedes the acceptance…
  SWAPPED: { requirements: [{ id: "SWAP-R" }],
    reports: [{ seq: 10_050, judgments: [{ requirement: "SWAP-R", verdict: "supports", checked: ["a", 1] }] }, { seq: 10_052, judgments: [{ requirement: "SWAP-R", verdict: "supports", checked: ["a", 2] }] }],
    conclusions: [{ seq: 10_051, requirement: "SWAP-R", verdict: "accepted", checked: ["a", 1] }] },
  // …and one back on the version the person accepted lets the acceptance stand again.
  BACK: { requirements: [{ id: "BACK-R" }],
    reports: [{ seq: 10_050, judgments: [{ requirement: "BACK-R", verdict: "supports", checked: ["a", 1] }] }, { seq: 10_052, judgments: [{ requirement: "BACK-R", verdict: "supports", checked: ["a", 2] }] },
      { seq: 10_053, judgments: [{ requirement: "BACK-R", verdict: "supports", checked: ["a", 1] }] }],
    conclusions: [{ seq: 10_051, requirement: "BACK-R", verdict: "accepted", checked: ["a", 1] }] },
  // Returned, then machine-verified on a newer version: the verification stands.
  RETURNED: { requirements: [{ id: "RETURNED-R" }],
    reports: [{ seq: 10_060, judgments: [{ requirement: "RETURNED-R", verdict: "supports", checked: ["a", 1] }] }, { seq: 10_062, judgments: [{ requirement: "RETURNED-R", verdict: "supports", tier: "machine_verified", checked: ["a", 2] }] }],
    conclusions: [{ seq: 10_061, requirement: "RETURNED-R", verdict: "rejected", checked: ["a", 1] }] },
  // A verified report from before the requirement last changed no longer counts.
  STALE: { requirements: [{ id: "STALE-R", revision: 2, valid_after: 10_071 }],
    reports: [{ seq: 10_070, judgments: [{ requirement: "STALE-R", verdict: "supports", tier: "machine_verified", checked: ["a", 1] }] }] },
  // An acceptance with no report before it stands on a delivery round of its own.
  UNREPORTED: { requirements: [{ id: "UNREPORTED-R", human: true }], conclusions: [{ seq: 10_080, requirement: "UNREPORTED-R", verdict: "accepted" }] },
  // A request still waiting for the person's acceptance becomes `moved`: the platform's per-item review takes it.
  WAITING: { requirements: [{ id: "WAITING-R" }], reports: [{ seq: 10_090, judgments: [{ requirement: "WAITING-R", verdict: "supports" }] }], waiting: true },
};

function upgraded(t: { after(fn: () => void): void }) {
  const { raw, file } = goldenAt6(t);
  for (const [goalId, value] of Object.entries(CASES)) writeCase(raw, goalId, value);
  assert.deepEqual(runSqliteUpgrade(raw, file, PROJECT_DATABASE_BASELINE), { from: 6, to: 7 });
  raw.close();
  const store = new LocalProjectDatabase(file);
  t.after(() => store.close());
  const acceptance = openAcceptance(store.db, PROJECT, { vouched: () => false });
  const view = (goalId: string): AcceptanceView => acceptance.read({ project_id: PROJECT, actor_id: GOALS, person: false, session: null },
    { subjects: [{ provider_id: GOALS, subject: { kind: "goal", id: goalId } }] }).views[0]!;
  return { store, view };
}

const satisfied = (view: AcceptanceView) => Object.fromEntries(view.requirements.map(item => [item.id, item.satisfied]));

test("PEQ-02 the 6→7 step maps each Goals reading to the platform: withdrawn, revised, unknown, contradicted, swapped and back, returned then verified, stale, unreported, waiting", t => {
  const { store, view } = upgraded(t);
  const rows = (sql: string, ...params: string[]) => store.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  assert.deepEqual(view("RETIRED").requirements.map(item => item.id), ["RETIRED-KEPT"], "a withdrawn requirement is not current");
  assert.deepEqual(rows(`SELECT r.version, r.withdrawn FROM acceptance_requirements r JOIN acceptance_subjects s USING (subject_no)
    WHERE s.subject_id = 'RETIRED' AND r.requirement_id = 'RETIRED-R' ORDER BY r.version`).map(row => [row.version, row.withdrawn]), [[1, 0], [2, 1]],
  "version 1, then its withdrawal as version 2: no third version");

  const revised = view("REVISED").requirements[0]!;
  assert.deepEqual([revised.version, revised.statement, revised.satisfied], [3, "第三次的说法", false], "a check before the last revision checked older words");

  assert.deepEqual(rows("SELECT c.check_id FROM acceptance_checks c JOIN acceptance_subjects s USING (subject_no) WHERE s.subject_id = 'UNKNOWN'"), [], "`unknown` was no check");
  assert.deepEqual(satisfied(view("UNKNOWN")), { "UNKNOWN-R": false });

  const contradicted = view("CONTRADICTED").requirements[0]!;
  assert.equal(contradicted.satisfied, false, "a later contradicts withdraws the acceptance");
  assert.ok(contradicted.history.some(item => item.type === "decision"), "the acceptance stays in the history");

  assert.deepEqual(satisfied(view("SWAPPED")), { "SWAP-R": false }, "a report on another version supersedes the acceptance");
  assert.deepEqual(satisfied(view("BACK")), { "BACK-R": true }, "a report back on the accepted version lets it stand");
  assert.deepEqual(satisfied(view("RETURNED")), { "RETURNED-R": true }, "verified on a newer version after being returned");
  assert.equal(view("RETURNED").requirements[0]!.verified, true);
  const stale = view("STALE").requirements[0]!;
  assert.deepEqual([stale.version, stale.satisfied], [2, false], "a verification before the requirement changed no longer counts");

  const unreported = view("UNREPORTED");
  assert.deepEqual(satisfied(unreported), { "UNREPORTED-R": true }, "an acceptance with no report before it");
  assert.equal(unreported.requirements[0]!.decision?.origin, "goals_v5", "moved acceptances count as moved, without a platform voucher");
  assert.equal(unreported.round, 1, "it stands on a delivery round of its own");

  assert.deepEqual(rows("SELECT status FROM goal_event_decision_requests WHERE request_id = 'gdec-req-WAITING'").map(row => row.status), ["moved"]);
  for (const table of ["goal_event_requirements", "goal_work_event_judgments", "goal_event_requirement_conclusions"]) {
    assert.deepEqual(rows("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?", table), [], `${table} is gone`);
  }
  assert.deepEqual(rows("SELECT requirement_id FROM goal_requirement_links WHERE goal_id = 'REVISED'").map(row => row.requirement_id), ["REVISED-R"],
    "Goals keeps where each requirement came from");
});

test("PEQ-02 the golden's own acceptances read on the platform as Goals read them, and moved acceptances need no voucher", t => {
  const { view } = upgraded(t);
  // CORE-C1 and GRAPH-C1 carry the golden's own person acceptances (decided by `demo-user` in v5).
  for (const [goalId, id] of [["CORE", "CORE-C1"], ["GRAPH", "GRAPH-C1"]] as const) {
    const requirement = view(goalId).requirements.find(item => item.id === id)!;
    assert.deepEqual([requirement.person, requirement.satisfied, requirement.decision?.origin], ["accepted", true, "goals_v5"], id);
  }
});

test("PEQ-02 two independent upgrades of one v6 library write the same platform rows, byte for byte", t => {
  const dumps = [0, 1].map(() => {
    const { store } = upgraded(t);
    return ["subjects", "requirements", "deliveries", "checks", "decisions"].map(table =>
      JSON.stringify(store.db.prepare(`SELECT * FROM acceptance_${table} ORDER BY 1, 2, 3`).all()));
  });
  assert.ok(dumps[0]!.every(dump => dump.length > 2), "there is something to compare");
  assert.deepEqual(dumps[0], dumps[1]);
});

test("PEQ-02 a row of another project stops the step and leaves the library at 6 as it was; the handover refuses it on its own too", t => {
  const { raw, file } = goldenAt6(t);
  // A requirement of a project this library is not: the step stops before writing anything (here at the library's own foreign-key check).
  raw.exec("PRAGMA foreign_keys = OFF");
  raw.prepare(`INSERT INTO goal_event_requirements (requirement_id, project_id, goal_id, statement, created_at, created_in_config_version, actor_id)
    VALUES ('STRAY-R', 'another-project', 'CORE', '别的项目的要求', ?, 1, 'runtime-1')`).run(at(10_000));
  const before = (raw.prepare("SELECT count(*) AS n FROM goal_event_requirements").get() as { n: number }).n;
  assert.throws(() => runSqliteUpgrade(raw, file, PROJECT_DATABASE_BASELINE), (error: Error) => /项目库已保留/.test(String((error as { cause?: unknown }).cause)));
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 6);
  assert.equal((raw.prepare("SELECT count(*) AS n FROM goal_event_requirements").get() as { n: number }).n, before, "Goals' rows are where they were");
  assert.deepEqual(raw.prepare("SELECT name FROM sqlite_schema WHERE name = 'acceptance_subjects'").all(), [], "no platform table was left behind");
  // Goals' own computation, which the step runs once the library's checks pass, refuses the row as well (§10.4 step 9).
  assert.throws(() => computeAcceptanceHandover(raw, PROJECT), /不属于这个项目/);
});

// The golden's two person decisions that concluded on requirements froze a digest over their conclusions (Goals v5). From 7 the conclusions are
// the platform's, so the step re-freezes each record that holds exactly that v5 digest (user 2026-11-19, CONTRACT-CHANGES 「当前保留机制」).
const FROZEN = ["ec798271-5a5a-44ee-a6ce-d83726329a38", "96ab972f-3279-4f49-8f58-4fee891374ab"];
const frozen = (db: { prepare(sql: string): { get(...params: string[]): unknown } }, id: string) =>
  (JSON.parse((db.prepare("SELECT record_json FROM project_review_decisions WHERE project_id = ? AND decision_id = ?").get(PROJECT, id) as { record_json: string }).record_json) as
    { outcome_digest?: string }).outcome_digest;

test("PEQ-02 a decision record that froze a Goal decision's v5 outcome holds its v6 outcome after the step", t => {
  const { raw, file } = goldenAt6(t);
  for (const id of FROZEN) {
    const digests = goalDecisionDigestBeforeHandover(raw, PROJECT, id)!;
    assert.equal(frozen(raw, id), digests.previous, "the record froze the v5 outcome");
    assert.notEqual(digests.previous, digests.next, "the outcome changes with the move");
  }
  assert.deepEqual(runSqliteUpgrade(raw, file, PROJECT_DATABASE_BASELINE), { from: 6, to: 7 });
  for (const id of FROZEN) assert.equal(frozen(raw, id), readGoalApprovalOutcome(raw, PROJECT, id, "goal")?.digest, id);
});

test("PEQ-02 a record whose frozen outcome is neither the v5 nor the v6 one stops the step and leaves the library at 6", t => {
  const { raw, file } = goldenAt6(t);
  const row = raw.prepare("SELECT record_json FROM project_review_decisions WHERE project_id = ? AND decision_id = ?").get(PROJECT, FROZEN[0]!) as { record_json: string };
  const record = JSON.parse(row.record_json) as Record<string, unknown>;
  raw.prepare("UPDATE project_review_decisions SET record_json = ? WHERE project_id = ? AND decision_id = ?")
    .run(JSON.stringify({ ...record, outcome_digest: `sha256:${"0".repeat(64)}` }), PROJECT, FROZEN[0]!);
  assert.throws(() => runSqliteUpgrade(raw, file, PROJECT_DATABASE_BASELINE), (error: Error) => /业务结果与升级前的不符/.test(String((error as { cause?: unknown }).cause ?? error)));
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 6);
  assert.equal(frozen(raw, FROZEN[0]!), `sha256:${"0".repeat(64)}`, "the record is as it was");
});
