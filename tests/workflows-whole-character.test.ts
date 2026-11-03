import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyFunctionRule, createWorkflowsActionHandlers, ownWorkflowsStores, parseAiHandoff, workflowsActions as w, type WorkflowsActionPorts } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore } from "./fixtures/plugin-home-stores.js";

// Every limit here counts characters, as the action schemas do. 😀 (U+1F600) is two UTF-16 units and one character; 尾 is one of each.
// over("a", 200) is 210 characters whose 200th is 😀: cut at 200 units it keeps 199 "a" and one half of the emoji; kept("a", 200) is what a cut at 200 characters leaves.
const over = (letter: string, limit: number) => letter.repeat(limit - 1) + "😀" + "尾".repeat(10);
const kept = (letter: string, limit: number) => letter.repeat(limit - 1) + "😀";

const PROJECT = "project-whole-characters";
const RULE = { capability_id: "functions.published.worth-handling", version: 1, provider_id: "prov-functions", title: "要不要处理" };
const TICKET = { capability_id: "fixture.tickets.create", version: 1, provider_id: "prov-tickets" };
const MANUAL = { kind: "manual", title_template: "", body_template: "", instructions: "" };
const PASS = { kind: "function", title_template: "", body_template: "{正文}", instructions: "" };
const JUDGED = { kind: "judgment", title_template: "", body_template: "", instructions: "", judgment: RULE, pass: ["handle"] };

interface Flow {
  workflow_id: string; title: string; revision: number;
  stations: Array<{ plugin: string; action?: { title: string; group?: string; mapping: Record<string, unknown> } }>;
  links: Array<{ judgment?: { title?: string } }>;
}
interface Handoff { output: { title: string; body: string } }
interface Run {
  instance_id: string; title: string; current: number;
  steps: Array<{ pending?: Handoff & { attempt_error?: string }; handoff?: Handoff | null }>;
}

/** A run of the real handlers and store against fake content stations, a fake judgment rule, a fake ticket action and a receiver that can be made to fail. */
async function setup() {
  const home = await mkdtemp(join(tmpdir(), "workflows-whole-characters-"));
  const store = openWorkflowsStore(home);
  // `title` and `body` are what the first station holds (empty: made from the item id); `judged` is every text the judgment rule was given.
  const state = { title: "", body: "", failReceive: false, failTicket: "", judged: [] as string[], received: [] as string[] };
  const content = {
    stations: async () => ["feed", "pages"].map(plugin => ({ plugin, label: plugin, icon: "x", supported: true, can_start_blank: false, receives: true })),
    resolveStation: async (station: { plugin: string }) => ({ ...station, content: { provider_id: `prov-${station.plugin}`, actions: {
      list: { capability_id: `${station.plugin}.l`, version: 1 }, read: { capability_id: `${station.plugin}.r`, version: 1 }, receive: { capability_id: `${station.plugin}.v`, version: 1 } } } }),
    listStartItems: async () => [],
    createBlank: async () => { throw new Error("no blank starts here"); },
    read: async (item: { item_id: string }) => ({ title: state.title || `T ${item.item_id}`, body: state.body || `body of ${item.item_id}`, source: null, url: null, feed_item_id: null }),
    receive: async (plugin: string, payload: { title: string }) => {
      if (state.failReceive) throw new Error("target plugin temporarily unavailable");
      state.received.push(payload.title);
      return { plugin, item_id: `${plugin}-${state.received.length}`, title: payload.title };
    },
  };
  const judgment = { capability_id: RULE.capability_id, version: RULE.version, provider: { provider_id: RULE.provider_id }, operation: "command", availability: { available: true }, action: {} };
  const ticket = { capability_id: TICKET.capability_id, version: TICKET.version, provider: { provider_id: TICKET.provider_id, title: "工单" }, operation: "command", availability: { available: true },
    action: { title: "新建工单", description: "建一张工单", kind: "operation", audiences: ["workflow"],
      input_schema: { type: "object", properties: { title: { type: "string" }, note: { type: "string" } }, required: ["title"] } } };
  const ports: WorkflowsActionPorts = {
    ...ownWorkflowsStores(run => run(store)), content: () => content, textModel: () => ({ available: false, code: "actions.connection_required", reason: "还没有可用的文字模型" }),
    actions: () => ({
      discover: async () => [judgment, ticket],
      check: async () => {},
      invoke: async (ref: { capability_id: string }, input: unknown) => {
        if (ref.capability_id !== RULE.capability_id) throw new Error(state.failTicket);
        state.judged.push((input as { content: string }).content);
        return { status: "ok", function_key: "worth-handling", version: 1, data: { choice: "handle" }, confidence: 0.9 };
      },
    }),
  } as never;
  const handlers = createWorkflowsActionHandlers(PROJECT, ports);
  const call = <T = unknown>(definition: { capability_id: string }, input: unknown): Promise<T> => {
    const handler = handlers.find(item => item.capability_id === definition.capability_id)!;
    return handler.handle({ actor_id: "agent-1", project_id: PROJECT, audience: "agent", permissions: ["workflows:read", "workflows:write", "model:invoke"], beforeEffect: async () => {} } as never, input) as Promise<T>;
  };
  return { state, call, close: async () => { store.close(); await rm(home, { recursive: true, force: true }); } };
}

