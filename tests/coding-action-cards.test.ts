// specs/ai-interaction-experience D25 (2c): a Coding round's suggestions become the session's cards. A card lands once
// per suggestion, only after the call's own check and only while its action is still offered; the person runs it once,
// exactly as shown, through the Agent Host's agent.offers.run; how it ended reads by the failure's kind.
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, agentOfferActions, type AgentRunOffer } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CODING_PROJECT_DATABASE, CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { codingFixtureRoutes } from "./fixtures/coding-surface.js";
import { noEffect } from "./fixtures/coding-sessions.js";
import { memoryPluginDatabase } from "./fixtures/plugin-database.js";

const WRITE: ActionView = { capability_id: "fixture.notes.write", version: 1, operation: "command",
  provider: { provider_id: "fixture.notes", kind: "plugin", title: "Notes" }, availability: { available: true },
  action: { title: "Save a note", description: "Store a note", kind: "operation", scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { text: { type: "string", title: "内容" } }, required: ["text"], additionalProperties: false } } };
const reference: ExactActionReference = { capability_id: WRITE.capability_id, version: WRITE.version, provider_id: WRITE.provider.provider_id };
const offer: AgentRunOffer = { offer_id: "offer-1", offered_at: "2026-10-16T08:00:00.000Z", title: "保存这条笔记", summary: "把“会后发纪要”存进项目笔记",
  reference, input: { text: "会后发纪要" }, editable: ["text"], action_digest: "digest" };
const run = (offers: AgentRunOffer[]) => ({ ref: { session_id: "sdk", run_id: "r1" }, phase: "completed", turns: [], activity: [], awaiting_input: [],
  usage: { tokens: { input: 0, output: 0 } }, frozen: { role_id: "builder", action_tools: [reference], text_materials: [] }, offers });

/** Coding's routes over a session with one ended round, private storage that compares and sets, and a recorded Agent Host. */
async function codingCards(options: { offers?: AgentRunOffer[]; views?: () => ActionView[]; run?: (input: unknown) => Promise<unknown>; beforeCompare?: (stored: Map<string, string>) => void } = {}) {
  const db = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, ["board"]);
  const sessions = new CodingSessionStore(db), at = "2026-10-16T08:00:00Z";
  await sessions.create(noEffect, { project_id: "board", session_id: "app", title: "笔记", runtime_id: "prologue", at });
  await sessions.setRuntimeSession(noEffect, "board", "app", "sdk", at);
  const stored = new Map<string, string>(), ran: unknown[] = [];
  const storage = { get: (key: string) => stored.get(key) ?? null, set: (key: string, value: string) => { stored.set(key, value); }, delete: (key: string) => stored.delete(key),
    compareAndSet: (key: string, expected: string | null, value: string) => { options.beforeCompare?.(stored); if ((stored.get(key) ?? null) !== expected) return false; stored.set(key, value); return true; } };
  const capabilities = { invoke: async (definition: { capability_id: string }) => {
    if (definition.capability_id === agent.readSession.capability_id) return { runs: [{ session_id: "sdk", run_id: "r1" }] };
    if (definition.capability_id === agent.readRun.capability_id) return run(options.offers ?? [offer]);
    if (definition.capability_id === agent.listActions.capability_id) return options.views?.() ?? [WRITE];
    throw new Error("not in this fixture: " + definition.capability_id);
  } };
  const context: PluginStartContext = { project_id: "board", plugin_id: "io.molis.work.coding", services: { storage, capabilities } } as never;
  const routes = codingFixtureRoutes(context, sessions);
  // The fixture redeems Coding's own actions; the Agent Host's session and round reads (actions Coding calls as itself, R8 batch 3)
  // answer from the recorded Agent Host above, and its suggestion runner is recorded here.
  const actions = context.services!.actions!, own = actions.invoke.bind(actions);
  Object.assign(actions, { invoke: async (definition: { capability_id: string }, input: unknown, control?: { beforeEffect?(): Promise<void> }) => {
    if (definition.capability_id === agent.readSession.capability_id || definition.capability_id === agent.readRun.capability_id) return capabilities.invoke(definition);
    if (definition.capability_id !== agentOfferActions.run.capability_id) return own(definition as never, input as never, control as never);
    await control?.beforeEffect?.(); ran.push(input);
    return { output: await (options.run?.(input) ?? Promise.resolve({ saved: "note-7" })) };
  } });
  const call = async (id: string, params: Record<string, string>, extra: Partial<PluginRouteRequest> = {}) =>
    (routes.find(route => route.route_id === id)!).handle({ params, ...extra } as PluginRouteRequest);
  const cards = () => { const raw = stored.get("cards:app"); return raw ? (JSON.parse(raw) as { cards: Array<Record<string, unknown>> }).cards : []; };
  return { call, cards, ran, close: () => db.close() };
}
type Shown = { runs: Array<{ cards: Array<{ card_id: string; status: string; revision: number; offer_id: string }> }> };

