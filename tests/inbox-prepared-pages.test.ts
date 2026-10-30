import { readMaterialUploads } from "../apps/local-host/src/material-documents.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesInputSnapshot } from "@molis-ai/molis-work-plugin-pages/contract";
import { createInboxActionHandlers, inboxActions, INBOX_ACTIONS, INBOX_ACTION_PERMISSIONS, type InboxActionEntry, type InboxPagesInput } from "@molis-ai/molis-work-plugin-inbox";
import { createInboxPagesHandlers, inboxPagesRequestHash } from "@molis-ai/molis-work-plugin-inbox";
import { createPagesActionHandlers, ownPagesStores, pagesActions, preparePagesImport, PAGES_ACTIONS } from "@molis-ai/molis-work-plugin-pages";
import { feedInboxActions } from "@molis-ai/molis-work-plugin-feed";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { createHomeOfferHandlers, homeOfferActions, type HomeActionOffers, type HomeOfferExecutionInput } from "../apps/local-host/src/home-offer-actions.js";

const inboxId = "io.molis.work.inbox", pagesId = "io.molis.work.pages";
function deferred() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "inbox-prepared-pages-")), store = openPagesStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const actions = new ActionService();
  let authorized = true, permitted = true, dispatches = 0, clock = 0;
  const entry: InboxActionEntry = { entry_id: "entry", project_id: "board", subject_type: "feed_item", subject_id: "item",
    reason: "manual", status: "open", revision: 1, detail: {}, created_at: "2026-09-26T00:00:00Z", updated_at: "2026-09-26T00:00:00Z", completed_at: null };
  const material: PagesInputSnapshot = { entry_id: "entry", item_id: "item", revision: 3, title: "原观察", body: "仅为作者自述，效果尚未复现。",
    url: "https://example.com/observation", source_label: "来源", captured_at: "initial", provenance: [{ scope: "summary" }] };
  let beforeRequest = async (guard?: () => Promise<void>) => { await guard?.(); };
  let beforeRead = async () => {};
  const caller: ActionCallContext = { actor_id: "owner", project_id: "project", audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "home:read"],
    validate_permissions() { if (!permitted) throw new ActionError("actions.forbidden", "权限已撤销"); } };
  actions.registerProvider({ provider: { provider_id: pagesId, kind: "plugin", title: "Pages", project_id: "project" }, definitions: PAGES_ACTIONS,
    handlers: createPagesActionHandlers({ prepareImport: async (files, caller) => preparePagesImport(await readMaterialUploads(files.map(file => ({ file_name: file.name, data_base64: file.data })), { signal: caller.signal })),
      ...ownPagesStores(run => run(store)), modelAvailability: () => ({ available: true }),
      async complete(_prompt, options) { await beforeRequest(options.beforeDispatch); dispatches++; return { text: "有边界的整理。[材料 1]", validateResult: () => {} }; } }) });
  const pages = createInboxPagesHandlers({
    async generation(request_id, current) { return (await actions.invoke(current, { ...pagesActions.generation, provider_id: pagesId }, { request_id }) as { record: ReturnType<typeof store.generation> }).record; },
    async generations(current) { return (await actions.invoke(current, { ...pagesActions.generations, provider_id: pagesId }, {}) as { records: ReturnType<typeof store.generations> }).records; },
    async readDocument(id, current) { return (await actions.invoke(current, { ...pagesActions.get, provider_id: pagesId }, { id }) as { document: ReturnType<typeof store.get> }).document; },
    async generate(input, current) { return await actions.invoke(current, { ...pagesActions.generate, provider_id: pagesId }, input) as { document: ReturnType<typeof store.get>; replayed: boolean }; },
    async readMaterial(id, current) { await current.validate_permissions?.(["inbox:read"]); assert.equal(id, entry.entry_id);
      await beforeRead();
      if (!authorized) throw new ActionError("actions.source_unavailable", "来源已断开");
      return { ...structuredClone(material), captured_at: String(++clock) }; },
  });
  // Inbox's generation reads the material again through Feed's `feed.items.material`, a required action: Feed only has to be there,
  // the material itself comes from `readMaterial` above.
  actions.registerProvider({ provider: { provider_id: "io.molis.work.feed", kind: "plugin", title: "Feed", project_id: "project" }, definitions: [feedInboxActions.material],
    handlers: [{ ...feedInboxActions.material, handle: () => { throw new Error("unused"); } }] });
  const withdrawInbox = actions.registerProvider({ provider: { provider_id: inboxId, kind: "plugin", title: "Inbox", project_id: "project" }, definitions: INBOX_ACTIONS,
    handlers: createInboxActionHandlers({ ...pages, listEntries: () => [entry], setStatus: () => { throw new Error("unused"); } }) });
  actions.registerProvider({ provider: { provider_id: "home", kind: "system", title: "Home", project_id: "project" }, definitions: Object.values(homeOfferActions), handlers: createHomeOfferHandlers(actions) });
  const request = { subject: { kind: "inbox_entry", id: entry.entry_id }, request_id: "来自首页的一次确认 / 📝" };
  const prepare = async () => await actions.invoke(caller, homeOfferActions.offers, request) as HomeActionOffers;
  const execute = (offer: HomeActionOffers["offers"][number]) => actions.invoke(caller, homeOfferActions.execute,
    { ...request, offer: Object.fromEntries(Object.entries(offer).filter(([key]) => key !== "availability")) } as unknown as HomeOfferExecutionInput);
  return { actions, store, caller, entry, material, prepare, execute, withdrawInbox,
    dispatches: () => dispatches, setAuthorized(value: boolean) { authorized = value; }, revoke() { permitted = false; },
    beforeRequest(callback: typeof beforeRequest) { beforeRequest = callback; },
    beforeRead(callback: typeof beforeRead) { beforeRead = callback; } };
}