test("RAC-1892 a flow's name and a run's name are cut to 120 whole characters", async () => {
  const { state, call, close } = await setup();
  try {
    const chain = { stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [MANUAL] };
    const { workflow } = await call<{ workflow: Flow }>(w.create, { title: over("a", 120), chain });
    assert.equal(workflow.title, kept("a", 120));
    assert.equal((await call<{ workflow: Flow }>(w.get, { id: workflow.workflow_id })).workflow.title, kept("a", 120), "and that is what is stored");

    // 200 emoji is 400 units: cut by unit it would be 60 emoji, cut by character it is 120.
    const renamed = await call<{ workflow: Flow }>(w.update, { id: workflow.workflow_id, revision: workflow.revision, title: "😀".repeat(200) });
    assert.equal(renamed.workflow.title, "😀".repeat(120));
    assert.equal((await call<{ workflow: Flow }>(w.create, { title: "😀".repeat(120), chain })).workflow.title, "😀".repeat(120));

    // What is not too long is as it was: blanks collapse, and an empty name becomes the default.
    assert.equal((await call<{ workflow: Flow }>(w.create, { title: " 周报   十月 ", chain })).workflow.title, "周报 十月");
    assert.equal((await call<{ workflow: Flow }>(w.create, { title: "   ", chain })).workflow.title, "未命名流程");

    state.title = over("r", 120);
    const { instance } = await call<{ instance: Run }>(w.start, { id: workflow.workflow_id, item_id: "first" });
    assert.equal(instance.title, kept("r", 120));
    assert.equal((await call<{ instance: Run }>(w.instance, { id: instance.instance_id })).instance.title, kept("r", 120), "and that is what is stored");
  } finally { await close(); }
});

test("RAC-1893 what a handoff carries is cut to whole characters: the typed title, the rule's, the model's, and the text a judgment reads", async () => {
  const { state, call, close } = await setup();
  try {
    // A typed title is fixed on the first try; typing the same title again on the retry is the same hand-over, not another one.
    const { workflow } = await call<{ workflow: Flow }>(w.create, { title: "手动", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [MANUAL] } });
    const { instance } = await call<{ instance: Run }>(w.start, { id: workflow.workflow_id, item_id: "typed" });
    const typed = { id: instance.instance_id, title: over("m", 200), body: "edited by person" };
    state.failReceive = true;
    await assert.rejects(call(w.continue, typed), /temporarily unavailable/);
    const waiting = (await call<{ instance: Run }>(w.instance, { id: instance.instance_id })).instance;
    assert.equal(waiting.steps[0]!.pending!.output.title, kept("m", 200));
    state.failReceive = false;
    const delivered = (await call<{ instance: Run }>(w.continue, typed)).instance;
    assert.equal(delivered.current, 1);
    assert.equal(delivered.steps[0]!.handoff!.output.title, kept("m", 200));
    assert.deepEqual(state.received, [kept("m", 200)]);

    // The fixed rule's title (「工单：」 is 3 characters, so the emoji is the 200th) and the model's title.
    const rule = { kind: "function" as const, title_template: "工单：{标题}", body_template: "{正文}", instructions: "" };
    assert.equal(applyFunctionRule(rule, { title: over("f", 197), body: "正文" }).title, "工单：" + kept("f", 197));
    assert.equal(applyFunctionRule({ ...rule, title_template: "" }, { title: over("g", 200), body: "正文" }).title, kept("g", 200));
    assert.equal(parseAiHandoff(`# ${over("h", 200)}\n\n正文`, { title: "原标题", body: "原文" }).title, kept("h", 200));

    // A judgment rule reads the title and the body together, 8000 characters at most: 「标题」 and the blank line are 4, then 7995 "a" and one emoji.
    const { workflow: judged } = await call<{ workflow: Flow }>(w.create, { title: "只交要处理的", chain: { stations: [{ plugin: "feed" }, { plugin: "pages" }], links: [JUDGED] } });
    state.title = "标题";
    state.body = "a".repeat(7995) + "😀".repeat(10);
    const cut = (await call<{ instance: Run }>(w.start, { id: judged.workflow_id, item_id: "cut" })).instance;
    await call(w.continue, { id: cut.instance_id });
    // 6000 emoji is 12000 units but 6000 characters: the rule gets all of it.
    state.body = "😀".repeat(6000);
    const whole = (await call<{ instance: Run }>(w.start, { id: judged.workflow_id, item_id: "whole" })).instance;
    await call(w.continue, { id: whole.instance_id });
    assert.deepEqual(state.judged, ["标题\n\n" + "a".repeat(7995) + "😀", "标题\n\n" + "😀".repeat(6000)]);
  } finally { await close(); }
});