test("D25 a round's suggestion lands once as a card beside its round, after the call's own check; reading again lands nothing new", async () => {
  const f = await codingCards();
  try {
    let checks = 0;
    const execution = { beforeEffect: async () => { checks++; }, assert_authority_current: () => {} };
    const first = await f.call("coding.read-runs", { sessionId: "app" }, { execution } as never);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const shown = (first.body as Shown).runs[0]!.cards;
    assert.deepEqual(shown.map(card => [card.card_id, card.status, card.revision, card.offer_id]), [["card-offer-1", "ready", 1, "offer-1"]]);
    assert.ok(checks >= 1, "the projection was returned after the call's own check");
    await f.call("coding.read-runs", { sessionId: "app" });
    await f.call("coding.read-runs", { sessionId: "app" });
    assert.equal(f.cards().length, 0, "SYS-15-Q1: repeated queries persist no card");
    assert.deepEqual(((await f.call("coding.read-runs", { sessionId: "app" })).body as Shown).runs[0]!.cards, shown, "the same offer has a stable projection before it is saved");
    assert.equal(f.ran.length, 0, "landing runs nothing");
  } finally { f.close(); }
});

test("D25 a suggestion read after its action stopped being offered, or by a call that was revoked, lands no card", async () => {
  // One Coding activation at a time: a newer one stops the one before it, as the Runtime does.
  for (const views of [() => [{ ...WRITE, availability: { available: false, code: "notes.disabled", reason: "Notes is turned off" } }], () => []]) {
    const f = await codingCards({ views });
    try {
      const read = await f.call("coding.read-runs", { sessionId: "app" });
      assert.equal(read.status, 200, JSON.stringify(read.body));
      assert.deepEqual((read.body as Shown).runs[0]!.cards, []);
      assert.equal(f.cards().length, 0);
    } finally { f.close(); }
  }
  const revoked = await codingCards();
  try {
    const execution = { beforeEffect: async () => { throw new ActionError("plugins.activation_revoked", "activation revoked"); }, assert_authority_current: () => {} };
    const read = await revoked.call("coding.read-runs", { sessionId: "app" }, { execution } as never);
    assert.notEqual(read.status, 200);
    assert.equal(revoked.cards().length, 0, "a revoked call writes no card");
  } finally { revoked.close(); }
});

test("D25 the person runs a card once, exactly as its suggestion named, with their changes; a second click and a stale revision run nothing", async () => {
  const f = await codingCards();
  try {
    await f.call("coding.read-runs", { sessionId: "app" });
    const [ranOnce, second] = await Promise.all([
      f.call("coding.card-run", { sessionId: "app", cardId: "card-offer-1" }, { body: { revision: 1, values: { text: "会后发纪要，抄送小林" } } }),
      f.call("coding.card-run", { sessionId: "app", cardId: "card-offer-1" }, { body: { revision: 1, values: {} } }),
    ]);
    assert.deepEqual(f.ran, [{ runtime_id: "prologue", session_id: "sdk", run_id: "r1", offer_id: "offer-1", reference, input: { text: "会后发纪要，抄送小林" } }], "one run, of the offer's own reference");
    assert.deepEqual([ranOnce.status, second.status].sort(), [200, 409], "the second click lost the claim");
    assert.equal((ranOnce.body as { card: { status: string } }).card.status, "done");
    // A card that ran answers as it stands; clicking it again runs nothing.
    const again = await f.call("coding.card-run", { sessionId: "app", cardId: "card-offer-1" }, { body: { revision: 3, values: {} } });
    assert.deepEqual([again.status, (again.body as { card: { status: string } }).card.status], [200, "done"]);
    assert.equal(f.ran.length, 1);
    const unknown = await f.call("coding.card-run", { sessionId: "app", cardId: "card-forged" }, { body: { revision: 1, values: {} } });
    assert.deepEqual([unknown.status, (unknown.body as { code: string }).code], [404, "coding.card_unknown"]);
  } finally { f.close(); }
});

