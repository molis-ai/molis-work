import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase, upgradePluginTables } from "@molis-ai/molis-work-app-local-host";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { assessGoalReport, GOALS_PROJECT_DATABASE, goalsManifest, hostEventDecisionAuthority, type GoalEvidencePorts } from "@molis-ai/molis-work-plugin-goals";
import { goalEventAssessmentKey, type GoalEventJudgmentAssessment, type GoalEventJudgmentBasisInput } from "@molis-ai/molis-work-plugin-goals/contract";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

// The evidence contract of batch 24-3 (user decisions 2026-11-11, BL-1036). A judgment may say what exact delivered version it checked and
// how; how far that is backed is worked out by Goals and never taken from the reporter; the person's acceptance is about the version the
// report had checked; and a requirement that does not ask for the person is also met by a report Goals found backed.

const BOARD = "board-evidence";
const V1 = { artifact_id: "artifact-report", version: 1 }, V2 = { artifact_id: "artifact-report", version: 2 };
const basisOf = (checked: { artifact_id: string; version: number }, evidence?: GoalEventJudgmentBasisInput["evidence"]): GoalEventJudgmentBasisInput =>
  ({ checked, method: "跑了项目的测试命令", observed: "全部通过", ...(evidence ? { evidence } : {}) });
const VERIFIED: GoalEventJudgmentAssessment = { tier: "machine_verified", gap: null };
const REVIEWED: GoalEventJudgmentAssessment = { tier: "peer_reviewed", gap: null };

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-evidence-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ project_id: BOARD, actor_id: "user-1", idempotency_key: "init" });
  return { directory, store, app };
}
function close(data: { directory: string; store: LocalProjectDatabase }) { data.store.close(); rmSync(data.directory, { recursive: true, force: true }); }
const versions = (app: GoalProjectApplication, goalId: string) => {
  const state = app.goalEvents.readState(BOARD, goalId);
  return { expected_config_version: state.config.version, expected_agreement_version: state.agreement.version };
};

/** A Goal with the named requirements; `human` ones ask for the person's decision. Version 1 is its confirmed deliverable. */
function goalWith(app: GoalProjectApplication, goalId: string, requirements: Array<{ id: string; human?: boolean }>) {
  app.goalEvents.createIntent({ project_id: BOARD, goal_id: goalId, title: goalId, outcome: "可检查的具体结果", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: `intent-${goalId}` });
  app.goalEvents.configure({ project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", expected_version: 0, idempotency_key: `cfg-${goalId}`,
    types: [{ type_id: "delivery", version: 1, name: "交付", purpose: "可使用的结果", semantic_family: "delivery", source: { kind: "runtime", label: "当前 Goal" },
      fields: [{ field_id: "piece", name: "交付了什么", purpose: "结果", format: "text", required: true }] }] });
  app.goalEvents.setAgreement({ project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: `req-${goalId}`, ...versions(app, goalId),
    new_requirements: requirements.map(item => ({ requirement_id: item.id, statement: `要求 ${item.id}`, ...(item.human ? { human_decision_required: true } : {}) })) });
  app.confirmedDeliverables.set(goalId, [V1]);
}

