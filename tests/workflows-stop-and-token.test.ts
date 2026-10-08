import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkflowsActionHandlers, openWorkflowsStore, workflowsActions as w, type WorkflowsActionPorts } from "@molis-ai/molis-work-plugin-workflows";

const PROJECT = "project-stop-token";
const RULE = { capability_id: "functions.published.worth-handling", version: 1, provider_id: "prov-functions", title: "要不要处理" };

/** A run of the real handlers and store against fake content stations, a fake judgment rule and a receiver that can be made to fail. */
async function setup() {
  const home = await mkdtemp(join(tmpdir(), "workflows-stop-token-"));
  const store = openWorkflowsStore(home);
  const state = { failReceive: false, choice: "skip", received: [] as Array<{ step: number; title: string }> };
  const content = {
    stations: async () => ["feed", "pages", "inbox"].map(plugin => ({ plugin, label: plugin, icon: "x", supported: true, can_start_blank: false, receives: true })),
    resolveStation: async (station: { plugin: string }) => ({ ...station, content: { provider_id: `prov-${station.plugin}`, actions: {
      list: { capability_id: `${station.plugin}.l`, version: 1 }, read: { capability_id: `${station.plugin}.r`, version: 1 }, receive: { capability_id: `${station.plugin}.v`, version: 1 } } } }),
    listStartItems: async () => [],
    createBlank: async () => { throw new Error("no blank starts here"); },
    read: async (item: { item_id: string }) => ({ title: `T ${item.item_id}`, body: `body of ${item.item_id}`, source: null, url: null, feed_item_id: null }),
    receive: async (plugin: string, payload: { title: string }, context: { step: number }) => {
      if (state.failReceive) throw new Error("target plugin temporarily unavailable");
      state.received.push({ step: context.step, title: payload.title });
      return { plugin, item_id: `${plugin}-${context.step}`, title: payload.title };
    },
  };
  const judgment = { capability_id: RULE.capability_id, version: RULE.version, provider: { provider_id: RULE.provider_id }, operation: "command", availability: { available: true }, action: {} };
  const ports = {
    withStore: async run => run(store), content: () => content, aiAvailable: () => false, assertInput: () => {},
    actions: () => ({
      discover: async () => [judgment],
      invoke: async () => ({ status: "ok", function_key: "worth-handling", version: 1, data: { choice: state.choice }, confidence: 0.9 }),
    }),
  } as unknown as WorkflowsActionPorts;
  const handlers = createWorkflowsActionHandlers(PROJECT, ports);
  const call = async (definition: { capability_id: string }, input: unknown) => {
    const handler = handlers.find(item => item.capability_id === definition.capability_id)!;
    return handler.handle({ actor_id: "agent-1", project_id: PROJECT, audience: "agent", permissions: ["workflows:read", "workflows:write", "model:invoke"], beforeEffect: async () => {} } as never, input) as Promise<any>;
  };
  return { home, store, state, call, close: async () => { store.close(); await rm(home, { recursive: true, force: true }); } };
}

