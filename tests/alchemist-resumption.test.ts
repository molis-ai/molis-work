import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { alchemistActions as a } from "@molis-ai/molis-work-plugin-alchemist";
import { alchemistFixture } from "./fixtures/alchemist-actions.js";

async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "alchemist-resumption-")), f = alchemistFixture(home);
  t.after(async () => { await f.close(); await rm(home, { recursive: true, force: true }); });
  return f;
}

test("W5-01-ALC-RES01/07: opening, binding actors, and queries never seed business defaults", async t => {
  const f = await fixture(t), db = f.runtime.database;
  const tables = ["workspaces", "workspace_actors", "runtime_settings", "source_settings", "jobs", "activity_events"];
  const counts = () => tables.map(table => (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
  assert.deepEqual(counts(), tables.map(() => 0));
  f.runtime.actionsFor("read-only-actor");
  await f.bound.invoke(a.bootstrap, {}); await f.bound.invoke(a.settingsGet, {});
  await f.bound.invoke(a.pulseSources, {}); await f.bound.invoke(a.runList, {}); await f.runtime.runPending();
  assert.deepEqual(counts(), tables.map(() => 0));
  await f.bound.invoke(a.directionCreate, { description: "Only an accepted command initializes defaults for its trusted actor" });
  assert.deepEqual(db.prepare("SELECT id FROM workspace_actors ORDER BY id").all(), [{ id: "fixture-owner" }]);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM runtime_settings").get() as { count: number }).count, 1);
});

test("W5-01-ALC-RES02/04/06: continuation confirms current Taste, deduplicates clicks, and uses the new trusted actor", async t => {
  const f = await fixture(t);
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "Continue an old exploration using current preferences" });
  const started = await f.bound.invoke(a.explorationStart, { id: direction.id });
  f.runtime.worker.cancel(started.jobId); // Drop this process's in-memory acceptance; leave the persisted queued job untouched.
  await f.runtime.runPending(); assert.equal(f.requests.length, 0);
  const oldView = await f.bound.invoke(a.runContinuation, { id: started.jobId });
  await f.bound.invoke(a.tasteCreate, { title: "New preference", statement: "Prefer a single-user product", appliesTo: "Ideas", exceptions: [] });
  await assert.rejects(f.bound.invoke(a.runContinue, { id: started.jobId, confirmation: oldView.confirmation }), { code: "alchemist.resume_context_changed", kind: "conflict" });
  assert.equal(f.runtime.worker.isAccepted(started.jobId), false);
  assert.equal((await f.bound.invoke(a.runEvents, { id: started.jobId })).status, "queued");
  const view = await f.bound.invoke(a.runContinuation, { id: started.jobId });
  assert.deepEqual(view.tasteTitles, ["New preference"]);
  f.runtime.database.prepare("UPDATE jobs SET input_json = json_set(input_json, '$.actorId', ?) WHERE id = ?").run("forged-job-owner", started.jobId);
  const caller = { ...f.caller, actor_id: "continuing-owner", permissions: f.caller.permissions.filter(p => p !== "alchemist:collect") };
  const result = await Promise.all([1, 2].map(() => f.service.invoke(caller, a.runContinue, { id: started.jobId, confirmation: view.confirmation })));
  assert.deepEqual(result.map(row => (row as { accepted: boolean }).accepted).sort(), [false, true]);
  await f.runtime.runPending();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0]!.actorId, "continuing-owner");
  assert.equal(f.runtime.database.prepare("SELECT id FROM workspace_actors WHERE id = ?").get("forged-job-owner"), undefined);
  assert.equal(JSON.parse(f.requests[0]!.userPrompt).founderTaste[0].title, "New preference");
  assert.equal((await f.bound.invoke(a.explorationGet, { id: started.runId })).exploration.status, "completed");
});