interface Judged { requirement: string; verdict?: "supports" | "contradicts" | "unknown"; basis?: GoalEventJudgmentBasisInput; assessed?: GoalEventJudgmentAssessment }
function report(app: GoalProjectApplication, goalId: string, key: string, judged: Judged[], session: string | null = "session-worker") {
  return app.goalEvents.report({ project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: key,
    events: [{ type_id: "delivery", type_version: 1, title: "交付了一段结果", fields: { piece: "可用入口" },
      judgments: judged.map(item => ({ requirement_id: item.requirement, verdict: item.verdict ?? "supports", ...(item.basis ? { basis: item.basis } : {}) })) }],
    trusted: { reporter_session: session, assessments: new Map(judged.flatMap(item => item.assessed ? [[goalEventAssessmentKey(0, item.requirement), item.assessed] as const] : [])) } });
}
function decide(app: GoalProjectApplication, goalId: string, key: string, requirementIds: string[], accepts = true) {
  return app.goalEvents.recordTrustedDecision({ project_id: BOARD, goal_id: goalId, idempotency_key: key,
    authority: hostEventDecisionAuthority("web", BOARD, "web-user", key), conclusion: accepts ? "看过结果，认可" : "看过结果，不认可",
    accepts_requirements: accepts, scope: { requirement_ids: requirementIds } });
}
const requirement = (app: GoalProjectApplication, goalId: string, id: string) => app.goalEvents.readState(BOARD, goalId).requirements.find(item => item.requirement_id === id)!;
function tryComplete(app: GoalProjectApplication, goalId: string, key: string) {
  return app.goalEvents.submitClosure({ project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: key, kind: "complete",
    result: "结果可以检查", reason: "试着完成", ...versions(app, goalId) });
}
const reasons = (closure: { unmet_reasons: Array<{ code: string; requirement_id?: string }> }) => closure.unmet_reasons.map(reason => [reason.code, reason.requirement_id]);

test("EVD-01: a basis the reporter wrote is still the reporter's own word and meets nothing; a judgment without one reads the same", () => {
  const data = fixture();
  try {
    goalWith(data.app, "own-word", [{ id: "r-basis" }, { id: "r-bare" }]);
    const saved = report(data.app, "own-word", "rep", [{ requirement: "r-basis", basis: basisOf(V1) }, { requirement: "r-bare" }]);
    const event = data.app.goalEvents.readEvent(BOARD, "own-word", saved.events[0]!.event_id);
    assert.deepEqual(event.judgments, [
      { requirement_id: "r-bare", verdict: "supports", basis: null, tier: "self_reported", gap: null },
      { requirement_id: "r-basis", verdict: "supports", basis: { checked: V1, method: "跑了项目的测试命令", observed: "全部通过", evidence: [] }, tier: "self_reported", gap: null },
    ]);
    for (const id of ["r-basis", "r-bare"]) {
      const state = requirement(data.app, "own-word", id);
      assert.equal(state.currently_satisfied, false, id);
      assert.equal(state.satisfied_by, null, id);
      assert.equal(state.current_report?.tier, "self_reported", id);
    }
    const held = tryComplete(data.app, "own-word", "close");
    assert.equal(held.completion_applied, false);
    assert.deepEqual(reasons(held), [["goals.event_closure.requirement_self_reported", "r-bare"], ["goals.event_closure.requirement_self_reported", "r-basis"]]);
  } finally { close(data); }
});

test("EVD-02: a report Goals found backed meets a requirement that does not ask for the person, by a command or by another worker's review, and says which", () => {
  const data = fixture();
  try {
    goalWith(data.app, "backed", [{ id: "r-machine" }, { id: "r-peer" }]);
    report(data.app, "backed", "rep", [{ requirement: "r-machine", basis: basisOf(V1, [{ kind: "command_receipt", run_id: "run-1", call_id: "call-1" }]), assessed: VERIFIED },
      { requirement: "r-peer", basis: basisOf(V1), assessed: REVIEWED }]);
    const machine = requirement(data.app, "backed", "r-machine"), peer = requirement(data.app, "backed", "r-peer");
    assert.deepEqual([machine.currently_satisfied, machine.satisfied_by, machine.current_report?.tier], [true, "machine_verified", "machine_verified"]);
    assert.deepEqual([peer.currently_satisfied, peer.satisfied_by], [true, "peer_reviewed"]);
    // Neither is the person's decision, and neither is recorded as one.
    assert.equal(machine.user_conclusion, null);
    assert.equal(machine.current_report?.substitutes_human_decision, false);
    assert.equal(tryComplete(data.app, "backed", "close").completion_applied, true);
  } finally { close(data); }
});

