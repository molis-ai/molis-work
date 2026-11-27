import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AcceptanceSubject, AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { acceptanceReplica, acceptanceSyncKey, openAcceptance } from "@molis-ai/molis-work-module-acceptance";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";

// The platform's requirements and acceptance between one person's devices (contract-design §10.5, user 2026-11-18 「Add sync now」): one
// key per subject; requirements and deliveries only move forward, checks and decisions are a union, a copy each side went on with is a
// conflict that stops that subject until the person picks a side, and a synced decision counts once its trusted-decision record is here.

const at = "2026-11-18T09:00:00.000Z";
const SUBJECT: AcceptanceSubject = { provider_id: "plugin.sample", subject: { kind: "task", id: "t1" } };
const PROVIDER = { project_id: "p1", actor_id: "plugin.sample", person: false, session: null };
const PERSON = { project_id: "p1", actor_id: "web-user", person: true, session: null };
const NO_EVIDENCE = { artifactReadable: async () => false, checkRun: async () => "none" as const, stopped: () => false };

function device(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "acceptance-sync-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.db"));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  writeProjectRoot(store.db, "p1", at);
  // The trusted-decision records this device holds; a synced decision counts only once its record is here too (§10.9 question 11).
  const records = new Set<string>();
  let revoked = false;
  const service = openAcceptance(store.db, "p1", { now: () => at, vouched: id => records.has(id) });
  const replica = acceptanceReplica(store.db, "p1", "same-space", () => { if (revoked) throw new ActionError("actions.forbidden", "sync selection revoked"); });
  const view = (): AcceptanceView => service.read(PROVIDER, { subjects: [SUBJECT] }).views[0]!;
  const rows = () => ["requirements", "deliveries", "checks", "decisions"].map(table =>
    JSON.stringify(store.db.prepare(`SELECT r.* FROM acceptance_${table} r JOIN acceptance_subjects s USING (subject_no) ORDER BY 2, 3, 4`).all()));
  return { store, service, replica, records, view, rows, revoke: (value: boolean) => { revoked = value; } };
}

type Device = ReturnType<typeof device>;
/** Everything `from` has to send, received by `to` at the next revision, and acknowledged back. */
function send(from: Device, to: Device, revision: { value: number }) {
  for (let change = from.replica.next(); change; change = from.replica.next()) {
    revision.value += 1;
    to.replica.receive({ ...change, revision: revision.value });
    from.replica.acknowledge(change.key, change.operationId, revision.value);
  }
}

test("PEQ-16 acceptance sync carries requirements, deliveries, checks and decisions, replays a retry, refuses a revoked selection, and counts a decision only with its record", async t => {
  const a = device(t), b = device(t), revision = { value: 0 };
  a.service.set(PROVIDER, { subject: SUBJECT, requirements: [{ id: "r1", statement: "能打开", requires_person: false }, { id: "r2", statement: "看得懂", requires_person: true }] });
  await a.service.deliver(PROVIDER, { subject: SUBJECT, version: "v1" }, NO_EVIDENCE);
  const first = a.replica.next()!;
  assert.equal(first.key, acceptanceSyncKey("p1", SUBJECT), "one key per subject");
  b.replica.receive({ ...first, revision: 1 });
  b.replica.receive({ ...first, revision: 1 }, { retry: true });
  a.replica.acknowledge(first.key, first.operationId, 1);
  revision.value = 1;
  assert.deepEqual(b.rows(), a.rows(), "the second device has the same requirements and delivery");
  assert.deepEqual(b.view().requirements.map(item => [item.id, item.statement, item.version]), [["r1", "能打开", 1], ["r2", "看得懂", 1]]);

  // A check on one device and the person's decision on the other: each travels, and both end up with both (a union).
  await b.service.report(PROVIDER, { subject: SUBJECT, reports: [{ requirement_id: "r1", verdict: "supports", checked: { version: "v1" }, method: "打开页面", observed: "能打开" }] }, NO_EVIDENCE);
  // As the Host commits it: the trusted-decision record goes in with the item decisions.
  const decided = a.service.decide(PERSON, { subject: SUBJECT, version: "v1", accepts: [{ id: "r2", version: 1 }], returns: [] }, "decision-1", () => a.records.add("decision-1"));
  assert.equal(decided.requirements.find(item => item.id === "r2")?.person, "accepted");
  send(b, a, revision);
  send(a, b, revision);
  assert.deepEqual(b.rows(), a.rows(), "both devices hold the check and the decision");

  // The decision reached the second device before its trusted-decision record: it waits, and counts once the record is there.
  const waiting = b.view().requirements.find(item => item.id === "r2")!;
  assert.deepEqual([waiting.person, waiting.awaiting_voucher, waiting.satisfied], ["pending", true, false]);
  b.records.add("decision-1");
  assert.deepEqual(b.view().requirements.find(item => item.id === "r2")?.person, "accepted");

  // A revoked selection refuses the next change and leaves the cursor where it was.
  await a.service.deliver(PROVIDER, { subject: SUBJECT, version: "v2", touches: ["r1"] }, NO_EVIDENCE);
  const second = a.replica.next()!;
  b.revoke(true);
  const cursor = b.replica.cursor();
  assert.throws(() => b.replica.receive({ ...second, revision: revision.value + 1 }), { code: "actions.forbidden" });
  assert.equal(b.replica.cursor(), cursor);
  b.revoke(false);
  b.replica.receive({ ...second, revision: revision.value + 1 });
  assert.equal(b.view().round, 2, "the delivery moved forward");
});

