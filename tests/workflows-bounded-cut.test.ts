import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyFunctionRule, createWorkflowsActionHandlers, ownWorkflowsStores, parseAiHandoff, parseChain, workflowsActions as w, type WorkflowsActionPorts } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore } from "./fixtures/plugin-home-stores.js";

// Workflows keeps the first N characters of many texts: names, templates, the text a judgment rule reads. They come from other plugins, a model or
// a request, so a text can be a whole document. A cut used to spread the whole text into an array of characters first; now only its first 2N
// UTF-16 units are spread (N characters never take more), and what comes out is the same. 😀 (U+1F600) is two units and one character; 尾 is one of each.
// A "step" is one character the engine hands out while a string is spread, looped over or turned into an array: `stepsOver` counts them.

const PROJECT = "project-bounded-cut";
const STATIONS = [{ plugin: "feed" }, { plugin: "pages" }];
const RULE = { capability_id: "functions.published.worth-handling", version: 1, provider_id: "prov-functions", title: "要不要处理" };
const TICKET = { capability_id: "fixture.tickets.create", version: 1, provider_id: "prov-tickets" };
const MANUAL = { kind: "manual", title_template: "", body_template: "", instructions: "" };
const PASS = { kind: "function", title_template: "", body_template: "{正文}", instructions: "" };
const JUDGED = { kind: "judgment", title_template: "", body_template: "", instructions: "", judgment: RULE, pass: ["handle"] };

// 400,000 units is 50 times the largest limit below (8000), for the cuts that need no run; a million is for the cuts inside a run.
const HUGE = "尾".repeat(400_000);
const MILLION = 1_000_000;
// What a whole call may take: its largest cut is 8000 characters, 16000 steps; spreading a million characters takes a million.
const CEILING = 100_000;

interface Flow { workflow_id: string }
interface Handoff { output: { title: string; body: string } }
interface Run {
  instance_id: string; title: string;
  steps: Array<{ pending?: Handoff & { attempt_error?: string } }>;
}
interface Choice { fields: Array<{ name: string; title?: string }> }

/** Runs `run` and counts the characters the engine steps through in strings while it runs: in `[...text]`, `for…of` and `Array.from` over a string. */
async function stepsOver<T>(run: () => T | Promise<T>): Promise<{ value: T; steps: number }> {
  const original = String.prototype[Symbol.iterator];
  let steps = 0;
  String.prototype[Symbol.iterator] = function (this: string) {
    const inner = original.call(this);
    return { next: () => { const step = inner.next(); if (!step.done) steps += 1; return step; }, [Symbol.iterator]() { return this; } };
  } as never;
  try { return { value: await run(), steps }; }
  finally { String.prototype[Symbol.iterator] = original; }
}

/** The first `limit` characters the way they were cut before: every character of the text spread into an array, then the first `limit` taken. */
const everyCharacter = (text: string, limit: number) => [...text].slice(0, limit).join("");

/** The same strings every run, so a failure can be repeated. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
// One-unit characters, two-unit characters, a lone half of a two-unit character, blanks.
const PARTS = ["a", "尾", "é", " ", "😀", "𝒳", "\ud83d", "\ude00"];
function randomText(next: () => number, units: number): string {
  let text = "";
  while (text.length < units) text += PARTS[Math.floor(next() * PARTS.length)];
  return text;
}

// Each place that cuts a text to its first characters, run through the exported function that reaches it: the limit, and what a cut text should be.
interface Cut { name: string; limit: number; run(text: string): string | undefined; expected(text: string): string | undefined }
const BARE = { kind: "function", title_template: "", body_template: "", instructions: "" } as const;
const linkText = (field: "title_template" | "body_template" | "instructions") => (text: string) =>
  parseChain({ stations: STATIONS, links: [{ ...MANUAL, [field]: text }] }).links[0]![field];
const stepOf = (extra: Record<string, unknown>) => parseChain({ stations: [STATIONS[0], { plugin: "action", action: { ref: TICKET, title: "新建工单", mapping: {}, ...extra } }], links: [MANUAL] }).stations[1]!.action!;
const CUTS: Cut[] = [
  { name: "title template", limit: 400, run: linkText("title_template"), expected: text => everyCharacter(text, 400) },
  { name: "body template", limit: 8000, run: linkText("body_template"), expected: text => everyCharacter(text, 8000) },
  { name: "instructions", limit: 4000, run: linkText("instructions"), expected: text => everyCharacter(text, 4000) },
  { name: "step name", limit: 200, run: text => stepOf({ title: text }).title, expected: text => text.trim() ? everyCharacter(text.trim(), 200) : TICKET.capability_id },
  { name: "step group", limit: 120, run: text => stepOf({ group: text }).group, expected: text => text.trim() ? everyCharacter(text.trim(), 120) : undefined },
  { name: "judgment rule name", limit: 200,
    run: text => parseChain({ stations: STATIONS, links: [{ ...JUDGED, judgment: { ...RULE, title: text } }] }).links[0]!.judgment!.title, expected: text => everyCharacter(text, 200) },
  { name: "fixed rule title", limit: 200, run: text => applyFunctionRule(BARE, { title: text, body: "正文" }).title, expected: text => everyCharacter(text.trim(), 200) || text },
  { name: "fixed rule title from a template", limit: 200,
    run: text => applyFunctionRule({ ...BARE, title_template: "{标题}" }, { title: text, body: "正文" }).title, expected: text => everyCharacter(text.trim(), 200) || text },
  { name: "model title", limit: 200, run: text => parseAiHandoff(`题${text}\n正文`, { title: "原标题", body: "原文" }).title, expected: text => everyCharacter(`题${text}`.trim(), 200) },
];

/** Whether a step may fill a field with the fixed value `text`: one over 8000 characters is refused as too long, anything else wrong is thrown. */
function accepts(text: string): boolean {
  try {
    parseChain({ stations: [STATIONS[0], { plugin: "action", action: { ref: TICKET, title: "新建工单", mapping: { note: { value: text } } } }], links: [MANUAL] });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "workflows.invalid" && /固定值过长/.test((error as Error).message)) return false;
    throw error;
  }
}