test("EVD-03: a requirement that asks for the person is met by the person alone, however well a report is backed", () => {
  const data = fixture();
  try {
    goalWith(data.app, "asks-person", [{ id: "r-human", human: true }]);
    report(data.app, "asks-person", "rep", [{ requirement: "r-human", basis: basisOf(V1), assessed: VERIFIED }]);
    assert.equal(requirement(data.app, "asks-person", "r-human").currently_satisfied, false);
    const held = tryComplete(data.app, "asks-person", "close");
    assert.equal(held.completion_applied, false);
    assert.deepEqual(reasons(held), [["goals.event_closure.human_decision_required", "r-human"]]);
    decide(data.app, "asks-person", "accept", ["r-human"]);
    assert.equal(requirement(data.app, "asks-person", "r-human").satisfied_by, "user_accepted");
  } finally { close(data); }
});

test("EVD-04: a backed report counts only while the version it checked is a confirmed deliverable; the person's turning the requirement down outweighs it", () => {
  const data = fixture();
  try {
    goalWith(data.app, "still-delivered", [{ id: "r-gone" }, { id: "r-refused" }]);
    report(data.app, "still-delivered", "rep", [{ requirement: "r-gone", basis: basisOf(V1), assessed: VERIFIED }, { requirement: "r-refused", basis: basisOf(V1), assessed: VERIFIED }]);
    decide(data.app, "still-delivered", "reject", ["r-refused"], false);
    assert.equal(requirement(data.app, "still-delivered", "r-refused").currently_satisfied, false, "the person turned it down");
    assert.deepEqual(reasons(tryComplete(data.app, "still-delivered", "close-refused")), [["goals.event_closure.requirement_rejected", "r-refused"]]);
    assert.equal(requirement(data.app, "still-delivered", "r-gone").currently_satisfied, true);
    data.app.confirmedDeliverables.set("still-delivered", []);
    const gone = requirement(data.app, "still-delivered", "r-gone");
    assert.equal(gone.currently_satisfied, false, "the checked version is no longer a deliverable");
    assert.equal(gone.current_report?.tier, "machine_verified", "the report is kept as it was found");
  } finally { close(data); }
});

test("EVD-05: the person's acceptance is about the version the report had checked; a report on a new version puts that one requirement back, and the others keep theirs", () => {
  const data = fixture();
  try {
    goalWith(data.app, "by-version", [{ id: "r-changed", human: true }, { id: "r-untouched", human: true }]);
    report(data.app, "by-version", "rep-v1", [{ requirement: "r-changed", basis: basisOf(V1) }, { requirement: "r-untouched", basis: basisOf(V1) }]);
    decide(data.app, "by-version", "accept-v1", ["r-changed", "r-untouched"]);
    for (const id of ["r-changed", "r-untouched"]) {
      const state = requirement(data.app, "by-version", id);
      assert.deepEqual([state.satisfied_by, state.user_conclusion?.checked, state.conclusion_superseded], ["user_accepted", V1, false], id);
    }
    data.app.confirmedDeliverables.set("by-version", [V1, V2]);
    report(data.app, "by-version", "rep-v2", [{ requirement: "r-changed", basis: basisOf(V2) }]);
    const changed = requirement(data.app, "by-version", "r-changed"), untouched = requirement(data.app, "by-version", "r-untouched");
    assert.deepEqual([changed.currently_satisfied, changed.satisfied_by, changed.conclusion_superseded], [false, null, true]);
    // The difference stays visible: what the person accepted and what the latest report checked are both there.
    assert.deepEqual([changed.user_conclusion?.verdict, changed.user_conclusion?.checked, changed.current_report?.basis?.checked], ["accepted", V1, V2]);
    assert.deepEqual([untouched.currently_satisfied, untouched.satisfied_by, untouched.conclusion_superseded], [true, "user_accepted", false]);
    const held = tryComplete(data.app, "by-version", "close");
    assert.equal(held.completion_applied, false);
    assert.deepEqual(reasons(held), [["goals.event_closure.human_decision_required", "r-changed"]]);
    // Deciding again, on the new version, meets it again.
    decide(data.app, "by-version", "accept-v2", ["r-changed"]);
    const again = requirement(data.app, "by-version", "r-changed");
    assert.deepEqual([again.satisfied_by, again.user_conclusion?.checked, again.conclusion_superseded], ["user_accepted", V2, false]);
  } finally { close(data); }
});