test("W5-01-ALC-RES04: model policy changes during confirmation are refused without claiming the old job", async t => {
  const f = await fixture(t);
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "Confirm the model before accepting continuation" });
  const started = await f.bound.invoke(a.explorationStart, { id: direction.id }); f.runtime.worker.cancel(started.jobId);
  const view = await f.bound.invoke(a.runContinuation, { id: started.jobId });
  await f.bound.invoke(a.settingsUpdate, { modelId: f.model.id, modelPolicy: "fixed", defaultBudgets: { marketSpace: { kind: "calls", limit: 6 }, buildCost: { kind: "calls", limit: 4 } } });
  await assert.rejects(f.bound.invoke(a.runContinue, { id: started.jobId, confirmation: view.confirmation }), { code: "alchemist.resume_context_changed", kind: "conflict" });
  await f.runtime.runPending(); assert.equal(f.requests.length, 0);
  assert.equal((f.runtime.database.prepare("SELECT attempt FROM jobs WHERE id = ?").get(started.jobId) as { attempt: number }).attempt, 0);
});


test("W5-01-ALC-RES04: a ready checkpoint completes without model discovery or duplicate persisted cards", async t => {
  const f = await fixture(t);
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "Finish a stored generation after the previous process lost its final receipt" });
  const started = await f.bound.invoke(a.explorationStart, { id: direction.id }); await f.runtime.runPending();
  const before = await f.bound.invoke(a.explorationGet, { id: started.runId });
  f.runtime.database.prepare("UPDATE jobs SET status = 'interrupted' WHERE id = ?").run(started.jobId);
  f.ai.listModels = async () => { throw new Error("A complete checkpoint must not discover a model"); };
  const view = await f.bound.invoke(a.runContinuation, { id: started.jobId });
  assert.equal(view.canContinue, true); assert.equal(view.modelId, undefined);
  await f.bound.invoke(a.runContinue, { id: started.jobId }); await f.runtime.runPending();
  assert.equal((await f.bound.invoke(a.runEvents, { id: started.jobId })).status, "completed");
  assert.deepEqual(await f.bound.invoke(a.explorationGet, { id: started.runId }), before);
  assert.equal(f.requests.length, 1);
});


test("W5-01-ALC-RES-AUTH-01: missing category permission refuses before initializing the continuing actor", async t => {
  const f = await fixture(t);
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "Category permission is a continuing authority requirement" });
  const started = await f.bound.invoke(a.explorationStart, { id: direction.id }); f.runtime.worker.cancel(started.jobId);
  const view = await f.bound.invoke(a.runContinuation, { id: started.jobId });
  const caller = { ...f.caller, actor_id: "unapproved-owner", permissions: ["alchemist:read", "alchemist:write"] };
  const before = f.runtime.database.prepare("SELECT * FROM jobs WHERE id = ?").get(started.jobId);
  await assert.rejects(f.service.invoke(caller, a.runContinue, { id: started.jobId, confirmation: view.confirmation }), { code: "actions.forbidden" });
  assert.equal(f.runtime.database.prepare("SELECT id FROM workspace_actors WHERE id = ?").get(caller.actor_id), undefined);
  await f.runtime.runPending(); assert.equal(f.requests.length, 0);
  assert.deepEqual(f.runtime.database.prepare("SELECT * FROM jobs WHERE id = ?").get(started.jobId), before);
});

test("W5-01-ALC-RES-AUTH-01: Pulse continuation needs collection permission without requiring model permission", async t => {
  const f = await fixture(t);
  const { run } = await f.bound.invoke(a.pulseStart, { sourceIds: ["github"] }); f.runtime.worker.cancel(run.jobId);
  const caller = { ...f.caller, actor_id: "pulse-owner", permissions: f.caller.permissions.filter(p => p !== "alchemist:generate") };
  await f.service.invoke(caller, a.runContinue, { id: run.jobId }); await f.runtime.runPending();
  assert.equal((await f.bound.invoke(a.runEvents, { id: run.jobId })).status, "completed");
  assert.equal(f.requests.length, 0);
});