/** A run of the real handlers and store against fake content stations, a fake judgment rule, a fake ticket action (whose input fields can be given) and a receiver. */
async function setup(options: { properties?: Record<string, unknown>; rule?: boolean } = {}) {
  const home = await mkdtemp(join(tmpdir(), "workflows-bounded-cut-"));
  const store = openWorkflowsStore(home);
  // `title` and `body` are what the first station holds (empty: made from the item id); `judged` is every text the judgment rule was given.
  const state = { title: "", body: "", failTicket: "", judged: [] as string[] };
  const content = {
    stations: async () => ["feed", "pages"].map(plugin => ({ plugin, label: plugin, icon: "x", supported: true, can_start_blank: false, receives: true })),
    resolveStation: async (station: { plugin: string }) => ({ ...station, content: { provider_id: `prov-${station.plugin}`, actions: {
      list: { capability_id: `${station.plugin}.l`, version: 1 }, read: { capability_id: `${station.plugin}.r`, version: 1 }, receive: { capability_id: `${station.plugin}.v`, version: 1 } } } }),
    listStartItems: async () => [],
    createBlank: async () => { throw new Error("no blank starts here"); },
    read: async (item: { item_id: string }) => ({ title: state.title || `T ${item.item_id}`, body: state.body || `body of ${item.item_id}`, source: null, url: null, feed_item_id: null }),
    receive: async (plugin: string, payload: { title: string }) => ({ plugin, item_id: `${plugin}-1`, title: payload.title }),
  };
  const judgment = { capability_id: RULE.capability_id, version: RULE.version, provider: { provider_id: RULE.provider_id }, operation: "command", availability: { available: true }, action: {} };
  const ticket = { capability_id: TICKET.capability_id, version: TICKET.version, provider: { provider_id: TICKET.provider_id, title: "工单" }, operation: "command", availability: { available: true },
    action: { title: "新建工单", description: "建一张工单", kind: "operation", audiences: ["workflow"],
      input_schema: { type: "object", properties: options.properties ?? { title: { type: "string" }, note: { type: "string" } }, required: options.properties ? [] : ["title"] } } };
  const ports: WorkflowsActionPorts = {
    ...ownWorkflowsStores(run => run(store)), content: () => content, textModel: () => ({ available: false, code: "actions.connection_required", reason: "还没有可用的文字模型" }),
    actions: () => ({
      discover: async () => options.rule === false ? [ticket] : [judgment, ticket],
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

test("RAC-2150 every cut gives the first characters of the text, as it did when all of the text was spread: at, just under and just over the edge, with emoji and half-emoji", () => {
  const next = seeded(20261029);
  const wrong: string[] = [];
  for (const { name, limit, run, expected } of CUTS) {
    const texts = [
      "", " ", "\ud83d", "\ude00",
      "😀".repeat(limit), "😀".repeat(limit + 1), "a".repeat(limit - 1) + "😀", "a".repeat(limit) + "😀", "a".repeat(limit - 1) + "\ud83d" + "尾", " " + "😀".repeat(limit) + " ",
      "尾".repeat(2 * limit + 5),
      ...[limit - 2, limit - 1, limit, limit + 1, limit + 2, 2 * limit - 1, 2 * limit, 2 * limit + 1, 3 * limit].flatMap(units => [0, 1, 2].map(() => randomText(next, units))),
    ];
    for (const text of texts) if (run(text) !== expected(text)) wrong.push(`${name}: ${text.length} units`);
  }
  assert.deepEqual(wrong, []);
});

test("RAC-2150 a fixed value of 8000 characters is allowed and one more is refused, whatever its characters take in units", () => {
  const next = seeded(20261030);
  const texts = [
    "a".repeat(8000), "a".repeat(8001), "😀".repeat(8000), "😀".repeat(8001), "a".repeat(7999) + "😀", "a".repeat(8000) + "😀",
    "尾".repeat(15999), "尾".repeat(16000), "尾".repeat(16001), "😀".repeat(7999) + "尾", "😀".repeat(7999) + "尾尾", "😀".repeat(7999) + "\ud83d",
    ...[15998, 15999, 16000, 16001, 16002].flatMap(units => [0, 1].map(() => randomText(next, units))),
  ];
  // 8000 emoji is 16000 units: it fits. 16000 plain characters is 16000 units too, and does not.
  assert.deepEqual(texts.filter(text => accepts(text) !== ([...text].length <= 8000)).map(text => `${text.length} units`), []);
  assert.equal(accepts("😀".repeat(8000)), true);
  assert.equal(accepts("尾".repeat(16000)), false);
});

test("RAC-2151 a cut takes steps in proportion to its limit, not to the text: a text of 400,000 characters, every place that cuts", async () => {
  const slow: string[] = [];
  for (const { name, limit, run, expected } of CUTS) {
    const want = expected(HUGE);
    const { value, steps } = await stepsOver(() => run(HUGE));
    assert.ok(value === want, `${name} gives the first ${limit} characters`);
    if (steps > 4 * limit) slow.push(`${name}: ${steps} steps for ${limit} characters`);
  }
  assert.deepEqual(slow, []);
});

test("RAC-2151 a fixed value far over 8000 characters is refused without being counted character by character", async () => {
  const { value, steps } = await stepsOver(() => accepts(HUGE));
  assert.equal(value, false);
  assert.ok(steps <= 4 * 8000, `${steps} steps`);
});

test("RAC-2152 a judgment rule gets the title and the first 8000 characters of a body of a million, and reading it takes steps in proportion to 8000", async () => {
  const { state, call, close } = await setup();
  try {
    const { workflow } = await call<{ workflow: Flow }>(w.create, { title: "只交要处理的", chain: { stations: STATIONS, links: [JUDGED] } });
    state.title = "标题";
    state.body = "尾".repeat(MILLION);
    const { instance } = await call<{ instance: Run }>(w.start, { id: workflow.workflow_id, item_id: "long" });
    const { steps } = await stepsOver(() => call(w.continue, { id: instance.instance_id }));
    // 「标题」 and the blank line are 4 characters; the other 7996 are the first of the body.
    assert.equal(state.judged.length, 1);
    assert.ok(state.judged[0] === "标题\n\n" + "尾".repeat(7996), "the rule reads 8000 characters");
    assert.ok(steps <= CEILING, `${steps} steps`);
  } finally { await close(); }
});

test("RAC-2153 a run started from an item whose title is a million characters is named by the first 120, blanks collapsed first, in steps in proportion to 120", async () => {
  const { state, call, close } = await setup();
  try {
    const { workflow } = await call<{ workflow: Flow }>(w.create, { title: "手动", chain: { stations: STATIONS, links: [MANUAL] } });
    state.title = "周报   十月\n" + "尾".repeat(MILLION);
    const { value, steps } = await stepsOver(() => call<{ instance: Run }>(w.start, { id: workflow.workflow_id, item_id: "long" }));
    // 「周报 十月 」 is 6 characters once the blanks are one blank each; the other 114 are the first of the title.
    assert.ok(value.instance.title === "周报 十月 " + "尾".repeat(114), "the run is named by 120 characters");
    assert.ok(steps <= CEILING, `${steps} steps`);
  } finally { await close(); }
});

test("RAC-2154 the label of an action's input field is cut to 120 characters in steps in proportion to 120, from its title and from its description", async () => {
  const { call, close } = await setup({ rule: false, properties: {
    named: { type: "string", title: "尾".repeat(MILLION), description: "不用这一条" },
    described: { type: "string", description: "尾".repeat(MILLION) },
  } });
  try {
    const { value, steps } = await stepsOver(() => call<{ actions: Choice[] }>(w.actionSteps, {}));
    const titles = Object.fromEntries(value.actions[0]!.fields.map(field => [field.name, field.title]));
    assert.ok(titles.named === "尾".repeat(120), "from the title");
    assert.ok(titles.described === "尾".repeat(120), "from the description");
    assert.ok(steps <= CEILING, `${steps} steps`);
  } finally { await close(); }
});

test("RAC-2154 the error an action step records is cut to 400 characters in steps in proportion to 400, whatever the action said", async () => {
  const { state, call, close } = await setup();
  try {
    const step = { plugin: "action", action: { ref: TICKET, title: "新建工单", group: "工单", mapping: { title: { from: "title" } } } };
    const { workflow } = await call<{ workflow: Flow }>(w.create, { title: "建单", chain: { stations: [STATIONS[0], step], links: [PASS] } });
    const { instance } = await call<{ instance: Run }>(w.start, { id: workflow.workflow_id, item_id: "ticket" });
    state.failTicket = "错".repeat(MILLION);
    const failed = await stepsOver(() => call(w.continue, { id: instance.instance_id }).then(() => "went on", () => "refused"));
    assert.equal(failed.value, "refused");
    assert.ok(failed.steps <= CEILING, `${failed.steps} steps`);
    const seen = (await call<{ instance: Run }>(w.instance, { id: instance.instance_id })).instance;
    assert.ok(seen.steps[0]!.pending!.attempt_error === "错".repeat(400), "the step keeps 400 characters of it");
  } finally { await close(); }
});
