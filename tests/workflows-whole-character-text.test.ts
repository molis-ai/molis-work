import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkflowsActionHandlers, ownWorkflowsStores, parseChain, workflowsActions as w, type WorkflowsActionPorts } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore } from "./fixtures/plugin-home-stores.js";

// Every limit here counts characters, as the action schemas do. 😀 (U+1F600) is two UTF-16 units and one character; 尾 is one of each.
// over("a", 120) is 130 characters whose 120th is 😀: cut at 120 units it keeps 119 "a" and one half of the emoji; kept("a", 120) is what a cut at 120 characters leaves.
const over = (letter: string, limit: number) => letter.repeat(limit - 1) + "😀" + "尾".repeat(10);
const kept = (letter: string, limit: number) => letter.repeat(limit - 1) + "😀";

const PROJECT = "project-whole-character-text";
const STATIONS = [{ plugin: "feed" }, { plugin: "pages" }];
const TICKET = { capability_id: "fixture.tickets.create", version: 1, provider_id: "prov-tickets" };

interface Texts { title_template: string; body_template: string; instructions: string }
interface Flow { workflow_id: string; links: Texts[] }
interface Choice { fields: Array<{ name: string; title?: string }> }

/** The real handlers and store against two fake content stations and one fake action whose input fields are `properties`. */
async function setup(properties: Record<string, unknown> = {}) {
  const home = await mkdtemp(join(tmpdir(), "workflows-whole-character-text-"));
  const store = openWorkflowsStore(home);
  const content = {
    stations: async () => ["feed", "pages"].map(plugin => ({ plugin, label: plugin, icon: "x", supported: true, can_start_blank: false, receives: true })),
    resolveStation: async (station: { plugin: string }) => ({ ...station, content: { provider_id: `prov-${station.plugin}`, actions: {
      list: { capability_id: `${station.plugin}.l`, version: 1 }, read: { capability_id: `${station.plugin}.r`, version: 1 }, receive: { capability_id: `${station.plugin}.v`, version: 1 } } } }),
  };
  const ticket = { capability_id: TICKET.capability_id, version: TICKET.version, provider: { provider_id: TICKET.provider_id, title: "工单" }, operation: "command", availability: { available: true },
    action: { title: "新建工单", description: "建一张工单", kind: "operation", audiences: ["workflow"], input_schema: { type: "object", properties } } };
  const ports: WorkflowsActionPorts = {
    ...ownWorkflowsStores(run => run(store)), content: () => content, textModel: () => ({ available: false, code: "actions.connection_required", reason: "还没有可用的文字模型" }),
    actions: () => ({ discover: async () => [ticket], check: async () => {}, invoke: async () => { throw new Error("no action runs here"); } }),
  } as never;
  const handlers = createWorkflowsActionHandlers(PROJECT, ports);
  const call = <T = unknown>(definition: { capability_id: string }, input: unknown): Promise<T> => {
    const handler = handlers.find(item => item.capability_id === definition.capability_id)!;
    return handler.handle({ actor_id: "agent-1", project_id: PROJECT, audience: "agent", permissions: ["workflows:read", "workflows:write", "model:invoke"], beforeEffect: async () => {} } as never, input) as Promise<T>;
  };
  return { call, close: async () => { store.close(); await rm(home, { recursive: true, force: true }); } };
}

test("RAC-1964 the texts of a hand-over in a saved flow are cut to whole characters: the title template at 400, the body template at 8000, the instructions at 4000", async () => {
  const { call, close } = await setup();
  try {
    const link = { kind: "function", title_template: over("t", 400), body_template: over("b", 8000), instructions: over("i", 4000) };
    const { workflow } = await call<{ workflow: Flow }>(w.create, { title: "模板", chain: { stations: STATIONS, links: [link] } });
    const saved = workflow.links[0]!;
    assert.equal(saved.title_template, kept("t", 400));
    assert.equal(saved.body_template, kept("b", 8000));
    assert.equal(saved.instructions, kept("i", 4000));

    // That is what is stored, not only what the call answered.
    const read = (await call<{ workflow: Flow }>(w.get, { id: workflow.workflow_id })).workflow.links[0]!;
    assert.equal(read.title_template, kept("t", 400));
    assert.equal(read.body_template, kept("b", 8000));
    assert.equal(read.instructions, kept("i", 4000));
  } finally { await close(); }
});

test("RAC-1965 a template that fits is kept as it was, and one character over its limit is cut", () => {
  const parse = (link: Record<string, unknown>) => parseChain({ stations: STATIONS, links: [link] }).links[0]!;
  const texts = (link: Texts) => [link.title_template, link.body_template, link.instructions];
  // 400, 8000 and 4000 emoji are 800, 16000 and 8000 UTF-16 units: all of it fits, so all of it stays.
  const full = ["😀".repeat(400), "😀".repeat(8000), "😀".repeat(4000)];
  assert.deepEqual(texts(parse({ kind: "function", title_template: full[0], body_template: full[1], instructions: full[2] })), full);
  // One emoji more in each: the extra one goes, nothing else does.
  assert.deepEqual(texts(parse({ kind: "function", title_template: "😀".repeat(401), body_template: "😀".repeat(8001), instructions: "😀".repeat(4001) })), full);
  // What is not a string is an empty text, and a short text keeps its blanks.
  assert.deepEqual(texts(parse({ kind: "ai", title_template: 5, body_template: null, instructions: " 把这条 整理一下 " })), ["", "", " 把这条 整理一下 "]);
});

test("RAC-1966 the label of an action's input field is cut to 120 whole characters, whether it comes from the field's title or from its description", async () => {
  const { call, close } = await setup({
    named: { type: "string", title: over("t", 120), description: "不用这一条" },
    described: { type: "string", description: over("d", 120) },
  });
  try {
    const { actions } = await call<{ actions: Choice[] }>(w.actionSteps, {});
    const titles = Object.fromEntries(actions[0]!.fields.map(field => [field.name, field.title]));
    assert.equal(titles.named, kept("t", 120));
    assert.equal(titles.described, kept("d", 120));
  } finally { await close(); }
});

test("RAC-1967 a field label that fits is kept as it was, one character over is cut, and a field without a title or a description has no label", async () => {
  const { call, close } = await setup({
    exact: { type: "string", title: "😀".repeat(120) },
    longer: { type: "string", title: "😀".repeat(121) },
    described: { type: "string", description: "😀".repeat(121) },
    short: { type: "string", title: "标题", description: "不用这一条" },
    bare: { type: "string" },
  });
  try {
    const { actions } = await call<{ actions: Choice[] }>(w.actionSteps, {});
    const titles = Object.fromEntries(actions[0]!.fields.map(field => [field.name, field.title]));
    // 120 emoji is 240 UTF-16 units: it fits.
    assert.equal(titles.exact, "😀".repeat(120));
    assert.equal(titles.longer, "😀".repeat(120));
    assert.equal(titles.described, "😀".repeat(120));
    assert.equal(titles.short, "标题");
    assert.equal(titles.bare, undefined);
  } finally { await close(); }
});
