import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { pagesActions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { inboxActions, INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { createLocalFeedApplication } from "../apps/local-host/src/feed-application.js";
import { createLocalFeedSourceService } from "../apps/local-host/src/feed-source-service.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function fixture(t: any, completeText: HostCompleteText | null = async () => "Generated from real material [材料 1]") {
  const home = await mkdtemp(join(tmpdir(), "pages-cross-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "Pages", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user", permissions: [...PAGES_ACTION_PERMISSIONS, ...INBOX_ACTION_PERMISSIONS] };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  await host.withProject(ref, () => undefined);
  t.after(async () => { await host.close(); catalog.close(); await rm(home, { recursive: true, force: true }); });
  return { home, catalog, project, host, ref, caller, client, bound };
}
async function material(f: Awaited<ReturnType<typeof fixture>>) {
  return f.host.withProject(f.ref, runtime => {
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, runtime.board_id).register({ kind: "research_library", repository: "fixture/research", research_source: "material" }).source;
    const item = feed.ingestItem({ source, externalId: "material-1", title: "Original", summary: "Original material boundary", occurredAt: new Date().toISOString(), attention: false }).item;
    const entry = feed.ensureInboxEntryForFeedItem(runtime.board_id, item.item_id, "manual").entry;
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

test("Inbox generates via Pages with canonical project identity, shared snapshots and replay preserving edits", async t => {
  let calls = 0;
  const f = await fixture(t, async prompt => { calls++; assert.match(prompt, /Original material boundary/); return "Generated from real material [材料 1]"; }, true);
  const { item, entry } = await material(f);
  const input = { request_id: "inbox-request-1", entry_ids: [entry.entry_id], title: "Research", instructions: "Keep boundaries" };
  await assert.rejects(f.client.invoke({ ...f.caller, allowed_capability_ids: [inboxActions.generatePages.capability_id] }, inboxActions.generatePages, input), { code: "actions.forbidden" });
  assert.equal(calls, 0);
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
