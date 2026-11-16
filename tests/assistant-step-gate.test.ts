import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPrologueNodeAdapter, AgentHost, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, assistantBackgroundTasks, installHostUiText } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_NEXT_STEP_REVIEW, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentContinuationStarter } from "@molis-ai/molis-work-contracts/services/agent-collaboration";

installHostUiText();

// specs/proactive-assistant PWA-156, specs/work-line §12 (user decision 2026-11-15): 「每步先问我」. With it on, a step the work
// would go on to by itself waits for the person's yes: it asks 「接着做下一步？」 in its conversation and on its task, a yes starts
// that one step the way it would have started, a no starts nothing and the same step does not ask again.

/** A work whose wait has ended and whose continuation may go on, as the runtime reports it; every start the Host makes is counted. */
async function rig(t: TestContext, name: string) {
  const directory = await mkdtemp(join(tmpdir(), `assistant-step-gate-${name}-`));
  const host = new AgentHost({ reviews: new AgentReviewQueue() });
  const adapter = await createPrologueNodeAdapter({ app: { appId: `io.molis.step-gate-${name}`, appVersion: "1.0.0" }, storageRoot: directory,
    modelConfiguration: async () => null, resolveCredential: () => null });
  host.register(adapter);
  let starter: AgentContinuationStarter | undefined, starts = 0;
  t.mock.method(adapter.collaboration!, "serveStarts", (served: AgentContinuationStarter) => { starter = served; return () => {}; });
  t.mock.method(adapter, "readSession", async () => ({ session_id: "owned-session", runs: [], recovery: null }) as never);
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  // The start itself: a round asks for its authority with the reply language and Skills (a read of the work's titles asks with
  // the work alone), so a start that got this far is one the gate let through.
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, authority: async (...asked: unknown[]) => { if (asked.length >= 3) starts++; throw Object.assign(new Error("fixture: no round"), { code: "fixture.no_round" }); } }, "user");
  const work = store.update("user", store.create({ actor_id: "user", title: "整理周报", scope: { kind: "personal" }, origin: null }).work_id, null, { session_id: "owned-session" });
  let key = "k1";
  // The wait ends once the test asks: attaching first finds nothing to take up.
  let ended = false;
  t.mock.method(service.continuations, "view", async () => !ended ? undefined : ({ session_id: "owned-session", wait: { wait_id: "w1", state: "satisfied", reason: "定时到了", by: "runtime" },
    continuation: { state: "eligible", auto: true, request_key: key, graph_id: "g", node_id: "n" } }) as never);
  service.continuations.attach();
  for (let i = 0; i < 100 && !starter; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(starter, "the Assistant serves the Home's starter");
  // The runtime's own record of the wait is not this fixture's to change: a stop's withdrawal is taken as done.
  t.mock.method(service.continuations, "withdraw", async () => true);
  const ask = () => (ended = true, starter!)({ runtime_id: "prologue", project_id: ASSISTANT_PERSONAL_OWNER, session_id: "owned-session", owner: { plugin_id: ASSISTANT_PLUGIN_ID, install_id: "assistant" },
    request_key: key, wait_id: "w1", graph_id: "g", node_id: "n" });
  t.after(async () => { service.continuations.close(); await adapter.close(); db.close(); await rm(directory, { recursive: true, force: true }); });
  return { service, store, work, ask, starts: () => starts, next: (value: string) => { key = value; } };
}
const held = (review: { kind: string }) => review.kind === ASSISTANT_NEXT_STEP_REVIEW;