for (const operation of ["collecting", "cross_checking", "cross_checking_format_correction", "synthesizing"] as const) test(`W5-01-ALC-RES05: continuing an unknown ${operation} reserves cumulatively and skips safe stages`, async t => {
  const f = await fixture(t);
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "Recover research without resetting the original budget" });
  const explored = await f.bound.invoke(a.explorationStart, { id: direction.id }); await f.runtime.runPending();
  const { exploration } = await f.bound.invoke(a.explorationGet, { id: explored.runId });
  const { idea } = await f.bound.invoke(a.cardKeep, { id: exploration.cards[0]!.id });
  const planInput = { id: idea.id, lens: "market_space" as const, ideaVersion: 1, modelPolicy: "auto" as const, budget: { kind: "calls" as const, limit: 8 } };
  const seedPlan = await f.bound.invoke(a.researchPlan, planInput);
  const seeded = await f.bound.invoke(a.researchStart, { id: idea.id, lens: "market_space", planId: seedPlan.plan.id }); await f.runtime.runPending();
  const stored = f.runtime.database.prepare("SELECT checkpoint_json FROM jobs WHERE id = ?").get(seeded.run.jobId) as { checkpoint_json: string };
  let ready = JSON.parse(stored.checkpoint_json) as { evidence: { id: string }[]; report: { judgments: { id: string }[] } };
  // The simulated interrupted run has its own evidence and claims, not IDs already persisted by the seed run.
  let checkpointText = stored.checkpoint_json;
  for (const item of [...ready.evidence, ...ready.report.judgments]) checkpointText = checkpointText.replaceAll(item.id, `restored-${item.id}`);
  ready = JSON.parse(checkpointText);
  const { plan } = await f.bound.invoke(a.researchPlan, planInput);
  const { run } = await f.bound.invoke(a.researchStart, { id: idea.id, lens: "market_space", planId: plan.id }); f.runtime.worker.cancel(run.jobId);
  const operations = operation === "collecting" ? ["collecting"] : operation === "cross_checking" ? ["collecting", "cross_checking"]
    : ["collecting", "cross_checking", operation];
  const previous = operation === "collecting" ? { stage: "planning_complete" }
    : operation === "synthesizing" ? { stage: "cross_checking_complete", evidence: ready.evidence, claims: ready.report.judgments }
      : { stage: "collecting_complete", evidence: ready.evidence };
  const db = f.runtime.database;
  db.prepare("UPDATE jobs SET status = 'interrupted', checkpoint_json = ? WHERE id = ?")
    .run(JSON.stringify({ stage: "call_dispatched", operation, callsUsed: operations.length, previous }), run.jobId);
  for (const [index, name] of operations.entries()) db.prepare("INSERT INTO job_events (job_id, sequence, type, payload_json, created_at) SELECT ?, COALESCE(MAX(sequence),0)+1, 'call_started', ?, ? FROM job_events WHERE job_id = ?")
    .run(run.jobId, JSON.stringify({ operation: name, callsUsed: index + 1, limit: 8 }), new Date().toISOString(), run.jobId);
  let searches = 0; const search = f.ai.search; f.ai.search = async input => { searches++; return search(input); };
  const beforeModels = f.requests.length, view = await f.bound.invoke(a.runContinuation, { id: run.jobId });
  assert.equal(view.canContinue, true);
  assert.deepEqual(view.budget, { limit: 8, reserved: operations.length, remaining: 8 - operations.length });
  assert.deepEqual(view.unknownCall, { operation }); assert.equal(view.modelId, plan.modelId);
  await f.bound.invoke(a.runContinue, { id: run.jobId }); await f.runtime.runPending();
  assert.equal((await f.bound.invoke(a.runEvents, { id: run.jobId })).status, "completed");
  assert.equal(searches, operation === "collecting" ? 1 : 0);
  assert.equal(f.requests.length - beforeModels, operation === "synthesizing" ? 1 : 2);
  const reservations = db.prepare("SELECT payload_json FROM job_events WHERE job_id = ? AND type = 'call_started' ORDER BY sequence").all(run.jobId) as { payload_json: string }[];
  assert.deepEqual(reservations.map(row => JSON.parse(row.payload_json).callsUsed), Array.from({ length: operations.length + searches + f.requests.length - beforeModels }, (_, index) => index + 1));
  assert.equal((await f.bound.invoke(a.researchGet, { id: idea.id, version: 1 })).lenses.market_space.plan!.budget.limit, 8);
});

