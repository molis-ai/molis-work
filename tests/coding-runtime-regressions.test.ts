import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { artifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { codingSdkRuntime, codingToolResponse } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

const configuration = { intent: "execute", workspace_id: "work", provider_id: "fixture", model_id: "fixture" };
type Started = { run: { ref: AgentRunRef } };
type Delegated = { session: { session_id: string; runtime_session_id: string }; delegation: { delegation_id: string; revision: number }; delivery_unconfirmed?: boolean };
const body = <T>(result: Awaited<ReturnType<Awaited<ReturnType<typeof codingSdkRuntime>>["call"]>>): T => {
  assert.equal(result?.status, 200, JSON.stringify(result)); return result!.body as T;
};
const settle = (fixture: Awaited<ReturnType<typeof codingSdkRuntime>>, ref: AgentRunRef) => new Promise<AgentRunView>((resolve, reject) => {
  let off = () => {}; const timer = setTimeout(() => reject(new Error("real SDK round did not settle")), 15_000);
  off = fixture.adapter.observe(ref, view => { if (!["completed", "failed", "cancelled"].includes(view.phase)) return; clearTimeout(timer); queueMicrotask(() => off());
    if (view.phase === "completed") resolve(view); else reject(new Error(`SDK round ended as ${view.phase}: ${view.stop_reason}`)); });
});
const start = async (fixture: Awaited<ReturnType<typeof codingSdkRuntime>>, id: string, task: string, intent = "discuss") => {
  const opened = body<Started>(await fixture.call(`/sessions/${id}/runs`, { ...configuration, intent, task })); await settle(fixture, opened.run.ref); return opened.run.ref;
};
const until = async (description: string, check: () => boolean | Promise<boolean>, timeout = 15_000) => {
  for (const deadline = Date.now() + timeout; !await check();) { if (Date.now() >= deadline) throw new Error(description); await new Promise(resolve => setTimeout(resolve, 20)); }
};

// W2-18-CODING-DELEGATE-01: actual SDK outbox flush, delivery failure and reopen, preserving the same target and letter.
for (const fault of ["send-after-flush", "deliver"] as const) test(`delegation ${fault} preserves the original SDK letter and target for explicit retry`, { timeout: 30_000 }, async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("A"); body(await fixture.call("/sessions/A", { configuration }, "PATCH"));
  const messages = fixture.adapter.messages!; let inject = true;
  if (fault === "send-after-flush") {
    const send = messages.sendForPeople!.bind(messages);
    t.mock.method(messages, "sendForPeople", async (...args) => { const result = await send(...args); if (inject) { inject = false; throw new Error("SDK outbox flushed; response lost"); } return result; });
  } else {
    const act = messages.act!.bind(messages);
    t.mock.method(messages, "act", async (...args) => { if (inject && args[2] === "deliver") { inject = false; throw new Error("delivery unavailable"); } return act(...args); });
  }
  const made = body<Delegated>(await fixture.call("/sessions/A/delegations", { title: "Original", task: "Keep exactly this task." }));
  assert.equal(made.delivery_unconfirmed, true); const target = made.session.session_id, source = fixture.sessions.get(DEMO_PROJECT_ID, "A").runtime_session_id!;
  const before = await messages.read(DEMO_PROJECT_ID, source); assert.equal(before.length, 1); assert.equal(before[0]!.state, "queued");
  assert.equal(fixture.sessions.get(DEMO_PROJECT_ID, target).state, "idle", "an uncertain send never archives the receiver");
  await fixture.reopenSdk();
  assert.deepEqual((await fixture.adapter.messages!.read(DEMO_PROJECT_ID, source)).map(letter => letter.message_id), [before[0]!.message_id]);
  body(await fixture.call(`/sessions/A/delegations/${before[0]!.message_id}`, { action: "deliver", expected_revision: before[0]!.history.length }));
  const after = await fixture.adapter.messages!.read(DEMO_PROJECT_ID, source);
  assert.equal(after.length, 1); assert.equal(after[0]!.message_id, before[0]!.message_id); assert.equal(after[0]!.state, "delivered");
  assert.equal(fixture.sessions.list(DEMO_PROJECT_ID).length, 2); assert.equal(fixture.sessions.get(DEMO_PROJECT_ID, target).runtime_session_id, made.session.runtime_session_id);
});