test("D25 (D26) how a card's run ended reads by the Host's refusal kind: a changed contract is stale, a refused input failed and may be tried again", async () => {
  let refusal: ActionError = new ActionError("actions.definition_changed", "contract changed");
  const f = await codingCards({ run: async () => { throw refusal; } });
  try {
    await f.call("coding.read-runs", { sessionId: "app" });
    const stale = await f.call("coding.card-run", { sessionId: "app", cardId: "card-offer-1" }, { body: { revision: 1, values: {} } });
    assert.equal((stale.body as { card: { status: string } }).card.status, "stale");
  } finally { f.close(); }
  {
    const g = await codingCards({ run: async () => { throw refusal; } });
    try {
      refusal = new ActionError("actions.input_invalid", "text must be a string");
      await g.call("coding.read-runs", { sessionId: "app" });
      const failed = await g.call("coding.card-run", { sessionId: "app", cardId: "card-offer-1" }, { body: { revision: 1, values: {} } });
      const card = (failed.body as { card: { status: string; revision: number } }).card;
      assert.equal(card.status, "failed");
      // A failed card may be tried again, but only at the revision the person saw.
      const behind = await g.call("coding.card-run", { sessionId: "app", cardId: "card-offer-1" }, { body: { revision: card.revision - 1, values: {} } });
      assert.deepEqual([behind.status, (behind.body as { code: string }).code], [409, "coding.card_conflict"]);
      const dismissed = await g.call("coding.card-dismiss", { sessionId: "app", cardId: "card-offer-1" });
      assert.equal((dismissed.body as { card: { status: string } }).card.status, "dismissed");
      const after = await g.call("coding.card-run", { sessionId: "app", cardId: "card-offer-1" }, { body: { revision: card.revision + 1, values: {} } });
      assert.equal((after.body as { card: { status: string } }).card.status, "dismissed", "a card put away does not run");
      assert.equal(g.ran.length, 1);
    } finally { g.close(); }
  }
});

test("D25 (D26) two cards of one session clicked at once both run and are both recorded; a lost compare reads again, never overwrites the other card", async () => {
  const second: AgentRunOffer = { ...offer, offer_id: "offer-2", title: "再存一条", input: { text: "周五前交" } };
  type Card = { card_id: string; status: string; revision: number };
  const statuses = (cards: Array<Record<string, unknown>>) => Object.fromEntries(cards.map(card => [card.card_id, [card.status, card.revision]]));
  const f = await codingCards({ offers: [offer, second], run: async input => { await new Promise(resolve => setTimeout(resolve, 10)); return { saved: (input as { offer_id: string }).offer_id }; } });
  try {
    await f.call("coding.read-runs", { sessionId: "app" });
    const [one, two] = await Promise.all(["card-offer-1", "card-offer-2"].map(cardId => f.call("coding.card-run", { sessionId: "app", cardId }, { body: { revision: 1, values: {} } })));
    assert.deepEqual([one.status, two.status], [200, 200], JSON.stringify([one.body, two.body]));
    assert.deepEqual([(one.body as { card: Card }).card.status, (two.body as { card: Card }).card.status], ["done", "done"]);
    assert.deepEqual(f.ran.map(input => (input as { offer_id: string }).offer_id).sort(), ["offer-1", "offer-2"], "each card ran once");
    assert.deepEqual(statuses(f.cards()), { "card-offer-1": ["done", 3], "card-offer-2": ["done", 3] }, "neither card's write was lost");
  } finally { f.close(); }
  // The other card is changed between this card's read and its compare: the write reads again and keeps that change.
  let raced = false;
  const g = await codingCards({ offers: [offer, second], beforeCompare: stored => {
    const raw = stored.get("cards:app"); if (raced || !raw) return;
    const held = JSON.parse(raw) as { cards: Array<Record<string, unknown>> };
    if (held.cards.length < 2 || held.cards[0]!.status !== "ready") return;
    raced = true;
    stored.set("cards:app", JSON.stringify({ cards: held.cards.map(card => card.card_id === "card-offer-2" ? { ...card, status: "dismissed", revision: 2 } : card) }));
  } });
  try {
    await g.call("coding.read-runs", { sessionId: "app" });
    const ran = await g.call("coding.card-run", { sessionId: "app", cardId: "card-offer-1" }, { body: { revision: 1, values: {} } });
    assert.equal(raced, true, "the compare lost once");
    assert.equal((ran.body as { card: Card }).card.status, "done", JSON.stringify(ran.body));
    assert.deepEqual(statuses(g.cards()), { "card-offer-1": ["done", 3], "card-offer-2": ["dismissed", 2] }, "the other card's change was kept");
    // Only the same card's own revision moving is a conflict.
    const stale = await g.call("coding.card-dismiss", { sessionId: "app", cardId: "card-offer-2" });
    assert.equal((stale.body as { card: Card }).card.status, "dismissed");
  } finally { g.close(); }
});