test("Inbox declares and prepares its own stable Pages offer for Home without a model or business write", async t => {
  const f = await fixture(t), first = await f.prepare(), next = await f.prepare();
  assert.deepEqual(first.issues, []);
  const offer = first.offers.find(value => value.offer_id === "inbox.pages")!;
  assert.ok(offer); assert.deepEqual(offer.availability, { available: true }); assert.ok(offer.recommendation_key);
  assert.deepEqual(offer, next.offers.find(value => value.offer_id === "inbox.pages"), "read time does not change prepared input");
  const input = offer.input as InboxPagesInput;
  assert.match(input.request_id, /^[a-zA-Z0-9:_-]{8,128}$/); assert.equal(input.expected_materials![0]!.revision, 3);
  assert.equal(JSON.stringify(input).includes(f.material.body), false);
  assert.equal(f.dispatches(), 0); assert.equal(f.store.generations("project").length, 0);
  const unavailable = await f.actions.invoke({ ...f.caller, permissions: ["inbox:read", "home:read"] }, homeOfferActions.offers,
    { subject: { kind: "inbox_entry", id: "entry" }, request_id: "no-grant" }) as HomeActionOffers;
  assert.equal(unavailable.offers.find(value => value.offer_id === "inbox.pages")!.availability.available, false);
  f.entry.status = "done"; assert.equal((await f.prepare()).offers.length, 0);
});

test("a changed material body invalidates the original prepared input even when its reported revision is unchanged", async t => {
  const f = await fixture(t), offer = (await f.prepare()).offers.find(value => value.offer_id === "inbox.pages")!;
  Object.assign(f.material, { body: "Changed source text" });
  await assert.rejects(f.execute(offer), /参数已变化/);
  await assert.rejects(f.actions.invoke(f.caller, inboxActions.generatePages, offer.input), /原材料已变化/);
  assert.equal(f.dispatches(), 0); assert.equal(f.store.generations("project").length, 0);
});