// W2-18-CODING-DELEGATE-01: a known pre-send failure and a revoked original invocation have distinct recovery behavior.
test("a known pre-send SDK refusal archives its prepared target and produces no letter", async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("A"); body(await fixture.call("/sessions/A", { configuration }, "PATCH"));
  const create = fixture.adapter.createSession.bind(fixture.adapter);
  t.mock.method(fixture.adapter, "createSession", async (...args) => { if (args[0].title.startsWith("委派：")) throw new Error("target session unavailable before send"); return create(...args); });
  const result = await fixture.call("/sessions/A/delegations", { title: "Known refusal", task: "Never sent." }); assert.ok(result && result.status >= 400);
  assert.deepEqual(await fixture.adapter.messages!.read(DEMO_PROJECT_ID), []);
  assert.deepEqual(fixture.sessions.list(DEMO_PROJECT_ID).map(record => record.session_id), ["A"], "the unaccepted draft is archived, not an active receiver");
});

test("revocation after an actual SDK send flush preserves the outbox but returns no protected target or letter", async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("A"); body(await fixture.call("/sessions/A", { configuration }, "PATCH")); let current = true;
  const messages = fixture.adapter.messages!, send = messages.sendForPeople!.bind(messages);
  t.mock.method(messages, "sendForPeople", async (...args) => { const accepted = await send(...args); current = false; return accepted; });
  const assertCurrent = () => { if (!current) throw new Error("original delegation authority revoked"); };
  const result = await fixture.platform.router().dispatch({ method: "POST", pathname: "/api/plugins/io.molis.work.coding/sessions/A/delegations", actor_id: "web-user", body: { title: "Revoked", task: "One original target." },
    execution: { beforeEffect: async () => assertCurrent(), assert_authority_current: assertCurrent } });
  assert.ok(result && result.status >= 400); assert.ok(result!.body && typeof result!.body === "object");
  assert.equal(Object.hasOwn(result!.body, "session"), false); assert.equal(Object.hasOwn(result!.body, "delegation"), false);
  const letters = await messages.read(DEMO_PROJECT_ID); assert.equal(letters.length, 1); assert.equal(letters[0]!.state, "queued");
  assert.equal(fixture.sessions.list(DEMO_PROJECT_ID).length, 2, "the already prepared receiver and actual SDK outbox are retained");
  body(await fixture.call(`/sessions/A/delegations/${letters[0]!.message_id}`, { action: "deliver" }));
  assert.equal((await messages.read(DEMO_PROJECT_ID)).length, 1);
});

// W2-18-CODING-BACKGROUND-01: real SDK command observation, owner cache preservation on failure, and recovery.
test("a failed SDK background read preserves the last actual command observation and marks it unreadable", { timeout: 30_000 }, async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("A"); let turn = 0;
  t.mock.method(globalThis, "fetch", async () => ++turn === 1 ? codingToolResponse("start-command", { executable: process.execPath, argv: ["-e", "setTimeout(()=>{},30000)"] }) : cogniaModelResponse("The command is running in the background."));
  const started = body<Started>(await fixture.call("/sessions/A/runs", { ...configuration, task: "Start a controlled background command.", intent: "execute" }));
  await until("command approval did not appear", () => fixture.reviews.list(DEMO_PROJECT_ID, "pending").length > 0);
  for (const review of fixture.reviews.list(DEMO_PROJECT_ID, "pending")) await fixture.reviews.respond({ review_id: review.review_id, actor_id: "web-user", decision: "approve" });
  await settle(fixture, started.run.ref); body(await fixture.call("/state"));
  await until("SYS-15-Q2: the independent observer did not record the command", () => fixture.sessions.backgroundOf(DEMO_PROJECT_ID, "A")?.length === 1);
  const observed = fixture.sessions.backgroundOf(DEMO_PROJECT_ID, "A"); assert.equal(observed?.length, 1);
  const failed = t.mock.method(fixture.adapter.background!, "read", async () => { throw new Error("SDK background observation unavailable"); });
  const unknown = body<{ sessions: Array<{ session_id: string; background_unreadable: boolean }> }>(await fixture.call("/state"));
  assert.equal(unknown.sessions.find(row => row.session_id === "A")?.background_unreadable, true); assert.deepEqual(fixture.sessions.backgroundOf(DEMO_PROJECT_ID, "A"), observed);
  failed.mock.restore(); const recovered = body<{ sessions: Array<{ session_id: string; background_unreadable: boolean }> }>(await fixture.call("/state"));
  assert.equal(recovered.sessions.find(row => row.session_id === "A")?.background_unreadable, false); assert.deepEqual(fixture.sessions.backgroundOf(DEMO_PROJECT_ID, "A"), observed);
});