test("EVD-08: an acceptance of a report that named no version does not cover a later report that names one; a later report that names none leaves it standing", () => {
  const data = fixture();
  try {
    goalWith(data.app, "unversioned", [{ id: "r-named", human: true }, { id: "r-plain", human: true }]);
    report(data.app, "unversioned", "rep-plain", [{ requirement: "r-named" }, { requirement: "r-plain" }]);
    decide(data.app, "unversioned", "accept-plain", ["r-named", "r-plain"]);
    for (const id of ["r-named", "r-plain"]) assert.deepEqual([requirement(data.app, "unversioned", id).satisfied_by, requirement(data.app, "unversioned", id).user_conclusion?.checked ?? null], ["user_accepted", null], id);
    report(data.app, "unversioned", "rep-again", [{ requirement: "r-named", basis: basisOf(V1) }, { requirement: "r-plain" }]);
    const named = requirement(data.app, "unversioned", "r-named"), plain = requirement(data.app, "unversioned", "r-plain");
    assert.deepEqual([named.currently_satisfied, named.satisfied_by, named.conclusion_superseded], [false, null, true]);
    assert.deepEqual([plain.currently_satisfied, plain.satisfied_by, plain.conclusion_superseded], [true, "user_accepted", false]);
  } finally { close(data); }
});

test("EVD-06: every report is kept as it was found: a later one changes what is current, not what earlier ones said", () => {
  const data = fixture();
  try {
    goalWith(data.app, "history", [{ id: "r-one" }]);
    const first = report(data.app, "history", "rep-1", [{ requirement: "r-one", basis: basisOf(V1), assessed: { tier: "self_reported", gap: "check_failed" } }]);
    const second = report(data.app, "history", "rep-2", [{ requirement: "r-one", basis: basisOf(V1), assessed: VERIFIED }]);
    const third = report(data.app, "history", "rep-3", [{ requirement: "r-one", verdict: "contradicts" }]);
    const kept = [first, second, third].map(saved => data.app.goalEvents.readEvent(BOARD, "history", saved.events[0]!.event_id).judgments[0]!);
    assert.deepEqual(kept.map(item => [item.verdict, item.tier, item.gap]), [["supports", "self_reported", "check_failed"], ["supports", "machine_verified", null], ["contradicts", "self_reported", null]]);
    assert.equal(requirement(data.app, "history", "r-one").currently_satisfied, false, "the latest report is against it");
  } finally { close(data); }
});

test("EVD-07: a basis that names no exact version, says nothing of how it was checked, or cites too much is refused, and nothing of the batch is saved", () => {
  const data = fixture();
  try {
    goalWith(data.app, "malformed", [{ id: "r-one" }]);
    const before = data.app.goalEvents.readState(BOARD, "malformed").goal_event_cursor;
    const receipts = Array.from({ length: 9 }, (_, index) => ({ kind: "command_receipt" as const, run_id: "run-1", call_id: `call-${index}` }));
    const bad: Array<[string, unknown]> = [
      ["no version", { checked: { artifact_id: "artifact-report" }, method: "看了", observed: "对" }],
      ["the latest", { checked: { artifact_id: "artifact-report", version: "latest" }, method: "看了", observed: "对" }],
      ["no method", { checked: V1, method: " ", observed: "对" }],
      ["no observation", { checked: V1, method: "看了" }],
      ["nine references", basisOf(V1, receipts)],
      ["a reference of another kind", basisOf(V1, [{ kind: "file_change", path: "a.ts" } as never])],
    ];
    for (const [what, basis] of bad) {
      assert.throws(() => report(data.app, "malformed", `rep-${what}`, [{ requirement: "r-one", basis: basis as GoalEventJudgmentBasisInput }]),
        (error: unknown) => error instanceof ActionError && error.code === "goals.event_report.invalid_basis", what);
    }
    assert.equal(data.app.goalEvents.readState(BOARD, "malformed").goal_event_cursor, before);
    assert.equal(requirement(data.app, "malformed", "r-one").current_report, null);
  } finally { close(data); }
});