for (const mode of ["source", "material", "permission", "provider"] as const) test(`${mode} withdrawal during request preparation blocks Pages dispatch and later SQLite commit`, async t => {
  const f = await fixture(t), entered = deferred(), release = deferred();
  t.after(() => release.resolve());
  f.beforeRequest(async guard => { entered.resolve(); await release.promise; assert.equal(typeof guard, "function"); await guard!(); });
  const offer = (await f.prepare()).offers.find(value => value.offer_id === "inbox.pages")!;
  const pending = f.execute(offer), rejected = assert.rejects(pending);
  await entered.promise;
  if (mode === "source") f.setAuthorized(false);
  if (mode === "material") Object.assign(f.material, { body: "Changed while credentials were prepared" });
  if (mode === "permission") f.revoke();
  if (mode === "provider") f.withdrawInbox();
  release.resolve(); await rejected;
  assert.equal(f.dispatches(), 0); assert.equal(f.store.list("project").length, 0);
  const record = f.store.generations("project")[0]!;
  assert.equal(record.status, "running", "revoked invocation cannot mutate failure bookkeeping either");
});

for (const mode of ["permission", "provider"] as const) test(`${mode} withdrawal inside asynchronous material authorization still blocks the nested Pages dispatch`, async t => {
  const f = await fixture(t), entered = deferred(), release = deferred();
  t.after(() => release.resolve());
  f.beforeRequest(async guard => {
    f.beforeRead(async () => { entered.resolve(); await release.promise; });
    await guard!();
  });
  const offer = (await f.prepare()).offers.find(value => value.offer_id === "inbox.pages")!;
  const pending = f.execute(offer), rejected = assert.rejects(pending);
  await entered.promise;
  if (mode === "permission") f.revoke(); else f.withdrawInbox();
  release.resolve(); await rejected;
  assert.equal(f.dispatches(), 0); assert.equal(f.store.list("project").length, 0);
});

test("completed Inbox generation returns the currently edited original document without reading withdrawn materials or invoking the model again", async t => {
  const f = await fixture(t), offer = (await f.prepare()).offers.find(value => value.offer_id === "inbox.pages")!;
  await f.execute(offer);
  const input = offer.input as InboxPagesInput, record = f.store.generation("project", input.request_id)!;
  assert.equal(record.status, "completed"); assert.equal(record.request_hash, inboxPagesRequestHash(input));
  f.store.update(record.document_id!, { title: "用户编辑后的标题" }, "project"); f.setAuthorized(false);
  const replay = await f.actions.invoke(f.caller, inboxActions.generatePages, input) as { document: { title: string }; replayed: boolean };
  assert.equal(replay.replayed, true); assert.equal(replay.document.title, "用户编辑后的标题");
  assert.equal(f.dispatches(), 1); assert.equal(f.store.list("project").length, 1);
});

// T-252: the whole limit on the materials one generation adopts counts characters, as the action's schemas and the model port do,
// not UTF-16 units: an emoji is one character and two units.
test("RAC-2280 materials of 120000 UTF-16 units but 60000 characters (all emoji) are accepted", async t => {
  const f = await fixture(t);
  const body = "😀".repeat(60_000);
  assert.equal(body.length, 120_000, "1.2 units a character: the old unit-counted check refused this");
  const made = await f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId },
    { request_id: "rac-2280-materials", request_hash: "rac-2280", title: "材料整理", instructions: "按要求整理。",
      inputs: [{ entry_id: "entry-1", item_id: "item-1", revision: 1, title: "材料 1", body, url: null, source_label: "来源", captured_at: "initial", provenance: [] }] }) as { document: { title: string } };
  assert.equal(made.document.title, "材料整理", "the generation ran and saved its document");
  assert.equal(f.store.generation("project", "rac-2280-materials")!.inputs[0]!.body.length, 120_000, "and kept the material as it came");
});