// W2-18-CODING-WAKE-01: a persisted real SDK wait wakes on activation alone, despite four consecutive read failures.
// W5-01 C2 (expected change): Coding no longer waits for the Host's `ready()` before it starts the loop, so the loop's first read is the
// one that starts the runtime. A first read that fails ends a loop the activation started (W5-01-CODING-31, tests/coding-input-ports.test.ts);
// a loop whose first read was answered keeps retrying. So the four failures here come after one answered read (nothing ready at that
// instant); before this change the Host's `ready()` was that answer.
// The command ends while the plugin is stopped, so the wait is over on the record before the SDK reopens: a finished
// fact may start the next round by itself (specs/prologue-adoption §4.6.4). A command the restart cut off is not one: its
// result is unknown, so the step is held for the person (needs-reconciliation) and nothing is started.
test("Coding activation resumes a persisted SDK wait without opening a page and keeps retrying transient owner failures", { timeout: 100_000 }, async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("A"); let turn = 0; const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const wire = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const messages = JSON.stringify(JSON.parse(wire).messages); requests.push(messages); turn++;
    if (turn === 1) return codingToolResponse("start-command", { executable: process.execPath, argv: ["-e", "setTimeout(()=>{},4000)"] });
    if (turn === 2) { const task = messages.match(/started (\S+) in the background/)?.[1]; assert.ok(task); return codingToolResponse("await-commands", { handles: [task], park: true, reason: "Wait for the controlled command." }); }
    return cogniaModelResponse(turn === 3 ? "Parked without polling." : "WOKE_FROM_PERSISTED_COMMAND");
  });
  const opened = body<Started>(await fixture.call("/sessions/A/runs", { ...configuration, task: "Start and park on a controlled command.", intent: "execute" }));
  await until("command approval did not appear", () => fixture.reviews.list(DEMO_PROJECT_ID, "pending").length > 0);
  for (const review of fixture.reviews.list(DEMO_PROJECT_ID, "pending")) await fixture.reviews.respond({ review_id: review.review_id, actor_id: "web-user", decision: "approve" });
  await settle(fixture, opened.run.ref); const parked = (await fixture.adapter.collaboration!.read(DEMO_PROJECT_ID)).flatMap(view => view.wait ?? []); assert.equal(parked.length, 1); assert.equal(parked[0]!.state, "waiting");
  const installation = fixture.platform.supervisor.state("io.molis.work.coding")!; await fixture.platform.runtime.stop(installation.install_id!);
  await until("the command did not end the wait", async () => (await fixture.adapter.collaboration!.read(DEMO_PROJECT_ID))[0]?.continuation?.state === "eligible", 15_000);
  await fixture.reopenSdk(); const persisted = (await fixture.adapter.collaboration!.read(DEMO_PROJECT_ID))[0]!;
  assert.deepEqual([persisted.wait?.wait_id, persisted.wait?.state, persisted.continuation?.state], [parked[0]!.wait_id, "satisfied", "eligible"], "the wait is over on the record");
  assert.equal(turn, 3, "reopening asks no model");
  const original = fixture.adapter.collaboration!.awaitReady.bind(fixture.adapter.collaboration), entered = Promise.withResolvers<void>(); let failures = 0, reads = 0;
  t.mock.method(fixture.adapter.collaboration!, "awaitReady", async (...args) => { if (reads++ === 0) return []; if (failures < 4) { failures++; entered.resolve(); throw new Error("transient owner read failure"); } return original(...args); });
  await fixture.platform.supervisor.restart("io.molis.work.coding"); await entered.promise;
  // No HTTP/directory/session read starts this work: only the new plugin activation owns the loop.
  await until("activation stopped retrying or failed to resume the persisted wait", () => turn >= 4, 70_000);
  assert.equal(failures, 4); assert.match(requests[3]!, /the wait on your step is over/); assert.match(requests[3]!, /Wait for the controlled command/);
  // Taken up once: the round that went on holds it, and nothing is left to go on.
  await until("the wake did not take its wait up", async () => (await fixture.adapter.collaboration!.read(DEMO_PROJECT_ID))[0]?.wait === undefined);
  assert.deepEqual(await fixture.adapter.collaboration!.awaitReady(DEMO_PROJECT_ID, 0), []);
});

