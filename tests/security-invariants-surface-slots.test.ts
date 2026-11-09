import assert from "node:assert/strict";
import test from "node:test";
import { LocalProjectDatabase, pluginPagesFor } from "@molis-ai/molis-work-app-local-host";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-app-workbench";
import { addProjectPlugin, LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

type Receipt = { slot: string; heights: { narrow: number; wide: number } };
type View = { render: string; display: SurfaceHomeDisplay; controls: { key: string; kind: string; label: string }[] };
async function read<T>(response: Response, status = 200): Promise<T> {
  const value = await response.json();
  assert.equal(response.status, status, JSON.stringify(value));
  return value;
}

test("IUI-07 IUI-08 IUI-10 IUI-13: Inbox's real mount has one current trusted render and confirms a Feed offer once", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Inbox presents the Feed origin"), other = await f.project("Other project");
  const web = new LocalHostHttpClient({ origin: f.origin, controlToken: f.token });
  for (const plugin of ["feed", "inbox"]) await addProjectPlugin(web, project.project_id, plugin);
  const prefix = "/projects/" + project.project_id, endpoint = prefix + "/api/contextual/surface-slot", pages = prefix + "/api/host/plugin-pages";
  const store = new LocalProjectDatabase(project.database_path, { existingOnly: true });
  t.after(() => store.close());
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, project.project_id);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "inbox-origin-slot" }).source;
  const material = feed.ingestItem({ source, externalId: "inbox-origin-slot", title: "The original report", summary: "Source summary",
    occurredAt: new Date().toISOString(), attention: false }).item;
  feed.ensureInboxEntryForFeedItem(project.project_id, material.item_id, "manual");
  assert.equal((await f.request(prefix + "/")).status, 200);

  const mount = { contribution_id: "io.molis.work.native.inbox.ui.v1", surface: "workbench", target_slot_id: "workbench.main" };
  const issue = (selection?: typeof mount, producer?: string) => f.request(pages, { method: "POST",
    body: { plugin_id: "io.molis.work.inbox", ...(selection ? { mount: selection } : {}), ...(producer ? { producer } : {}) } });
  await read(await issue({ ...mount, contribution_id: "io.molis.work.native.feed.ui.v1" }), 403);
  await read(await issue(mount, "an-old-runtime"), 409);
  const unbound = await read<{ page_id: string }>(await issue());
  let page = await read<{ page_id: string }>(await issue(mount));
  const trusted = { "x-molis-context-page": page.page_id }, child = { "x-molis-plugin-page": page.page_id };
  const post = (body: unknown, headers: Record<string, string> = trusted, path = endpoint) => f.request(path, { method: "POST", headers: { ...headers, connection: "close" }, body });
  const reserve = { intent: "reserve", mount_id: 1, slot_id: "inbox.origin", subjects: [{ kind: "feed_item", id: material.item_id }] };
  for (const headers of [{}, child, { ...trusted, ...child }, { "x-molis-context-page": unbound.page_id }]) await read(await post(reserve, headers), 403);
  await read(await post(reserve, trusted, "/projects/" + other.project_id + "/api/contextual/surface-slot"), 403);
  await read(await post({ ...reserve, slot_id: "another-contribution.slot" }), 403);
  await read(await post({ ...reserve, actor: "fake" }), 400);
  await read(await post({ ...reserve, subjects: [{ ...reserve.subjects[0], label: "fake" }] }), 400);
  let slot = await read<Receipt>(await post(reserve));
  assert.deepEqual(Object.keys(slot).sort(), ["heights", "slot"]);
  await read(await post(reserve), 403);
  const empty = await read<Receipt>(await post({ ...reserve, mount_id: 2, subjects: [] }));
  const absent = await read<Receipt>(await post({ ...reserve, mount_id: 3, subjects: [{ kind: "feed_item", id: "not-in-this-project" }] }));
  assert.deepEqual(empty.heights, slot.heights);
  assert.deepEqual(absent.heights, slot.heights);
  for (const record of [empty, absent]) {
    const value = await read<View>(await post({ intent: "read", slot: record.slot }));
    assert.equal(value.display.display.rows.some(row => row.read.state === "ok"), false);
    assert.deepEqual(value.controls, []);
    await read(await post({ intent: "close", slot: record.slot }));
  }

  const display = () => post({ intent: "read", slot: slot.slot }).then(response => read<View>(response));
  const activate = (view: View, label: string) => {
    const control = view.controls.find(control => control.label === label);
    assert.ok(control, JSON.stringify(view.controls));
    return post({ intent: "activate", slot: slot.slot, render: view.render, control: control.key });
  };
  const first = await display();
  assert.equal(first.display.groups[0]?.items[0]?.form, "card");
  assert.equal(first.display.display.rows[0]?.read.state === "ok" && first.display.display.rows[0].read.values?.title, material.title);
  const { result } = await read<{ result: { item_id: string } }>(await activate(first, "打开"));
  assert.equal(result.item_id, material.item_id, "the original read HTTP request has finished; its exact registration still resolves");
  const initialOffers = await read<{ choices: View["controls"] }>(await activate(first, "更多操作"));
  assert.ok(!initialOffers.choices.some(choice => choice.label === "加入 Inbox"), "an unavailable offer is not proposed for an item already in Inbox");
  const prepareOffer = async (view: View, label: string) => {
    const { choices } = await read<{ choices: View["controls"] }>(await activate(view, "更多操作"));
    return read<{ preparation: string }>(await activate({ ...view, controls: choices }, label));
  };
  const prep = await prepareOffer(first, "保存为资料");
  const confirm = (view: View, preparation: string) => post({ intent: "confirm", slot: slot.slot, render: view.render, preparation });
  const currentItem = () => feed.getFeedItem(project.project_id, material.item_id);
  await read(await post({ intent: "cancel", slot: slot.slot, preparation: prep.preparation }));
  await read(await confirm(first, prep.preparation), 409);
  assert.equal(currentItem().revision, material.revision);
  const old = await prepareOffer(first, "保存为资料");
  const fresh = await display();
  await read(await confirm(first, old.preparation), 409);
  assert.equal(currentItem().revision, material.revision);
  const prepared = await prepareOffer(fresh, "保存为资料");
  const concurrent = await Promise.all([confirm(fresh, prepared.preparation), confirm(fresh, prepared.preparation)]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
  for (const response of concurrent) await response.arrayBuffer();
  assert.equal(currentItem().disposition, "saved");
  assert.equal(currentItem().revision, material.revision + 1);
  const home = await read<SurfaceHomeDisplay>(await f.request(prefix + "/api/host/surface-home", { method: "POST", body: {} }));
  assert.ok(home.display.rows.some(row => row.subject.id === material.item_id && "revision" in row.read && row.read.revision.startsWith(String(material.revision + 1))));

  const original = f.host.callLog!.record;
  async function closeAt(actionId: string, run: () => Promise<Response>) {
    let closed = false;
    f.host.callLog!.record = function (caller, action, outcome) {
      if (!closed && outcome.ok && action.capability_id === actionId) {
        closed = true; pluginPagesFor(f.home).close(page.page_id);
      }
      return original.call(this, caller, action, outcome);
    };
    try {
      const response = await run();
      assert.ok(closed, "the real owner finished the awaited operation");
      return response;
    } finally { f.host.callLog!.record = original; }
  }
  const beforeLoss = await display();
  const beforeArchive = await prepareOffer(beforeLoss, "忽略");
  const withdrawn = await closeAt("feed.items.offers", () => confirm(beforeLoss, beforeArchive.preparation));
  assert.ok(!withdrawn.ok, await withdrawn.text());
  assert.equal(currentItem().disposition, "saved");
  assert.equal(currentItem().revision, material.revision + 1, "an offer that loses its original page while checking cannot write");
  await read(await post({ intent: "read", slot: slot.slot }), 403);

  page = await read<{ page_id: string }>(await issue(mount));
  trusted["x-molis-context-page"] = page.page_id;
  slot = await read<Receipt>(await post(reserve));
  const newPage = await display(), afterArchive = await prepareOffer(newPage, "忽略");
  const unknown = await closeAt("feed.items.disposition", () => confirm(newPage, afterArchive.preparation));
  assert.ok(!unknown.ok, await unknown.text());
  assert.equal(currentItem().disposition, "archived");
  await read(await confirm(newPage, afterArchive.preparation), 403);
  assert.equal(currentItem().revision, material.revision + 2, "a late loss leaves the committed fact, and a retry does not write again");
});