test("W5-01-ALC-RES05 W5-01-ALC-RES08: exhausted unknown calls stay refused while a safe checkpoint can finish without calls", async t => {
  const f = await fixture(t);
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "Expose the original budget without changing its execution contract" });
  const explored = await f.bound.invoke(a.explorationStart, { id: direction.id }); await f.runtime.runPending();
  const { exploration } = await f.bound.invoke(a.explorationGet, { id: explored.runId });
  const { idea } = await f.bound.invoke(a.cardKeep, { id: exploration.cards[0]!.id });
  const { plan } = await f.bound.invoke(a.researchPlan, { id: idea.id, lens: "market_space", ideaVersion: 1, modelPolicy: "auto", budget: { kind: "calls", limit: 1 } });
  const { run } = await f.bound.invoke(a.researchStart, { id: idea.id, lens: "market_space", planId: plan.id }); f.runtime.worker.cancel(run.jobId);
  const db = f.runtime.database;
  db.prepare("UPDATE jobs SET status = 'interrupted', checkpoint_json = ? WHERE id = ?")
    .run(JSON.stringify({ stage: "call_dispatched", operation: "collecting", callsUsed: 1, previous: { stage: "planning_complete" } }), run.jobId);
  db.prepare("INSERT INTO job_events (job_id, sequence, type, payload_json, created_at) SELECT ?, COALESCE(MAX(sequence),0)+1, 'call_started', ?, ? FROM job_events WHERE job_id = ?")
    .run(run.jobId, JSON.stringify({ operation: "collecting", callsUsed: 1, limit: 1 }), new Date().toISOString(), run.jobId);
  const facts = () => ["jobs", "job_events", "lens_runs", "lens_reports"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const before = facts(), view = await f.bound.invoke(a.runContinuation, { id: run.jobId });
  assert.equal(view.canContinue, false); assert.equal(view.reason, "alchemist.research_budget_exhausted");
  assert.deepEqual(view.budget, { limit: 1, reserved: 1, remaining: 0 }); assert.deepEqual(view.unknownCall, { operation: "collecting" });
  await assert.rejects(f.bound.invoke(a.runContinue, { id: run.jobId }), { code: "alchemist.research_budget_exhausted", kind: "conflict" }); assert.deepEqual(facts(), before);
  // A separately persisted successful response is safe to finish within the same exhausted budget.
  db.prepare("UPDATE jobs SET checkpoint_json = ? WHERE id = ?").run(JSON.stringify({ stage: "collecting_complete", evidence: [] }), run.jobId);
  f.ai.search = async () => { throw new Error("No new provider call is permitted"); };
  f.ai.generate = async () => { throw new Error("No new model call is permitted"); };
  f.ai.listModels = async () => { throw new Error("A safe checkpoint does not need model discovery"); };
  const safe = await f.bound.invoke(a.runContinuation, { id: run.jobId });
  assert.equal(safe.canContinue, true); assert.deepEqual(safe.budget, view.budget); assert.equal(safe.unknownCall, undefined);
  await f.bound.invoke(a.runContinue, { id: run.jobId }); await f.runtime.runPending();
  assert.equal((await f.bound.invoke(a.runEvents, { id: run.jobId })).status, "completed");
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM job_events WHERE job_id = ? AND type = 'call_started'").get(run.jobId) as { count: number }).count, 1);
});