// W2-18-CODING-REPORT-01: current SDK inserted graph -> user verdict -> immutable report, including SDK reopening.
test("a real inserted SDK step and its verdict are saved in a fixed report that later evaluation cannot rewrite", { timeout: 45_000 }, async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("A");
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse(JSON.stringify({ title: "One step", steps: [{ title: "Read", acceptance: "Record evidence" }], blockers: "", change_reason: "" })));
  const planning = await start(fixture, "A", "Plan this task.", "plan");
  body(await fixture.call("/sessions/A/plan", { run_id: planning.run_id, expected_revision: 0 }));
  const confirmed = body<{ plan: { revision: number } }>(await fixture.call("/sessions/A/plan/confirm", { expected_revision: 1 }));
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let turn = 0, execution: AgentRunRef;
  t.after(() => release.resolve());
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const wire = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    turn++; const request = JSON.parse(wire), system = JSON.stringify(request.system), project = system.match(/本轮确认计划在项目任务图 (\S+) 上/)?.[1], prefix = system.match(/编号以 (\S+?)\. 开头/)?.[1]; assert.ok(project && prefix);
    if (turn === 1) return codingToolResponse("board-read", { board: project });
    if (turn === 2) { entered.resolve(); await release.promise; return codingToolResponse("board-read", { board: project }); }
    if (turn < 7) {
      const current = (await fixture.adapter.read(execution)).step_board!;
      return codingToolResponse("board-report", { board: project, node: `${prefix}.${turn < 5 ? "step-1" : "user-1"}`, state: turn % 2 ? "running" : "succeeded", note: "Actual SDK step evidence", version: current.version });
    }
    return cogniaModelResponse("Both steps are reported.");
  });
  execution = body<Started>(await fixture.call("/sessions/A/runs", { ...configuration, task: "Execute the confirmed plan.", intent: "execute", plan_revision: confirmed.plan.revision })).run.ref;
  const finished = settle(fixture, execution);
  await Promise.race([entered.promise, finished.then(() => { throw new Error("SDK execution ended before the insertion barrier"); })]);
  const initial = (await fixture.adapter.read(execution)).step_board!;
  await fixture.adapter.collaboration!.revise(execution, { kind: "insert", after: "step-1", title: "Inserted test", acceptance: "New evidence is recorded" }, initial.version, "user");
  release.resolve(); await finished;
  const board = (await fixture.adapter.read(execution)).step_board!;
  assert.deepEqual(board.nodes.map(node => [node.id, node.state]), [["step-1", "succeeded"], ["user-1", "succeeded"]]);
  const evaluation = `/sessions/A/runs/${execution.run_id}/steps/user-1`;
  body(await fixture.call(evaluation, { action: "accepted", project_id: board.project_id, board_version: board.version, expected_revision: 0, notes: "Verified inserted evidence." }));
  const path = `/sessions/A/runs/${execution.run_id}/report`, saved = body<{ report: { body_markdown: string; steps: { board: typeof board } }; reference: ArtifactReference }>(await fixture.call(path, {}));
  assert.deepEqual(saved.report.steps.board, board); assert.match(saved.report.body_markdown, /Inserted test/); assert.match(saved.report.body_markdown, /New evidence is recorded/);
  assert.match(saved.report.body_markdown, /用户已通过此步骤/); assert.doesNotMatch(saved.report.body_markdown, /步骤回报与原计划不一致/);
  await until("the real Coding follower did not commit its completed state", () => fixture.sessions.get(DEMO_PROJECT_ID, "A").state === "done");
  const original = body<{ archive_decision: unknown }>(await fixture.call("/sessions/A/archive-preview")).archive_decision;
  const fault = t.mock.method(fixture.adapter.sessionLifecycle!, "archive", async () => { throw new Error("Coding prepared; SDK archive not committed"); });
  assert.ok((await fixture.call("/sessions/A", { archive: true, archive_decision: original }, "PATCH"))!.status >= 400); fault.mock.restore();
  const pending = fixture.sessions.lifecycle.current(DEMO_PROJECT_ID, "A"); assert.equal(pending?.completed, false);
  body(await fixture.call(evaluation, { action: "needs-work", project_id: board.project_id, board_version: board.version, expected_revision: 1, notes: "A later opinion." }));
  assert.deepEqual(fixture.sessions.lifecycle.current(DEMO_PROJECT_ID, "A"), pending, "step rating does not finish or replace the pending lifecycle original");
  await fixture.reopenSdk(); assert.deepEqual(body(await fixture.call(path)), saved, "fixed report preserves its original graph, verdict, Markdown and version");
  assert.equal((await fixture.call("/sessions/A", { archive: true, archive_decision: original }, "PATCH"))?.status, 200);
});