test("PEQ-16 two devices that each changed the requirements conflict and stop syncing that subject; taking the other copy converges byte for byte, and the logs refuse edits otherwise", async t => {
  const a = device(t), b = device(t), revision = { value: 0 };
  a.service.set(PROVIDER, { subject: SUBJECT, requirements: [{ id: "r1", statement: "能打开", requires_person: false }] });
  send(a, b, revision);
  assert.deepEqual(b.rows(), a.rows());

  // Offline, each device lists one more requirement of its own.
  a.service.set(PERSON, { subject: SUBJECT, requirements: [{ id: "r1", statement: "能打开", requires_person: false }, { id: "ra", statement: "A 加的", requires_person: false }] });
  b.service.set(PERSON, { subject: SUBJECT, requirements: [{ id: "r1", statement: "能打开", requires_person: false }, { id: "rb", statement: "B 加的", requires_person: false }] });
  const fromA = a.replica.next()!;
  b.replica.receive({ ...fromA, revision: revision.value + 1 });
  assert.equal(b.replica.conflicts().length, 1, "both went on: a conflict, both copies kept");
  assert.deepEqual(b.view().requirements.map(item => item.id), ["r1", "rb"], "the local copy stays until the person picks a side");
  assert.equal(b.replica.next(), null, "a subject in conflict stops syncing");

  // Without the person's choice the logs are append-only.
  assert.throws(() => b.store.db.prepare("DELETE FROM acceptance_requirements").run(), /只追加|append|abort|ABORT/i);

  // The person takes the other device's copy: the subject's rows are replaced whole, and the two devices hold the same bytes.
  b.replica.resolve(fromA.key, "remote");
  assert.deepEqual(b.replica.conflicts(), []);
  assert.deepEqual(b.rows(), a.rows());
  assert.deepEqual(b.view().requirements.map(item => item.id), ["r1", "ra"]);
});

test("PEQ-16 a synced decision with an unvouched or non-trusted origin is refused by the acceptance schema", async t => {
  const a = device(t), b = device(t);
  a.service.set(PROVIDER, { subject: SUBJECT, requirements: [{ id: "r1", statement: "需要本人认可", requires_person: true }] });
  await a.service.deliver(PROVIDER, { subject: SUBJECT, version: "v1" }, NO_EVIDENCE);
  const first = a.replica.next()!;
  b.replica.receive({ ...first, revision: 1 });
  const payload = first.value as Record<string, unknown>;
  const forged = {
    ...first,
    operationId: "forged-origin-op",
    revision: 2,
    value: {
      ...payload,
      decisions: [{
        decision_id: "forged-1", clock: 1, requirement_id: "r1", requirement_version: 1, stands_round: 1, version: "v1",
        decision: "accepted", note: null, origin: "goals_v5", origin_ref: "gov-1", actor_id: "web-user", decided_at: at,
      }],
    },
  };
  // `receive` quarantines a failed apply as a conflict without touching acceptance tables; even resolving with `remote` cannot bypass the schema CHECK.
  b.replica.receive(forged);
  assert.deepEqual(b.replica.conflicts().map(item => item.key), [forged.key]);
  assert.equal(b.rows()[3], "[]", "refused decision writes nothing");
  const state = b.view().requirements[0]!;
  assert.deepEqual([state.person, state.satisfied], ["pending", false], "refused decision writes nothing");
  assert.throws(() => b.replica.resolve(forged.key, "remote"), /CHECK constraint failed/i);
  assert.equal(b.rows()[3], "[]", "even resolving as remote writes nothing");
});