// ---- What Goals works out before a report is saved (`assessGoalReport`), over what the 成果库 and the platform answer. ----

const RUN = "run-made-v1", SESSION = "session-worker";
const callerOf = (session: string | undefined, signal?: AbortSignal, who: { audience: string; delegated_audience?: string } = { audience: "agent" }) =>
  ({ ...who, ...(session ? { runtime_session_id: session } : {}), ...(signal ? { signal } : {}) });
interface World {
  deliverables?: Array<{ artifact_id: string; version: number }>;
  artifact?: { producer_plugin_id: string; origin: { kind: string; revision?: string } } | null | Error;
  /** The rounds of the caller's own session, and what each command of them did. */
  runs?: Record<string, { owner?: string; commands: Record<string, Partial<{ recorded: boolean; exit_code: number | null; timed_out: boolean; cancelled: boolean; changed_after: boolean }>> } | Error>;
  spoke?: string[];
  /** Versions cited as evidence, by `id@version`; one not listed reads like the checked version. */
  cited?: Record<string, null | Error>;
}
function portsOf(world: World): GoalEvidencePorts & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    deliverables: () => world.deliverables ?? [V1],
    selfSupportingSessions: () => new Set(world.spoke ?? []),
    readArtifact: async (_caller, reference) => {
      const cited = world.cited?.[`${reference.artifact_id}@${reference.version}`];
      if (cited instanceof Error) throw cited;
      if (cited === null) return null;
      const artifact = world.artifact === undefined ? { producer_plugin_id: "io.molis.work.coding", origin: { kind: "pinned", revision: RUN } } : world.artifact;
      if (artifact instanceof Error) throw artifact;
      return artifact;
    },
    checkRun: async (_caller, runId, callIds) => {
      asked.push(`${runId}:${callIds.join(",")}`);
      const run = (world.runs ?? {})[runId];
      if (run instanceof Error) throw run;
      if (!run) return "none";
      return { owner_plugin_id: run.owner ?? "io.molis.work.coding",
        commands: callIds.map(call_id => ({ call_id, recorded: true, exit_code: 0, timed_out: false, cancelled: false, changed_after: false, ...(run.commands[call_id] ?? { recorded: false, exit_code: null, changed_after: true }) })) };
    },
  };
}
const receipt = (call_id: string, run_id = RUN) => ({ kind: "command_receipt" as const, run_id, call_id });
async function assessed(world: World, basis: GoalEventJudgmentBasisInput, options: { session?: string | null; verdict?: "supports" | "contradicts"; who?: { audience: string; delegated_audience?: string } } = {}) {
  const ports = portsOf(world), session = options.session === undefined ? SESSION : options.session ?? undefined;
  const trusted = await assessGoalReport(ports, callerOf(session, undefined, options.who), { goal_id: "g", idempotency_key: "k",
    events: [{ type_id: "delivery", type_version: 1, title: "t", fields: {}, judgments: [{ requirement_id: "r", verdict: options.verdict ?? "supports", basis }] }] });
  return { trusted, assessment: trusted.assessments.get(goalEventAssessmentKey(0, "r")) ?? null, asked: ports.asked };
}
const passed = { [RUN]: { commands: { "call-test": {} } } };