// Materials are pieces of project knowledge (specs/project-knowledge PMAT-18); a fixed report is named by its subject.
type Piece = { kind: string; id: string; title: string };
const pick = (reference: ArtifactReference, title: string): Piece => ({ kind: "artifact", id: artifactSubjectId(reference), title });

// W2-18-CODING-DELIVERY-01: actual SDK letters, fixed reports and the next SDK Run's frozen material version.
test("30 materials refuse a new delivery without committing receipts; removing one permits acceptance and actual consumption", { timeout: 120_000 }, async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("A"); body(await fixture.call("/sessions/A", { configuration }, "PATCH"));
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("DELIVERED_FIXED_TEXT"));
  const delegated = body<Delegated>(await fixture.call("/sessions/A/delegations", { title: "Report", task: "Produce fixed reports." })), target = delegated.session.session_id;
  const references: Piece[] = [];
  for (let index = 0; index < 30; index++) {
    const ref = await start(fixture, target, `Fixed report ${index}`);
    references.push(pick(body<{ reference: ArtifactReference }>(await fixture.call(`/sessions/${target}/runs/${ref.run_id}/report`, {})).reference, `Fixed report ${index}`));
  }
  body(await fixture.call("/sessions/A", { materials: references }, "PATCH"));
  const deliveredRun = await start(fixture, target, "The new delivered report."), result = body<{ delegation: { deliveries: Array<{ delivery_id: string; artifact: ArtifactReference }> } }>(
    await fixture.call(`/sessions/${target}/delegations/${delegated.delegation.delegation_id}/deliveries`, { run_id: deliveredRun.run_id, kind: "report" }));
  const delivery = result.delegation.deliveries[0]!, path = `/sessions/A/delegations/${delegated.delegation.delegation_id}/deliveries/${delivery.delivery_id}`;
  const source = fixture.sessions.get(DEMO_PROJECT_ID, "A").runtime_session_id!, before = await fixture.adapter.messages!.read(DEMO_PROJECT_ID, source);
  assert.ok((await fixture.call(path, { decision: "accept" }))!.status >= 400);
  assert.deepEqual(await fixture.adapter.messages!.read(DEMO_PROJECT_ID, source), before, "neither delivery nor parent letter advances at capacity");
  assert.deepEqual(body<{ materials: Piece[] }>(await fixture.call("/sessions/A")).materials, references);
  body(await fixture.call("/sessions/A", { materials: references.slice(1) }, "PATCH")); body(await fixture.call(path, { decision: "accept" }));
  const material = body<{ materials: Piece[] }>(await fixture.call("/sessions/A")).materials;
  assert.equal(material.length, 30); assert.deepEqual([material.at(-1)!.kind, material.at(-1)!.id], ["artifact", artifactSubjectId(delivery.artifact)]);
  const consumed = await start(fixture, "A", "Read all accepted materials.");
  const frozen = (await fixture.adapter.read(consumed)).frozen.text_materials;
  assert.ok(frozen.some(item => item.source_artifact_id === delivery.artifact.artifact_id && item.source_version === delivery.artifact.version));
  // Already present at capacity: taking this exact version records acceptance and never adds a duplicate.
  const next = body<Delegated>(await fixture.call("/sessions/A/delegations", { title: "Existing", task: "Produce one report." }));
  const existingRun = await start(fixture, next.session.session_id, "Existing fixed report."), existing = pick(body<{ reference: ArtifactReference }>(await fixture.call(`/sessions/${next.session.session_id}/runs/${existingRun.run_id}/report`, {})).reference, "Existing fixed report");
  const included = [...material.slice(1), existing]; body(await fixture.call("/sessions/A", { materials: included }, "PATCH"));
  const handed = body<{ delegation: { deliveries: Array<{ delivery_id: string }> } }>(await fixture.call(`/sessions/${next.session.session_id}/delegations/${next.delegation.delegation_id}/deliveries`, { run_id: existingRun.run_id, kind: "report" }));
  body(await fixture.call(`/sessions/A/delegations/${next.delegation.delegation_id}/deliveries/${handed.delegation.deliveries[0]!.delivery_id}`, { decision: "accept" }));
  assert.deepEqual(body<{ materials: Piece[] }>(await fixture.call("/sessions/A")).materials, included);
});
