import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService } from "../packages/kernel/src/action-service.js";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesInputSnapshot } from "@molis-ai/molis-work-contracts/modules/pages";
import { createInboxActionHandlers, inboxActions, INBOX_ACTIONS, INBOX_ACTION_PERMISSIONS, type InboxActionEntry, type InboxPagesInput } from "../plugins/native/inbox/src/actions.js";
import { createInboxPagesHandlers, inboxPagesRequestHash } from "../plugins/native/inbox/src/pages.js";
import { createPagesActionHandlers, pagesActions, PAGES_ACTIONS } from "../plugins/native/pages/src/actions.js";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { createHomeOfferHandlers, homeOfferActions, type HomeActionOffers, type HomeOfferExecutionInput } from "../apps/local-host/src/home-offer-actions.js";

const inboxId = "io.molis.work.inbox", pagesId = "io.molis.work.pages";
function deferred() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "inbox-prepared-pages-")), store = openPagesStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const actions = new ActionService();
  let authorized = true, permitted = true, dispatches = 0, clock = 0;
  const entry: InboxActionEntry = { entry_id: "entry", board_id: "board", project_id: "project", subject_type: "feed_item", subject_id: "item",
    reason: "manual", status: "open", revision: 1, detail: {}, created_at: "2026-09-26T00:00:00Z", updated_at: "2026-09-26T00:00:00Z", completed_at: null };
  const material: PagesInputSnapshot = { entry_id: "entry", item_id: "item", revision: 3, title: "原观察", body: "仅为作者自述，效果尚未复现。",
    url: "https://example.com/observation", source_label: "来源", captured_at: "initial", provenance: [{ scope: "summary" }] };
  let beforeRequest = async (guard?: () => Promise<void>) => { await guard?.(); };
  let beforeRead = async () => {};
  const caller: ActionCallContext = { actor_id: "owner", project_id: "project", audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "home:read"],
    validate_permissions() { if (!permitted) throw new ActionError("actions.forbidden", "权限已撤销"); } };
  actions.registerProvider({ provider: { provider_id: pagesId, kind: "plugin", title: "Pages", project_id: "project" }, definitions: PAGES_ACTIONS,
    handlers: createPagesActionHandlers({ withStore: run => run(store), modelAvailability: () => ({ available: true }),
      async completeText(_prompt, options) { await beforeRequest(options.beforeDispatch); dispatches++; return "有边界的整理。[材料 1]"; } }) });
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