test("EVD-10: a basis that names a version the person has not confirmed as the Goal's deliverable refuses the whole report", async () => {
  for (const verdict of ["supports", "contradicts"] as const) {
    await assert.rejects(assessed({ deliverables: [V2], runs: passed }, basisOf(V1, [receipt("call-test")]), { verdict }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_report.basis_not_deliverable", verdict);
  }
});

test("EVD-11: a command the platform ran in the round that made the checked version, ended with exit 0 and followed by no write, is machine-verified", async () => {
  const { trusted, assessment, asked } = await assessed({ runs: passed }, basisOf(V1, [receipt("call-test")]));
  assert.deepEqual(assessment, { tier: "machine_verified", gap: null });
  assert.equal(trusted.reporter_session, SESSION);
  assert.deepEqual(asked, [`${RUN}:call-test`]);
  // A judgment against the requirement is never graded: nothing it cites is looked up.
  const against = await assessed({ runs: passed }, basisOf(V1, [receipt("call-test")]), { verdict: "contradicts" });
  assert.deepEqual([against.assessment, against.asked], [null, []]);
});

test("EVD-12: missing, unreadable, mismatched and failed evidence each leave the judgment the reporter's own word, with what was missing", async () => {
  const cited = basisOf(V1, [receipt("call-test")]);
  const cases: Array<[string, World, GoalEventJudgmentBasisInput, GoalEventJudgmentAssessment["gap"], (string | null)?]> = [
    ["the call has no platform session behind it", { runs: passed }, cited, "evidence_missing", null],
    ["the command has no receipt", { runs: { [RUN]: { commands: {} } } }, cited, "evidence_missing"],
    ["the version cannot be read", { runs: passed, artifact: new Error("成果库读不到") }, cited, "evidence_unreadable"],
    ["the version is not there", { runs: passed, artifact: null }, cited, "evidence_unreadable"],
    ["the platform's answer about the round fails", { runs: { [RUN]: new Error("宿主不可用") } }, cited, "evidence_unreadable"],
    ["the round is not in the caller's own session", { runs: {} }, cited, "subject_mismatch"],
    ["the receipt is of another round than the one that made the version", { runs: { ...passed, "run-other": { commands: { "call-test": {} } } } }, basisOf(V1, [receipt("call-test", "run-other")]), "subject_mismatch"],
    ["one receipt of several is of another round", { runs: passed }, basisOf(V1, [receipt("call-test"), receipt("call-test", "run-other")]), "subject_mismatch"],
    ["the version was not fixed from a round at all", { runs: passed, artifact: { producer_plugin_id: "io.molis.work.coding", origin: { kind: "imported" } } }, cited, "subject_mismatch"],
    ["the version was made by another plugin than the session's owner", { runs: passed, artifact: { producer_plugin_id: "io.molis.work.pages", origin: { kind: "pinned", revision: RUN } } }, cited, "subject_mismatch"],
    ["the round wrote again after the command", { runs: { [RUN]: { commands: { "call-test": { changed_after: true } } } } }, cited, "subject_mismatch"],
    ["the command exited with 1", { runs: { [RUN]: { commands: { "call-test": { exit_code: 1 } } } } }, cited, "check_failed"],
    ["the command timed out", { runs: { [RUN]: { commands: { "call-test": { exit_code: null, timed_out: true } } } } }, cited, "check_failed"],
    ["the command was cancelled", { runs: { [RUN]: { commands: { "call-test": { exit_code: null, cancelled: true } } } } }, cited, "check_failed"],
    ["one command of two failed", { runs: { [RUN]: { commands: { "call-test": {}, "call-lint": { exit_code: 2 } } } } }, basisOf(V1, [receipt("call-test"), receipt("call-lint")]), "check_failed"],
  ];
  for (const [what, world, basis, gap, session] of cases) {
    const { assessment } = await assessed(world, basis, session === undefined ? {} : { session });
    assert.deepEqual(assessment, { tier: "self_reported", gap }, what);
  }
});

test("EVD-13: a review counts only from another platform session than the worker's: not the one that made the version, not one that already said so itself, and only once a worker has spoken", async () => {
  const review = basisOf(V1);
  const cases: Array<[string, World, GoalEventJudgmentAssessment, (string | null)?]> = [
    ["another session, after the worker reported it done", { spoke: [SESSION] }, { tier: "peer_reviewed", gap: null }, "session-reviewer"],
    ["the session that made the version", { runs: { [RUN]: { commands: {} } }, spoke: ["session-other"] }, { tier: "self_reported", gap: null }],
    ["a session that already reported it done on its own word", { spoke: [SESSION, "session-other"] }, { tier: "self_reported", gap: null }],
    ["nobody else has spoken", { spoke: [] }, { tier: "self_reported", gap: null }, "session-reviewer"],
    // Nothing says who made such a version, so the caller may be its maker (review M4).
    ["the version was not fixed from a round, though a worker has spoken", { spoke: ["session-other"], artifact: { producer_plugin_id: "io.molis.work.coding", origin: { kind: "imported" } } }, { tier: "self_reported", gap: null }],
    ["no platform session behind the call", { spoke: [SESSION] }, { tier: "self_reported", gap: "evidence_missing" }, null],
    ["the version cannot be read", { spoke: [SESSION], artifact: new Error("成果库读不到") }, { tier: "self_reported", gap: "evidence_unreadable" }, "session-reviewer"],
    ["the platform cannot say whose round made it", { spoke: [SESSION], runs: { [RUN]: new Error("宿主不可用") } }, { tier: "self_reported", gap: "evidence_unreadable" }, "session-reviewer"],
  ];
  for (const [what, world, expected, session] of cases) {
    const { assessment } = await assessed(world, review, session === undefined ? {} : { session });
    assert.deepEqual(assessment, expected, what);
  }
});

test("EVD-15: a session an external client names for itself is no platform session: over MCP, or handed on by a plugin for it, the report stays its own word and its session is not kept", async () => {
  for (const who of [{ audience: "mcp" }, { audience: "workflow", delegated_audience: "mcp" }, { audience: "workflow" }, { audience: "user" }]) {
    const machine = await assessed({ runs: passed }, basisOf(V1, [receipt("call-test")]), { who });
    assert.deepEqual([machine.assessment, machine.trusted.reporter_session, machine.asked], [{ tier: "self_reported", gap: "evidence_missing" }, null, []], JSON.stringify(who));
    const review = await assessed({ spoke: [SESSION] }, basisOf(V1), { session: "session-reviewer", who });
    assert.deepEqual(review.assessment, { tier: "self_reported", gap: "evidence_missing" }, JSON.stringify(who));
  }
  // An agent round a plugin hands the call on for keeps the session the Host bound it to.
  const handed = await assessed({ runs: passed }, basisOf(V1, [receipt("call-test")]), { who: { audience: "workflow", delegated_audience: "agent" } });
  assert.deepEqual(handed.assessment, { tier: "machine_verified", gap: null });
});

test("EVD-16: several requirements citing the same commands of the same round ask the platform once", async () => {
  const ports = portsOf({ runs: { [RUN]: { commands: { "call-test": {}, "call-lint": {} } } } });
  const judgment = (requirement_id: string, calls: string[]) => ({ requirement_id, verdict: "supports" as const, basis: basisOf(V1, calls.map(call => receipt(call))) });
  const trusted = await assessGoalReport(ports, callerOf(SESSION), { goal_id: "g", idempotency_key: "k",
    events: [{ type_id: "delivery", type_version: 1, title: "t", fields: {}, judgments: [judgment("r1", ["call-test", "call-lint"]), judgment("r2", ["call-lint", "call-test"]), judgment("r3", ["call-test"])] }] });
  assert.deepEqual([...trusted.assessments.values()].map(item => item.tier), ["machine_verified", "machine_verified", "machine_verified"]);
  assert.deepEqual(ports.asked, [`${RUN}:call-lint,call-test`, `${RUN}:call-test`]);
});

test("EVD-17: a version cited as evidence that is not in the 成果库, or cannot be read, backs nothing: a passed command and another session's review both stay the reporter's own word", async () => {
  const other = { kind: "artifact_version" as const, artifact_id: "artifact-notes", version: 3 };
  for (const [what, found] of [["not there", null], ["unreadable", new Error("成果库读不到")]] as const) {
    const world = { runs: passed, spoke: [SESSION], cited: { "artifact-notes@3": found } };
    const machine = await assessed(world, basisOf(V1, [receipt("call-test"), other]));
    assert.deepEqual([machine.assessment, machine.asked], [{ tier: "self_reported", gap: "evidence_unreadable" }, []], `a passed command, ${what}`);
    const review = await assessed(world, basisOf(V1, [other]), { session: "session-reviewer" });
    assert.deepEqual(review.assessment, { tier: "self_reported", gap: "evidence_unreadable" }, `a review, ${what}`);
  }
  // A cited version that is there changes nothing.
  assert.deepEqual((await assessed({ runs: passed }, basisOf(V1, [receipt("call-test"), other]))).assessment, { tier: "machine_verified", gap: null });
});

test("EVD-14: a cancelled call stops at the lookup instead of saving the report as unverified", async () => {
  const stop = new AbortController(), ports = portsOf({ artifact: new Error("已取消") });
  stop.abort();
  await assert.rejects(assessGoalReport(ports, callerOf(SESSION, stop.signal), { goal_id: "g", idempotency_key: "k",
    events: [{ type_id: "delivery", type_version: 1, title: "t", fields: {}, judgments: [{ requirement_id: "r", verdict: "supports", basis: basisOf(V1) }] }] }), /已取消/u);
});

// ---- The library's step from version 1 (EVD-20). ----

test("EVD-20: a library at Goals' version 1 is taken to the current version with every judgment and conclusion kept, read as the reporter's own word, and equal to a new library", () => {
  const current = readFileSync(new URL("./fixtures/goal-event-history/approved-completed.sql", import.meta.url), "utf8");
  // The same library as it was at version 1: the six columns of the step to 2 and the concerns' cited objects of the step to 3 gone, the ledger at 1.
  const added = ["    basis_json TEXT,\n", "    tier TEXT NOT NULL DEFAULT 'self_reported',\n", "    gap TEXT,\n", "    reporter_session TEXT,\n", "    checked_artifact_id TEXT,\n", "    checked_version INTEGER,\n"];
  let old = current.replace(`VALUES ('io.molis.work.goals','official-goals-binding','goals',${GOALS_PROJECT_DATABASE.version},`, "VALUES ('io.molis.work.goals','official-goals-binding','goals',1,");
  const cited = "    updated_at TEXT NOT NULL,\n    cited_subjects_json TEXT NOT NULL DEFAULT '[]'\n";
  assert.equal(old.split(cited).length, 2, cited);
  old = old.replace(cited, "    updated_at TEXT NOT NULL\n");
  for (const line of added) { assert.equal(old.split(line).length, 2, line); old = old.replace(line, ""); }
  const before = new DatabaseSync(":memory:"), fresh = new DatabaseSync(":memory:");
  try {
    before.exec(old); fresh.exec(current);
    const count = (db: DatabaseSync, table: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
    const judgments = count(before, "goal_work_event_judgments"), conclusions = count(before, "goal_event_requirement_conclusions");
    assert.ok(judgments > 0);
    upgradePluginTables(before, "evidence-test", goalsManifest);
    assert.equal((before.prepare("SELECT version FROM plugin_project_databases WHERE plugin_id = ?").get(goalsManifest.plugin_id) as { version: number }).version, GOALS_PROJECT_DATABASE.version);
    assert.equal(count(before, "goal_work_event_judgments"), judgments);
    assert.equal(count(before, "goal_event_requirement_conclusions"), conclusions);
    assert.deepEqual(before.prepare("SELECT DISTINCT tier, gap, basis_json, reporter_session FROM goal_work_event_judgments").all().map(row => ({ ...row })),
      [{ tier: "self_reported", gap: null, basis_json: null, reporter_session: null }]);
    for (const table of ["goal_work_event_judgments", "goal_event_requirement_conclusions", "goal_event_concerns"]) {
      assert.deepEqual(describeSqliteSchema(before).tables[table], describeSqliteSchema(fresh).tables[table], table);
    }
  } finally { before.close(); fresh.close(); }
});