test("RAC-2281 materials of 100001 characters are refused, and exactly 100000 are accepted", async t => {
  const f = await fixture(t);
  const materials = (body: string) => ({ request_id: `rac-2281-${body.length}`, request_hash: "rac-2281", title: "材料整理", instructions: "按要求整理。",
    inputs: [{ entry_id: "entry-1", item_id: "item-1", revision: 1, title: "材料 1", body, url: null, source_label: "来源", captured_at: "initial", provenance: [] }] });
  await assert.rejects(f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId }, materials("a".repeat(100_001))),
    { code: "pages.invalid", message: /材料过长/ }, "one character over the limit is refused");
  const made = await f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId }, materials("a".repeat(100_000))) as { document: { title: string } };
  assert.equal(made.document.title, "材料整理", "exactly the limit is accepted");
  // Exactly 100,000 characters of two-unit characters: 200,000 units, so the middle band is counted, and the count is at the limit.
  const twoUnits = await f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId }, materials("😀".repeat(100_000))) as { document: { title: string } };
  assert.equal(twoUnits.document.title, "材料整理", "exactly 100000 two-unit characters are accepted");
});

test("RAC-2282 materials over 200000 UTF-16 units are refused before any character count of them", async t => {
  const f = await fixture(t);
  const body = "a".repeat(200_001);
  await assert.rejects(f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId },
    { request_id: "rac-2282-materials", request_hash: "rac-2282", title: "材料整理", instructions: "按要求整理。",
      inputs: [{ entry_id: "entry-1", item_id: "item-1", revision: 1, title: "材料 1", body, url: null, source_label: "来源", captured_at: "initial", provenance: [] }] }),
    { code: "pages.invalid", message: /材料过长/ });
  assert.equal(f.store.generations("project").length, 0, "nothing of a refused generation is recorded");
});

// T-254: what the model port measures is the whole prompt, in characters. The materials' JSON sits inside it, so its length is
// checked here, before the request is taken and a generation record is written (the Host's own refusal used to come one step late).
const material = (body: string) => ({ entry_id: "entry-1", item_id: "item-1", revision: 1, title: "材料 1", body, url: null,
  source_label: "来源", captured_at: "initial", provenance: [] });
const generationInput = (g: number, inputs: ReturnType<typeof material>[]) => ({ request_id: `rac-${g}`, request_hash: `rac-${g}`,
  title: "材料整理", instructions: "按要求整理。", inputs });

test("RAC-2285 materials whose JSON exceeds the prompt budget are refused before the request is taken, and nothing is recorded", async t => {
  const f = await fixture(t), body = "\"".repeat(100_000), json = JSON.stringify([material(body)]);
  assert.ok(json.length > 175_800 && json.length < 351_600, "each quote costs two characters in JSON: inside the band that is counted");
  await assert.rejects(f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId }, generationInput(2285, [material(body)])),
    { code: "pages.invalid", message: /材料过长/ });
  assert.equal(f.store.generations("project").length, 0, "nothing of a refused generation is recorded");
  assert.equal(f.dispatches(), 0, "and the model is never asked");
});

test("RAC-2286 exactly the prompt budget of materials JSON is accepted and one more character is refused", async t => {
  const f = await fixture(t), overhead = JSON.stringify([material("")]).length;
  // The bodies are held to 100,000 characters by the check above this one: reach the JSON budget with quotes, two characters each in JSON.
  const body = (quotes: number) => "\"".repeat(quotes) + "a".repeat(100_000 - quotes);
  const quotes = 175_800 - overhead - 100_000;
  assert.equal(JSON.stringify([material(body(quotes))]).length, 175_800, "the materials JSON is exactly the budget");
  const made = await f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId }, generationInput(2286, [material(body(quotes))])) as { document: { title: string } };
  assert.equal(made.document.title, "材料整理", "exactly the budget is accepted");
  assert.equal(f.store.generation("project", "rac-2286")!.status, "completed");
  assert.equal(JSON.stringify([material(body(quotes + 1))]).length, 175_801, "one more quote is one more JSON character");
  await assert.rejects(f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId },
    { ...generationInput(2286, [material(body(quotes + 1))]), request_id: "rac-2286-over", request_hash: "rac-2286-over" }),
    { code: "pages.invalid", message: /材料过长/ }, "one character over the budget is refused");
  assert.equal(f.store.generations("project").length, 1, "and the refused one leaves no record");
});