test("RAC-1894 the names kept in a chain are cut to whole characters, and so is the error an action step records", async () => {
  const { state, call, close } = await setup();
  try {
    const step = (title: string, group: string) => ({ plugin: "action", action: { ref: TICKET, title, group, mapping: { title: { from: "title" } } } });
    const chain = (name: string, group: string, link: unknown) => ({ stations: [{ plugin: "feed" }, step(name, group)], links: [link] });
    const { workflow } = await call<{ workflow: Flow }>(w.create, { title: "名字",
      chain: chain(over("s", 200), over("g", 120), { ...JUDGED, judgment: { ...RULE, title: over("j", 200) } }) });
    const action = workflow.stations[1]!.action!;
    assert.equal(action.title, kept("s", 200));
    assert.equal(action.group, kept("g", 120));
    assert.equal(workflow.links[0]!.judgment!.title, kept("j", 200));

    // Names that fit are kept whole: 150 emoji is 300 units, 100 emoji is 200.
    const fits = (await call<{ workflow: Flow }>(w.create, { title: "名字",
      chain: chain("😀".repeat(150), "😀".repeat(100), { ...JUDGED, judgment: { ...RULE, title: "😀".repeat(150) } }) })).workflow;
    assert.deepEqual([fits.stations[1]!.action!.title, fits.stations[1]!.action!.group, fits.links[0]!.judgment!.title], ["😀".repeat(150), "😀".repeat(100), "😀".repeat(150)]);

    // An action that fails: the step keeps what it said, 400 characters of it, and says it again when the person is asked to check.
    const { workflow: acting } = await call<{ workflow: Flow }>(w.create, { title: "建单", chain: chain("新建工单", "工单", PASS) });
    const { instance } = await call<{ instance: Run }>(w.start, { id: acting.workflow_id, item_id: "ticket" });
    state.failTicket = over("错", 400);
    await assert.rejects(call(w.continue, { id: instance.instance_id }), /错/);
    const seen = (await call<{ instance: Run }>(w.instance, { id: instance.instance_id })).instance;
    assert.equal(seen.steps[0]!.pending!.attempt_error, kept("错", 400));
    await assert.rejects(call(w.continue, { id: instance.instance_id }), (error: { code?: string; message?: string }) =>
      error.code === "workflows.uncertain" && (error.message ?? "").includes(`（${kept("错", 400)}）`));
  } finally { await close(); }
});

test("RAC-1895 a fixed value in an action step may be 8000 characters: an emoji counts once, as it does for the action it fills", async () => {
  const { call, close } = await setup();
  try {
    const withValue = (value: string) => ({ title: "固定值", chain: { stations: [{ plugin: "feed" },
      { plugin: "action", action: { ref: TICKET, title: "新建工单", mapping: { title: { from: "title" }, note: { value } } } }], links: [MANUAL] } });
    // 8000 emoji is 16000 units.
    for (const value of ["a".repeat(8000), "😀".repeat(8000)]) {
      const made = await call<{ workflow: Flow }>(w.create, withValue(value));
      assert.deepEqual(made.workflow.stations[1]!.action!.mapping.note, { value });
    }
    for (const value of ["a".repeat(8001), "😀".repeat(8001)]) {
      await assert.rejects(call(w.create, withValue(value)), { code: "workflows.invalid", message: /固定值过长/ });
    }
  } finally { await close(); }
});
