import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { AcceptanceSubject, AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { openAcceptance } from "@molis-ai/molis-work-module-acceptance";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

// PEQ-16 (specs/plugin-equal-standing/spec.md; contract-design §10): per-item acceptance is the platform's. An assistant background task
// in a project without Goals is looked at item by item, each item accepted or returned, and after rework only the items the new version
// touched wait for another look; the same steps on a Goal end the same way; and the words, checks and decisions are stored once, in the
// platform's tables, not in Goals'.

const at = "2026-11-18T09:00:00.000Z";
const NO_EVIDENCE = { artifactReadable: async () => false, checkRun: async () => "none" as const, stopped: () => false };
const WORK: AcceptanceSubject = { provider_id: "system.assistant.rules", subject: { kind: "assistant_work", id: "work-1" } };
const GOAL: AcceptanceSubject = { provider_id: "io.molis.work.goals", subject: { kind: "goal", id: "G1" } };

function library(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "acceptance-subjects-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.db"));
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return store;
}

/** The steps of PEQ-16 on one subject: three items, a first version, one accepted and one returned, a rework touching the returned one. */
async function review(store: LocalProjectDatabase, projectId: string, subject: AcceptanceSubject): Promise<AcceptanceView> {
  const records = new Set<string>();
  const service = openAcceptance(store.db, projectId, { now: () => at, vouched: id => records.has(id) });
  const provider = { project_id: projectId, actor_id: subject.provider_id, person: false, session: null };
  const person = { project_id: projectId, actor_id: "web-user", person: true, session: null };
  service.set(provider, { subject, requirements: [
    { id: "r1", statement: "PEQ16 页面能打开", requires_person: false },
    { id: "r2", statement: "PEQ16 文案看得懂", requires_person: true },
    { id: "r3", statement: "PEQ16 数字对得上", requires_person: false },
  ] });
  await service.deliver(provider, { subject, version: "v1" }, NO_EVIDENCE);
  await service.report(provider, { subject, reports: [{ requirement_id: "r3", verdict: "supports", checked: { version: "v1" }, method: "对表", observed: "一致" }] }, NO_EVIDENCE);
  service.decide(person, { subject, version: "v1", accepts: [{ id: "r1", version: 1 }], returns: [{ id: "r2", version: 1, note: "第二段太长" }] },
    `decision-${subject.subject.id}`, () => records.add(`decision-${subject.subject.id}`));
  await service.deliver(provider, { subject, version: "v2", touches: ["r2"] }, NO_EVIDENCE);
  return service.read(provider, { subjects: [subject] }).views[0]!;
}

const outcome = (view: AcceptanceView) => view.requirements.map(item => ({ id: item.id, person: item.person, carried: item.carried, stands_on: item.stands_on,
  recheck: item.recheck, satisfied: item.satisfied }));

test("PEQ-16 an assistant background task without Goals: item by item, and after rework only the touched item waits for another look", async t => {
  const store = library(t);
  writeProjectRoot(store.db, "p1", at);
  const view = await review(store, "p1", WORK);
  assert.deepEqual(outcome(view), [
    { id: "r1", person: "accepted", carried: true, stands_on: "v1", recheck: null, satisfied: true },
    { id: "r2", person: "pending", carried: false, stands_on: "v2", recheck: null, satisfied: false },
    { id: "r3", person: "pending", carried: true, stands_on: "v1", recheck: null, satisfied: false },
  ], "r1 keeps its acceptance and r3 its (self-reported) check on v1; r2, reworked in v2, waits for the person");
});

test("PEQ-16 the same steps on a Goal end the same way, and the words, checks and decisions are only in the platform's tables", async t => {
  const store = library(t);
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ project_id: "board", actor_id: "user-1", idempotency_key: "init" });
  app.goalEvents.createIntent({ project_id: "board", goal_id: "G1", title: "目标", outcome: "结果", actor_id: "web-user", actor_kind: "user", idempotency_key: "goal",
    source_kind: "web" });
  const onGoal = await review(store, "board", GOAL);

  const other = library(t);
  writeProjectRoot(other.db, "p1", at);
  assert.deepEqual(outcome(onGoal), outcome(await review(other, "p1", WORK)), "a Goal and an assistant task read the same");

  // Every text column of every table that holds a requirement's words, a check's observation or a decision's note.
  const holders = (store.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as Array<{ name: string }>).map(row => row.name).filter(table => {
    const columns = (store.db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as Array<{ name: string }>).map(row => row.name);
    return columns.some(column => (store.db.prepare(`SELECT 1 FROM "${table}" WHERE CAST("${column}" AS TEXT) LIKE '%PEQ16 文案看得懂%' OR CAST("${column}" AS TEXT) LIKE '%第二段太长%' LIMIT 1`).get()));
  });
  assert.deepEqual(holders.filter(table => !table.startsWith("acceptance_")), [], "no table of Goals (or anyone else) keeps them");
  assert.deepEqual(holders.sort(), ["acceptance_decisions", "acceptance_requirements"]);
});