test("a run a judgment held back keeps its reason and verdict when it is read again", async () => {
  const { home, state, call, close } = await setup();
  try {
    const judgmentLink = { kind: "judgment", title_template: "", body_template: "", instructions: "", judgment: RULE, pass: ["handle"] };
    const { workflow } = await call(w.create, { title: "只交要处理的", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [judgmentLink] } });
    const { instance } = await call(w.start, { id: workflow.workflow_id, item_id: "held-item" });

    const held = (await call(w.continue, { id: instance.instance_id })).instance;
    assert.equal(held.status, "stopped");
    assert.equal(held.stopped.from, 0);
    assert.equal(held.stopped.verdict.choice, "skip");
    assert.match(held.stopped.reason, /skip/);
    assert.deepEqual(state.received, [], "held content reaches nothing");

    // The page reads the run through these two actions after any reload or in another window.
    const reread = (await call(w.instance, { id: instance.instance_id })).instance;
    assert.equal(reread.status, "stopped");
    assert.deepEqual(reread.stopped, held.stopped, "instances.get shows why the run stopped and what the rule answered");
    const listed = (await call(w.get, { id: workflow.workflow_id })).instances.find((row: { instance_id: string }) => row.instance_id === instance.instance_id);
    assert.deepEqual(listed.stopped, held.stopped, "workflows.get lists the same reason");

    // A store opened afresh from the same file says the same, and what the save returned is what a reload gives.
    const reopened = openWorkflowsStore(home);
    try { assert.deepEqual(reopened.instance(instance.instance_id, PROJECT), held); } finally { reopened.close(); }

    // A person ending a run needs no reason: nothing is invented for it.
    const manual = { kind: "manual", title_template: "", body_template: "", instructions: "" };
    const { workflow: plain } = await call(w.create, { title: "手动", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [manual] } });
    const second = (await call(w.start, { id: plain.workflow_id, item_id: "stopped-by-person" })).instance;
    const ended = (await call(w.stop, { id: second.instance_id })).instance;
    assert.equal(ended.status, "stopped");
    assert.equal(ended.stopped, undefined);
    assert.equal((await call(w.instance, { id: second.instance_id })).instance.stopped, undefined);
  } finally { await close(); }
});

test("every save moves the run's concurrency token, so a stale continue is refused even when the clock does not move", async () => {
  const { state, call, store, close } = await setup();
  // One frozen millisecond: the pending save, the retried delivery and the earlier reads would all share a timestamp.
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-07T10:00:00.000Z") });
  try {
    const manual = { kind: "manual", title_template: "", body_template: "", instructions: "" };
    const { workflow } = await call(w.create, { title: "三站", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }, { plugin: "inbox" }], links: [manual, manual] } });
    const { instance } = await call(w.start, { id: workflow.workflow_id, item_id: "feed-item" });

    // The store: a write never keeps the token it was computed from.
    const raw = store.instance(instance.instance_id, PROJECT);
    const touched = store.saveInstance(raw, { ...raw });
    assert.notEqual(touched.updated_at, raw.updated_at);
    assert.ok(Date.parse(touched.updated_at) > Date.parse(raw.updated_at), "and never moves backwards");

    // The first handoff fixes its output, then the receiver fails.
    state.failReceive = true;
    await assert.rejects(call(w.continue, { id: instance.instance_id, title: "hand step 0", body: "edited by person" }), /temporarily unavailable/);
    const seen = (await call(w.instance, { id: instance.instance_id })).instance;
    assert.equal(seen.current, 0);
    assert.ok(seen.steps[0].pending, "the fixed handoff waits for a retry");

    // Later, the retry succeeds: the work arrives now, not at the time the handoff was fixed.
    mock.timers.tick(5000);
    state.failReceive = false;
    const advanced = (await call(w.continue, { id: instance.instance_id, updated_at: seen.updated_at, title: "hand step 0", body: "edited by person" })).instance;
    assert.equal(advanced.current, 1);
    assert.notEqual(advanced.updated_at, seen.updated_at, "advancing changes the token");
    assert.ok(Date.parse(advanced.updated_at) >= Date.parse(seen.steps[0].pending.at) + 5000, "the run's time is the time of the advance");
    assert.equal(advanced.steps[1].arrived_at, advanced.updated_at, "the next step arrived when the run advanced");
    assert.equal(advanced.steps[0].handoff.at, seen.steps[0].pending.at, "the handoff keeps the time it was fixed");

    // A second caller that still holds the earlier token, and names no step, must be refused instead of moving the run on.
    await assert.rejects(call(w.continue, { id: instance.instance_id, updated_at: seen.updated_at }), { code: "workflows.conflict" });
    const after = (await call(w.instance, { id: instance.instance_id })).instance;
    assert.equal(after.current, 1, "the stale call changed nothing");
    assert.equal(after.status, "active");
    assert.deepEqual(state.received.map(row => row.step), [1], "and delivered nothing");
  } finally { mock.timers.reset(); await close(); }
});
