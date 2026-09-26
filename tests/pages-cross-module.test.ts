import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { pagesActions, PAGES_ACTION_PERMISSIONS, openPagesStore, generatePagesFromMaterials } from "@molis-ai/molis-work-plugin-pages";
import { inboxActions, INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesGenerationRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { createLocalFeedApplication } from "../apps/local-host/src/feed-application.js";
import { createLocalFeedSourceService } from "../apps/local-host/src/feed-source-service.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function fixture(t: any, completeText: HostCompleteText | null = async () => "Generated from real material [材料 1]", legacy = false) {
  const home = await mkdtemp(join(tmpdir(), "pages-cross-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "Pages", actor_id: "test" });
  if (legacy) {
    const db = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
    try { db.db.prepare("UPDATE projects SET board_id = ? WHERE project_id = ?").run("legacy-board", created.project_id); } finally { db.close(); }
  }
  const project = catalog.getProject(created.project_id);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user", permissions: [...PAGES_ACTION_PERMISSIONS, ...INBOX_ACTION_PERMISSIONS] };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  await host.withProject(ref, runtime => {
    if (legacy) runtime.coordinator.initializeBoard({ board_id: project.board_id, title: "Legacy", actor_id: "test", idempotency_key: "legacy-init" });
  });
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

test("unique catalog mapping migrates old generated documents, folders, requests and local links without replacing edits", async t => {
  const f = await fixture(t, async () => { throw new Error("Replay must not invoke model"); }, true);
  const { item, entry } = await material(f);
  const intent = { request_id: "legacy-request-1", entry_ids: [entry.entry_id], title: "Legacy", instructions: "Keep boundaries" };
  const request_hash = createHash("sha256").update(JSON.stringify({ entryIds: intent.entry_ids, instructions: intent.instructions, title: intent.title })).digest("hex");
  const record: PagesGenerationRecord = { request_id: intent.request_id, project_id: "legacy-board", request_hash, title: intent.title, instructions: intent.instructions,
    status: "running", document_id: null, error: null, updated_at: new Date().toISOString(), inputs: [{ entry_id: entry.entry_id, item_id: item.item_id, revision: item.revision, title: item.title, body: "Snapshot", url: null, source_label: "Fixture", captured_at: "2026-09-25T00:00:00Z", provenance: [] }] };
  const store = openPagesStore(f.home);
  let id: string, importedId: string;
  try {
    const result = await generatePagesFromMaterials(run => run(store), record, async () => "Old generated body"); id = result.document.id;
    const folder = store.createFolder({ project_id: "legacy-board", title: "Old folder" });
    store.update(id, { title: "User edited title", folder_id: folder.id }, "legacy-board");
    importedId = store.importDocuments({ project_id: "legacy-board", request_id: "legacy-import", request_hash: "original", documents: [{ title: "Imported", body: body("Unchanged") }] })[0]!.id;
    const unrelated = store.create({ project_id: "foreign", title: "Private" });
    const listed = await f.bound.invoke(pagesActions.list, {});
    assert.deepEqual(new Set(listed.documents.map(row => row.id)), new Set([id, importedId]));
    assert.equal(listed.folders[0]!.id, folder.id);
    const replay = await f.bound.invoke(inboxActions.generatePages, intent);
    assert.equal(replay.document.id, id); assert.equal(replay.document.title, "User edited title"); assert.equal(replay.replayed, true);
    assert.match(JSON.stringify(replay.document.body), new RegExp(`/projects/${f.project.project_id}/`));
    assert.doesNotMatch(JSON.stringify(replay.document.body), /\/projects\/legacy-board\//);
    assert.deepEqual((await f.bound.invoke(pagesActions.generation, { request_id: intent.request_id })).record!.inputs, record.inputs);
    assert.equal(store.hasProjectData("legacy-board"), false);
    assert.equal(store.get(unrelated.id, "foreign").title, "Private");
    const imported = await f.bound.invoke(pagesActions.importDocuments, { request_id: "legacy-import", request_hash: "original", documents: [{ title: "Ignored replacement", body: body("Changed") }] });
    assert.equal(imported.documents[0]!.id, importedId); assert.equal(imported.documents[0]!.title, "Imported");
    await f.host.closeProject(f.ref);
    assert.equal((await f.bound.invoke(pagesActions.get, { id })).document.title, "User edited title");
  } finally { store.close(); }
});

for (const mode of ["ambiguous", "collision", "running"] as const) {
  test(`legacy ${mode} is unavailable in directory and execution, retaining original data`, async t => {
    const f = await fixture(t, async () => "Unused model", true);
    const store = openPagesStore(f.home);
    try {
      const original = store.create({ project_id: "legacy-board", title: "Do not lose" });
      if (mode === "ambiguous") {
        const other = await f.catalog.createProject({ display_name: "Other", actor_id: "test" });
        const db = new LocalSqliteStorage(join(f.home, "projects", "catalog.db"));
        try { db.db.prepare("UPDATE projects SET board_id = ? WHERE project_id = ?").run("legacy-board", other.project_id); } finally { db.close(); }
      } else if (mode === "collision") {
        for (const project_id of ["legacy-board", f.project.project_id]) store.importDocuments({ project_id, request_id: "same-request", request_hash: project_id, documents: [{ title: "Distinct", body: body(project_id) }] });
      } else store.beginGeneration({ request_id: "still-running", project_id: "legacy-board", request_hash: "same", status: "running", document_id: null, inputs: [], title: "In progress", instructions: "Wait", error: null, updated_at: new Date().toISOString() });
      const discovered = await f.client.discover(f.caller);
      const expected = mode === "ambiguous" ? "pages.legacy_scope_unresolved" : mode === "collision" ? "pages.legacy_conflict" : "pages.legacy_running";
      const availability = discovered.find(row => row.capability_id === pagesActions.list.capability_id)!.availability;
      assert.equal(availability.available, false); assert.equal((availability as any).code, expected);
      await assert.rejects(f.bound.invoke(pagesActions.list, {}), { code: expected });
      for (const action of [inboxActions.pagesResults, inboxActions.generatePages]) {
        const state = discovered.find(row => row.capability_id === action.capability_id)!.availability;
        assert.equal(state.available, false); assert.equal((state as any).code, expected);
      }
      await assert.rejects(f.bound.invoke(inboxActions.pagesResults, {}), { code: expected });
      await assert.rejects(f.bound.invoke(inboxActions.generatePages, { request_id: "blocked-request", entry_ids: ["unused"], title: "Blocked", instructions: "Unused" }), { code: expected });
      assert.deepEqual(store.get(original.id, "legacy-board"), original);
      assert.equal(store.list(f.project.project_id).some(row => row.id === original.id), false);
    } finally { store.close(); }
  });
}

for (const mode of ["failure", "cancel"] as const) {
  test(`generation ${mode} records failure, preserves material snapshot and resumes without duplicate documents`, async t => {
    let enter!: () => void, release!: () => void, failed = false;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const f = await fixture(t, async () => {
      if (!failed) { failed = true; if (mode === "failure") throw new Error("Fixture model failed"); enter(); await released; }
      return "Recovered body";
    });
    const { entry } = await material(f);
    const input = { request_id: "recovery-request", entry_ids: [entry.entry_id], title: "Recovery", instructions: "Preserve" };
    const controller = new AbortController();
    const pending = f.client.invoke({ ...f.caller, signal: controller.signal }, inboxActions.generatePages, input);
    const rejection = assert.rejects(pending, mode === "cancel" ? { name: "AbortError" } : /Fixture model failed/);
    if (mode === "cancel") { await entered; controller.abort(); release(); }
    await rejection;
    const record = (await f.bound.invoke(pagesActions.generation, { request_id: input.request_id })).record!;
    assert.equal(record.status, "failed"); assert.equal((await f.bound.invoke(pagesActions.list, {})).documents.length, 0);
    const result = await f.bound.invoke(inboxActions.generatePages, input);
    assert.equal(result.replayed, false);
    const replay = await f.bound.invoke(inboxActions.generatePages, input);
    assert.equal(replay.document.id, result.document.id); assert.equal(replay.replayed, true);
    assert.deepEqual((await f.bound.invoke(pagesActions.generation, { request_id: input.request_id })).record!.inputs, record.inputs);
  });
}