test("S-acceptance-evidence-tier EVD-43: replicated checks and deliveries refuse forged tier/gap, missing or malformed evidence, oversized evidence arrays, and bad touches_json at both replica and SQLite CHECK layers", async t => {
  const a = device(t), b = device(t), revision = { value: 0 };
  a.service.set(PROVIDER, { subject: SUBJECT, requirements: [{ id: "r1", statement: "通过检查", requires_person: false }] });
  await a.service.deliver(PROVIDER, { subject: SUBJECT, version: "v1" }, NO_EVIDENCE);
  await a.service.report(PROVIDER, { subject: SUBJECT, reports: [{ requirement_id: "r1", verdict: "supports", checked: { version: "v1" }, method: "跑测试", observed: "通过" }] }, NO_EVIDENCE);
  const first = a.replica.next()!;
  send(a, b, revision);
  // Build a fresh baseline payload with 1 valid self_reported check to mutate against a clean device c.
  const basePayload = first.value as {
    space_id: string; project_id: string; created_at: string;
    requirements: Record<string, unknown>[]; deliveries: Record<string, unknown>[];
    checks: Record<string, unknown>[]; decisions: Record<string, unknown>[];
  };
  const baseCheck = basePayload.checks[0]!;
  assert.deepEqual([baseCheck.tier, baseCheck.gap], ["self_reported", null]);

  const mutations: Array<[string, (value: typeof basePayload) => void]> = [
    ["unknown tier", v => { v.checks[0]!.tier = "verified"; }],
    ["unknown gap", v => { v.checks[0]!.gap = "whatever"; }],
    ["unknown kind", v => { v.checks[0]!.kind = "manual"; }],
    ["unknown verdict", v => { v.checks[0]!.verdict = "maybe"; }],
    ["elevated tier with gap", v => {
      v.checks[0]!.tier = "machine_checked"; v.checks[0]!.gap = "check_failed";
      v.checks[0]!.reporter_session = "s-1"; v.checks[0]!.evidence_json = JSON.stringify([{ kind: "command_receipt", run_id: "r", call_id: "c" }]);
    }],
    ["machine_checked with empty evidence", v => {
      v.checks[0]!.tier = "machine_checked"; v.checks[0]!.gap = null;
      v.checks[0]!.reporter_session = "s-1"; v.checks[0]!.evidence_json = "[]";
    }],
    ["machine_checked without reporter_session", v => {
      v.checks[0]!.tier = "machine_checked"; v.checks[0]!.gap = null;
      v.checks[0]!.reporter_session = null; v.checks[0]!.evidence_json = JSON.stringify([{ kind: "command_receipt", run_id: "r", call_id: "c" }]);
    }],
    ["machine_checked with artifact only", v => {
      v.checks[0]!.tier = "machine_checked"; v.checks[0]!.gap = null;
      v.checks[0]!.reporter_session = "s-1"; v.checks[0]!.evidence_json = JSON.stringify([{ kind: "artifact_version", artifact_id: "a1", version: 1 }]);
    }],
    ["peer_reviewed with empty evidence", v => {
      v.checks[0]!.tier = "peer_reviewed"; v.checks[0]!.gap = null;
      v.checks[0]!.reporter_session = "s-2"; v.checks[0]!.evidence_json = "[]";
    }],
    ["peer_reviewed with command receipt", v => {
      v.checks[0]!.tier = "peer_reviewed"; v.checks[0]!.gap = null;
      v.checks[0]!.reporter_session = "s-2"; v.checks[0]!.evidence_json = JSON.stringify([{ kind: "command_receipt", run_id: "r", call_id: "c" }]);
    }],
    ["malformed evidence_json", v => { v.checks[0]!.evidence_json = "{not json"; }],
    ["non-array evidence_json", v => { v.checks[0]!.evidence_json = "null"; }],
    ["unknown evidence ref kind", v => { v.checks[0]!.evidence_json = JSON.stringify([{ kind: "file_change", path: "a.ts" }]); }],
    ["artifact_version with version 0", v => { v.checks[0]!.evidence_json = JSON.stringify([{ kind: "artifact_version", artifact_id: "a1", version: 0 }]); }],
    ["more than 8 evidence refs", v => {
      v.checks[0]!.evidence_json = JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ kind: "command_receipt", run_id: "r", call_id: `c${i}` })));
    }],
    ["malformed touches_json on delivery", v => { v.deliveries[0]!.touches_json = "{bad"; }],
    ["non-array touches_json on delivery", v => { v.deliveries[0]!.touches_json = "\"r1\""; }],
  ];

  for (const [label, mutate] of mutations) {
    const c = device(t);
    const mutated = structuredClone(basePayload);
    mutate(mutated);
    const event = { ...first, operationId: `evd43-${label}`, revision: 1, value: mutated };
    c.replica.receive(event);
    assert.equal(c.replica.conflicts().length, 1, `receive quarantined: ${label}`);
    assert.throws(() => c.replica.resolve(event.key, "remote"), undefined, `resolve refused: ${label}`);
    assert.equal(c.rows()[2], "[]", `no check written for: ${label}`);
  }

  // Direct SQLite INSERT bypassing replica is still rejected by schema CHECK constraints.
  const d = device(t);
  d.service.set(PROVIDER, { subject: SUBJECT, requirements: [{ id: "r1", statement: "通过检查", requires_person: false }] });
  await d.service.deliver(PROVIDER, { subject: SUBJECT, version: "v1" }, NO_EVIDENCE);
  const subjectNo = (d.store.db.prepare("SELECT subject_no FROM acceptance_subjects LIMIT 1").get() as { subject_no: number }).subject_no;
  assert.throws(() => d.store.db.prepare(
    "INSERT INTO acceptance_checks (check_id,subject_no,clock,requirement_id,requirement_version,round,kind,verdict,tier,gap,checked_version,method,observed,evidence_json,reporter_session,actor_id,reported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run("bad-tier", subjectNo, 1, "r1", 1, 1, "engineering", "supports", "machine_checked", null, "v1", "m", "o", "[]", "s-1", "a", at), /CHECK constraint failed/i);
  assert.throws(() => d.store.db.prepare(
    "INSERT INTO acceptance_checks (check_id,subject_no,clock,requirement_id,requirement_version,round,kind,verdict,tier,gap,checked_version,method,observed,evidence_json,reporter_session,actor_id,reported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run("bad-json", subjectNo, 2, "r1", 1, 1, "engineering", "supports", "self_reported", null, "v1", "m", "o", "{bad", null, "a", at), /CHECK constraint failed/i);
});

test("F-modules-server-09 acceptance replica refuses orphan checks and decisions before replacing rows", async t => {
  const a = device(t), b = device(t);
  a.service.set(PROVIDER, { subject: SUBJECT, requirements: [{ id: "r1", statement: "通过检查", requires_person: false }] });
  await a.service.deliver(PROVIDER, { subject: SUBJECT, version: "v1" }, NO_EVIDENCE);
  await a.service.report(PROVIDER, { subject: SUBJECT, reports: [{ requirement_id: "r1", verdict: "supports", checked: { version: "v1" }, method: "跑测试", observed: "通过" }] }, NO_EVIDENCE);
  const first = a.replica.next()!;
  b.replica.receive({ ...first, revision: 1 });
  const beforeRows = b.rows();
  const payload = structuredClone(first.value as {
    requirements: Record<string, unknown>[]; deliveries: Record<string, unknown>[];
    checks: Record<string, unknown>[]; decisions: Record<string, unknown>[];
  });
  // Orphan check pointing at a nonexistent delivery round.
  const badRound = structuredClone(payload);
  badRound.checks[0]!.round = 99;
  const badRoundEvent = { ...first, operationId: "orphan-round", revision: 2, value: badRound };
  b.replica.receive(badRoundEvent);
  assert.throws(() => b.replica.resolve(badRoundEvent.key, "remote"), { code: "actions.input_invalid" });
  assert.deepEqual(b.rows(), beforeRows);

  // Orphan decision pointing at a nonexistent requirement version.
  const badReq = structuredClone(payload);
  badReq.decisions = [{
    decision_id: "orphan-dec", clock: 1, requirement_id: "r1", requirement_version: 99, stands_round: 1, version: "v1",
    decision: "accepted", note: null, origin: "user_decision", origin_ref: "dec-1", actor_id: "web-user", decided_at: at,
  }];
  const badReqEvent = { ...first, operationId: "orphan-req", revision: 3, value: badReq };
  b.replica.receive(badReqEvent);
  assert.throws(() => b.replica.resolve(badReqEvent.key, "remote"), { code: "actions.input_invalid" });
  assert.deepEqual(b.rows(), beforeRows);
});