test("PWA-156 每步先问我: a continuation waits for the person's yes, asks once in the conversation and on the task, and a yes starts that one step", { timeout: 30_000 }, async t => {
  const { service, store, work, ask, starts } = await rig(t, "yes");
  // Off (the default), the continuation starts by itself.
  assert.deepEqual(await ask(), { refused: { code: "fixture.no_round", note: "fixture: no round" } });
  assert.equal(starts(), 1, "with the switch off the Host starts the step at once");

  const on = await service.continuations.stepGate.set(work.work_id, true);
  assert.equal(on.ask_each_step, true);
  assert.equal((await service.read(work.work_id)).work.ask_each_step, true, "the switch is on the work's view");
  assert.deepEqual(await ask(), { later: { code: "assistant.step_asked" } }, "held: the runtime keeps the continuation for later");
  assert.equal(starts(), 1, "nothing started");
  const view = await service.read(work.work_id);
  assert.equal(view.work.state, "waiting-review", "the work waits on the person");
  const asked = view.reviews.filter(held);
  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.summary, "接着做下一步？");
  // The same ask on the task's row: a yes or a no, by the ask's own id.
  const [row] = assistantBackgroundTasks([{ work: store.get("user", work.work_id), state: view.work.state, reviews: view.reviews }]);
  assert.equal(row!.waiting, true);
  assert.deepEqual(row!.decisions.map(decision => [decision.id, decision.answers.map(answer => [answer.role, (answer.input as { review_id: string }).review_id])]),
    [[asked[0]!.review_id, [["approve", asked[0]!.review_id], ["reject", asked[0]!.review_id]]]]);
  // The runtime asking again for the same step does not ask the person twice.
  assert.deepEqual(await ask(), { later: { code: "assistant.step_asked" } });
  assert.deepEqual((await service.read(work.work_id)).reviews.filter(held).map(review => review.review_id), [asked[0]!.review_id], "one ask for one step");

  // Yes: the step starts the way it would have, once.
  await service.outcomes.decide(work.work_id, { review_id: asked[0]!.review_id, version: asked[0]!.version, decision: "approve" });
  assert.equal(starts(), 2, "the yes started that step");
  assert.equal(store.get("user", work.work_id).step_gate, undefined, "nothing is held any more");
  assert.equal((await service.read(work.work_id)).reviews.filter(held).length, 0);
});

test("PWA-156 每步先问我: a no starts nothing and that step does not ask again; the next step asks again; turning it off while asking lets the step go on", { timeout: 30_000 }, async t => {
  const { service, store, work, ask, starts, next } = await rig(t, "no");
  await service.continuations.stepGate.set(work.work_id, true);
  await ask();
  const first = (await service.read(work.work_id)).reviews.find(held)!;
  await service.outcomes.decide(work.work_id, { review_id: first.review_id, version: first.version, decision: "reject" });
  assert.equal(starts(), 0, "a no starts nothing");
  assert.deepEqual(await ask(), { later: { code: "assistant.step_asked" } }, "the step the person said no to stays held");
  assert.equal(starts(), 0);
  assert.equal((await service.read(work.work_id)).reviews.filter(held).length, 0, "and it does not ask again");

  // Another step (a later continuation) asks again; switching it off answers yes for the one held.
  next("k2");
  await ask();
  assert.equal((await service.read(work.work_id)).reviews.filter(held).length, 1, "the next step asks");
  const off = await service.continuations.stepGate.set(work.work_id, false);
  assert.equal(off.ask_each_step, undefined);
  assert.equal(starts(), 1, "off while asking: the held step goes on");
  assert.equal(store.get("user", work.work_id).step_gate, undefined);
});

test("PWA-156 每步先问我: the person's own word and a stop take the ask back", { timeout: 30_000 }, async t => {
  const { service, store, work, ask } = await rig(t, "taken-back");
  await service.continuations.stepGate.set(work.work_id, true);
  await ask();
  assert.ok(store.get("user", work.work_id).step_gate);
  // The person writes: their word is what goes on, and the ask is gone.
  const send = service.continuations.begin(store.get("user", work.work_id), "先等等，我改一下要求");
  send.end();
  assert.equal(store.get("user", work.work_id).step_gate, undefined, "the person's own word takes the ask back");

  store.update("user", work.work_id, null, { continuation_hold: undefined });
  await ask();
  assert.ok(store.get("user", work.work_id).step_gate, "asked again for the step");
  await service.control(work.work_id, { kind: "stop" });
  assert.equal(store.get("user", work.work_id).step_gate, undefined, "a stop takes the ask back");
});

test("PWA-156 每步先问我 is refused where the Assistant does not carry the steps, and an answer for another id is not the ask's", { timeout: 30_000 }, async t => {
  const { service, store, work, ask } = await rig(t, "refused");
  const plugin = store.create({ actor_id: "user", title: "Coding 会话", scope: { kind: "personal" }, origin: null, executor: { kind: "plugin", plugin_id: "io.molis.work.coding", title: "Coding", session_id: "s" } });
  await assert.rejects(service.continuations.stepGate.set(plugin.work_id, true), /别的执行方/, "a work a plugin carries has its own steps");
  assert.equal(store.get("user", plugin.work_id).ask_each_step, undefined, "and nothing was written");
  await assert.rejects(service.continuations.stepGate.set(work.work_id, "yes"), /开还是关/, "the switch is a yes or a no");
  await service.continuations.stepGate.set(work.work_id, true);
  await ask();
  const gate = store.get("user", work.work_id).step_gate!;
  assert.equal(await service.continuations.stepGate.answer(work.work_id, "next-step-someone-else", gate.request_key, "approve"), false, "another id is not this ask's answer");
  assert.deepEqual(store.get("user", work.work_id).step_gate, gate, "the ask stays as it was");
});