test("RAC-2287 materials JSON over the budget in units but under it in characters (all emoji) is accepted", async t => {
  const f = await fixture(t), body = "😀".repeat(100_000), json = JSON.stringify([material(body)]);
  assert.ok(json.length > 175_800, "units alone would refuse it");
  assert.ok([...json].length < 175_800, "its characters are under the budget");
  const made = await f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId }, generationInput(2287, [material(body)])) as { document: { title: string } };
  assert.equal(made.document.title, "材料整理", "the generation ran, counted in characters as the Host counts");
});

test("RAC-2289 a failed request whose stored snapshot is over the JSON budget is refused before it is taken over, and its record is not rewritten", async t => {
  const f = await fixture(t);
  // A failed attempt keeps its snapshot: beginGeneration reuses it for the same request_id and request_hash, and the prompt is built from
  // that snapshot, not from the shorter materials this retry carries.
  const record = { request_id: "rac-2289-failed", request_hash: "rac-2289", project_id: "project", status: "running" as const, document_id: null,
    error: null, updated_at: new Date().toISOString(), title: "材料整理", instructions: "按要求整理。", inputs: [material("\"".repeat(100_000))] };
  f.store.failGeneration(f.store.beginGeneration(record), "模型端口拒绝");
  const before = f.store.generation("project", record.request_id);
  assert.ok(JSON.stringify(before!.inputs).length > 175_800, "the stored snapshot alone is over the budget");
  await assert.rejects(f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId },
    { request_id: record.request_id, request_hash: record.request_hash, title: "材料整理", instructions: "按要求整理。", inputs: [material("短材料")] }),
    { code: "pages.invalid", message: /材料过长/ }, "refused before the request is taken over");
  assert.deepEqual(f.store.generation("project", record.request_id), before, "the earlier failed record is as it was");
  assert.equal(f.dispatches(), 0, "the model is never asked");
  assert.equal(f.store.list("project").length, 0, "and no document is written");
});

test("RAC-2289 a completed request still replays without a prompt, even when the retry carries materials over the budget", async t => {
  const f = await fixture(t);
  const first = await f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId }, generationInput(2289, [material("短材料")])) as { document: { id: string }; replayed: boolean };
  assert.equal(first.replayed, false);
  const stored = f.store.generation("project", "rac-2289");
  const replay = await f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId },
    generationInput(2289, [material("\"".repeat(100_000))])) as { document: { id: string }; replayed: boolean };
  assert.equal(replay.replayed, true, "the completed generation is replayed");
  assert.equal(replay.document.id, first.document.id, "with its document, not a new one");
  assert.equal(f.dispatches(), 1, "and no prompt is sent for the replay");
  assert.deepEqual(f.store.generation("project", "rac-2289"), stored, "the completed record is unchanged");
});

test("RAC-2288 ordinary materials well under the budget still generate the document", async t => {
  const f = await fixture(t);
  const inputs = [{ ...material("甲".repeat(3_000)), entry_id: "entry-a", item_id: "item-a" }, { ...material("乙".repeat(3_000)), entry_id: "entry-b", item_id: "item-b" }];
  const made = await f.actions.invoke(f.caller, { ...pagesActions.generate, provider_id: pagesId }, generationInput(2288, inputs)) as { document: { title: string } };
  assert.equal(made.document.title, "材料整理");
  assert.equal(f.store.generation("project", "rac-2288")!.status, "completed");
});