test("W5-01-ALC-RES09: an Exploration stopped after its model call left shows the unknown call, and a confirmation given before it is refused", async t => {
  const f = await fixture(t), db = f.runtime.database;
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "A generation whose result never came back may have been charged" });
  const started = await f.bound.invoke(a.explorationStart, { id: direction.id }); f.runtime.worker.cancel(started.jobId);
  const before = await f.bound.invoke(a.runContinuation, { id: started.jobId });
  assert.equal(before.unknownCall, undefined);
  // The handler saves `generating` just before it calls the model; a run stopped there may have been charged.
  db.prepare("UPDATE jobs SET status = 'interrupted', checkpoint_json = ? WHERE id = ?").run(JSON.stringify({ stage: "generating" }), started.jobId);
  const view = await f.bound.invoke(a.runContinuation, { id: started.jobId });
  assert.equal(view.canContinue, true); assert.deepEqual(view.unknownCall, { operation: "generating" });
  assert.notEqual(view.confirmation, before.confirmation, "what the person confirms includes the unknown call");
  await assert.rejects(f.bound.invoke(a.runContinue, { id: started.jobId, confirmation: before.confirmation }), { code: "alchemist.resume_context_changed", kind: "conflict" });
  await f.runtime.runPending(); assert.equal(f.requests.length, 0, "a confirmation given before the unknown call dispatches nothing");
  assert.equal((await f.bound.invoke(a.runContinue, { id: started.jobId, confirmation: view.confirmation })).accepted, true);
  await f.runtime.runPending();
  assert.equal(f.requests.length, 1, "continuing calls the model again, as the person was told");
  assert.equal((await f.bound.invoke(a.explorationGet, { id: started.runId })).exploration.status, "completed");
});

test("W5-01-ALC-RES10: a refused continuation names its declared code and kind, never actions.execution_failed", async t => {
  const f = await fixture(t), db = f.runtime.database;
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "Each refusal to continue says why" });
  const started = await f.bound.invoke(a.explorationStart, { id: direction.id }); f.runtime.worker.cancel(started.jobId);
  const job = (status: string, extra = "") => db.prepare(`UPDATE jobs SET status = ?${extra} WHERE id = ?`).run(status, started.jobId);
  const continuing = () => f.bound.invoke(a.runContinue, { id: started.jobId });
  // An entry that cannot hold authority past the request has nothing to continue the job with.
  const studio = await f.runtime.actionsFor(f.caller.actor_id);
  await assert.rejects(studio.invoke(a.runContinue, { id: started.jobId }), { code: "alchemist.background_authority_required", kind: "unavailable" });
  job("running", ", lease_owner = 'another-process', lease_expires_at = '2999-01-01T00:00:00.000Z'");
  await assert.rejects(continuing(), { code: "alchemist.job_lease_active", kind: "conflict" });
  assert.equal((await f.bound.invoke(a.runContinuation, { id: started.jobId })).reason, "alchemist.job_lease_active");
  job("completed", ", lease_owner = NULL, lease_expires_at = NULL");
  await assert.rejects(continuing(), { code: "alchemist.job_not_resumable", kind: "conflict" });
  job("failed", ", error_code = 'alchemist.ai_output_invalid'");
  await assert.rejects(continuing(), { code: "alchemist.job_not_resumable", kind: "conflict" });
  db.prepare("UPDATE jobs SET status = 'interrupted', kind = 'alchemist.unknown_kind' WHERE id = ?").run(started.jobId);
  await assert.rejects(continuing(), { code: "alchemist.job_kind_unsupported", kind: "invalid" });
  await assert.rejects(f.bound.invoke(a.runContinue, { id: "job-that-never-was" }), { code: "alchemist.run_not_found" });
  await assert.rejects(f.bound.invoke(a.runContinuation, { id: "job-that-never-was" }), { code: "alchemist.run_not_found" });
  await f.runtime.runPending(); assert.equal(f.requests.length, 0, "no refusal dispatched a model call");
});
