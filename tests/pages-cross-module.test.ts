import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { pagesActions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { inboxActions, INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";


import type { HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function fixture(t: any, completeText: HostCompleteText | null = async () => "Generated from real material [材料 1]") {
  const home = await mkdtemp(join(tmpdir(), "pages-cross-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "Pages", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  // Inbox reads an entry's material through Feed's `feed.items.material` as this caller (FI-6), which asks the source's account
  // (`connections:use`) and decrypts the retained body (`evidence:read`): the caller holds both, as the person's page caller does.
  const caller: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user",
    permissions: [...PAGES_ACTION_PERMISSIONS, ...INBOX_ACTION_PERMISSIONS, "connections:use", "evidence:read"] };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  await host.withProject(ref, () => undefined);
  t.after(async () => { await host.close(); catalog.close(); await rm(home, { recursive: true, force: true }); });
  return { home, catalog, project, host, ref, caller, client, bound };
}
async function material(f: Awaited<ReturnType<typeof fixture>>) {
  return f.host.withProject(f.ref, runtime => {
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, runtime.project_id).register({ kind: "research_library", repository: "fixture/research", research_source: "material" }).source;
    const item = feed.ingestItem({ source, externalId: "material-1", title: "Original", summary: "Original material boundary", occurredAt: new Date().toISOString(), attention: false }).item;
    const entry = feed.ensureInboxEntryForFeedItem(runtime.project_id, item.item_id, "manual").entry;
    return { item, entry };
  });
}

test("Inbox derives model readiness from Pages while its generation history remains readable without a model", async t => {
  const f = await fixture(t, null);
  const directory = await f.bound.discover();
  const pages = directory.find(view => view.capability_id === pagesActions.generate.capability_id)!.availability;
  const inbox = directory.find(view => view.capability_id === inboxActions.generatePages.capability_id)!.availability;
  assert.equal(pages.available, false); assert.deepEqual(inbox, pages);
  assert.equal(directory.find(view => view.capability_id === inboxActions.pagesResults.capability_id)!.availability.available, true);
  assert.deepEqual(await f.bound.invoke(inboxActions.pagesResults, {}), { results: [] });
  await assert.rejects(f.bound.invoke(inboxActions.generatePages, { request_id: "no-model-request", entry_ids: ["unused"], title: "Draft", instructions: "Unused" }), { code: "actions.connection_required" });
});

// W5-01-PAGES-08 (RUNTIME-MIGRATION 5.3 item 3, 6 item 8): Inbox pins Pages by its plugin id (`provider_id` in its consumes list and in
// its authority check); with Pages on the Runtime the provider keeps that id, so inbox.pages.generate still works end to end.
test("W5-01-PAGES-08 Inbox generates via Pages (a Runtime provider under the same plugin id) with canonical project identity, shared snapshots and replay preserving edits", async t => {
  let calls = 0;
  const f = await fixture(t, async prompt => { calls++; assert.match(prompt, /Original material boundary/); return "Generated from real material [材料 1]"; }, true);
  const { item, entry } = await material(f);
  const input = { request_id: "inbox-request-1", entry_ids: [entry.entry_id], title: "Research", instructions: "Keep boundaries" };
  await assert.rejects(f.client.invoke({ ...f.caller, allowed_capability_ids: [inboxActions.generatePages.capability_id] }, inboxActions.generatePages, input), { code: "actions.forbidden" });
  assert.equal(calls, 0);
  const provider = (await f.bound.discover()).find(view => view.capability_id === pagesActions.generate.capability_id)!.provider;
  assert.equal(provider.provider_id, "io.molis.work.pages");
  assert.ok(provider.plugin_install_id, "Pages is served by a Plugin Runtime installation, not a Host-registered provider");
  const result = await f.bound.invoke(inboxActions.generatePages, input);
  assert.equal(result.document.project_id, f.project.project_id);
  assert.match(JSON.stringify(result.document.body), new RegExp(`/projects/${f.project.project_id}/`));
  assert.equal((await f.bound.invoke(pagesActions.list, {})).documents[0]!.id, result.document.id);
  const record = (await f.bound.invoke(pagesActions.generation, { request_id: input.request_id })).record!;
  assert.equal(record.status, "completed"); assert.equal(record.inputs[0]!.item_id, item.item_id);
  assert.equal(record.inputs[0]!.revision, item.revision);
  await f.bound.invoke(pagesActions.update, { id: result.document.id, title: "Manual edit" });
  await f.host.closeProject(f.ref);
  const replay = await f.bound.invoke(inboxActions.generatePages, input);
  assert.equal(replay.replayed, true); assert.equal(replay.document.title, "Manual edit"); assert.equal(calls, 1);
  await assert.rejects(f.bound.invoke(inboxActions.generatePages, { ...input, instructions: "Different" }), /已改变/);
  assert.deepEqual((await f.bound.invoke(inboxActions.pagesResults, {})).results[0]!.entry_ids, [entry.entry_id]);
  assert.equal((await f.bound.invoke(inboxActions.list, {})).entries.find(row => row.entry_id === entry.entry_id)!.status, "open");
});
