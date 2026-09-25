import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { pagesActions, PAGES_ACTION_PERMISSIONS, openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { registerPagesArtifactVersion } from "../apps/local-host/src/pages-artifact.js";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function fixture(t: any) {
  const home = await mkdtemp(join(tmpdir(), "pages-publication-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "p", boardId: "p" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "p", audience: "user", permissions: PAGES_ACTION_PERMISSIONS };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: "p", title: "Publication", actor_id: "owner", idempotency_key: "init" }));
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  return { home, host, ref, caller, client, bound };
}

for (const failure of ["before-artifact", "after-artifact", "after-association"] as const) {
  test(`publication ${failure} preserves its snapshot across edits and restart, then links exactly one original version`, async t => {
    const f = await fixture(t);
    const original = (await f.bound.invoke(pagesActions.create, { title: "Original title", body: body("Original approved body"), goal_id: "original-goal" })).document;
    const db = openHomeSqliteDatabase(f.home, "pages");
    t.after(() => db.close());
    if (failure === "after-artifact") db.exec("CREATE TRIGGER fail_publication BEFORE UPDATE OF artifact_version ON pages WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture page write interrupted'); END");
    else if (failure === "after-association") db.exec("CREATE TRIGGER fail_publication BEFORE UPDATE OF publication_pending_json ON pages WHEN NEW.publication_pending_json IS NULL AND OLD.publication_pending_json IS NOT NULL BEGIN SELECT RAISE(ABORT, 'fixture snapshot clear interrupted'); END");
    else await f.host.withProject(f.ref, runtime => runtime.store.db.exec("CREATE TRIGGER fail_publication BEFORE INSERT ON artifact_versions BEGIN SELECT RAISE(ABORT, 'fixture artifact write interrupted'); END"));
    await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id, expected_version: original.version }), /fixture .* interrupted/);
    const failed = (await f.bound.invoke(pagesActions.get, { id: original.id })).document;
    assert.equal(failed.artifact_version, 0); assert.equal(failed.publication_pending!.version, 1);
    assert.equal(failed.publication_pending!.source_version, original.version);
    const versions = () => f.host.withProject(f.ref, runtime => runtime.coordinator.artifacts.query.listArtifactVersions("p", "pages-" + original.id));
    assert.equal((await versions()).length, failure === "before-artifact" ? 0 : 1);
    await assert.rejects(f.client.invoke({ ...f.caller, actor_id: "different-owner" }, pagesActions.promote, { id: original.id }), { code: "pages.publication_owner" });
    await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id, goal_id: "other-goal" }), { code: "pages.publication_pending" });
    const edited = (await f.bound.invoke(pagesActions.update, { id: original.id, title: "New draft title", body: body("Later draft edits"), goal_id: "later-goal" })).document;
    if (failure !== "before-artifact") db.exec("DROP TRIGGER fail_publication");
    else await f.host.withProject(f.ref, runtime => runtime.store.db.exec("DROP TRIGGER fail_publication"));
    await f.host.closeProject(f.ref);
    const result = await f.bound.invoke(pagesActions.promote, { id: original.id, goal_id: "original-goal", expected_version: edited.version });
    assert.equal(result.recovered, true); assert.equal(result.document.artifact_version, 1); assert.equal(result.document.publication_pending, undefined);
    assert.equal(result.document.title, "New draft title"); assert.deepEqual(result.document.body, body("Later draft edits")); assert.equal(result.document.goal_id, "later-goal");
    const saved = (await versions())[0]!;
    assert.deepEqual(saved.payload, { title: "Original title", page_id: original.id, goal_id: "original-goal", body: body("Original approved body") });
    assert.equal((await versions()).length, 1);
    await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id, expected_version: edited.version }), { code: "pages.conflict" });
    assert.equal((await versions()).length, 1, "an old expected_version must not create a duplicate version");
    const next = await f.bound.invoke(pagesActions.promote, { id: original.id, expected_version: result.document.version });
    assert.equal(next.artifact.version, 2); assert.equal(next.recovered, false);
    assert.deepEqual((await versions()).find(row => row.version === 2)!.payload, { title: "New draft title", page_id: original.id, goal_id: "later-goal", body: body("Later draft edits") });
  });
}

test("old interrupted publication without a snapshot recovers the original owned Artifact and preserves newer draft edits", async t => {
  const f = await fixture(t);
  const original = (await f.bound.invoke(pagesActions.create, { title: "Before migration", body: body("Already published"), goal_id: "old-goal" })).document;
  await f.host.withProject(f.ref, runtime => registerPagesArtifactVersion(runtime.coordinator, "p", "p", "owner")({ project_id: "p", page_id: original.id,
    title: original.title, body: original.body, goal_id: "old-goal", version: 1 }));
  const edited = (await f.bound.invoke(pagesActions.update, { id: original.id, body: body("New unpublished work"), goal_id: "new-goal" })).document;
  assert.equal(edited.publication_pending, undefined);
  await assert.rejects(f.client.invoke({ ...f.caller, actor_id: "another-actor" }, pagesActions.promote, { id: original.id }), { code: "pages.publication_owner" });
  assert.equal((await f.bound.invoke(pagesActions.get, { id: original.id })).document.publication_pending, undefined, "a denied actor cannot replace the owner's pending intent");
  const result = await f.bound.invoke(pagesActions.promote, { id: original.id, expected_version: edited.version });
  assert.equal(result.recovered, true); assert.equal(result.artifact.version, 1); assert.equal(result.document.goal_id, "new-goal");
  assert.deepEqual(result.document.body, body("New unpublished work"));
  await f.host.withProject(f.ref, runtime => {
    const versions = runtime.coordinator.artifacts.query.listArtifactVersions("p", result.artifact.artifact_id);
    assert.equal(versions.length, 1); assert.equal(versions[0]!.created_by, "owner");
    assert.deepEqual((versions[0]!.payload as any).body, body("Already published"));
  });
});

test("project partition migration rewrites the editable document link while retaining the already published snapshot exactly", async t => {
  const f = await fixture(t);
  const store = openPagesStore(f.home);
  try {
    const originalBody = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Source", marks: [{ type: "link", attrs: { href: "/projects/legacy-scope/?inbox_entry=entry-1" } }] }] }] };
    const original = store.create({ project_id: "legacy-scope", title: "Old publication", body: originalBody });
    store.beginPublication(original.id, "legacy-scope", "owner");
    await f.host.withProject(f.ref, runtime => registerPagesArtifactVersion(runtime.coordinator, "p", "legacy-scope", "owner")({ project_id: "legacy-scope", page_id: original.id,
      title: original.title, body: original.body, goal_id: "", version: 1 }));
    store.migrateProjectScope("legacy-scope", "p");
    const migrated = store.get(original.id, "p");
    assert.match(JSON.stringify(migrated.body), /\/projects\/p\//);
    assert.equal(migrated.publication_pending!.source_version, original.version);
    const result = await f.bound.invoke(pagesActions.promote, { id: original.id, expected_version: migrated.version });
    assert.equal(result.recovered, true); assert.equal(result.artifact.version, 1); assert.equal(result.document.publication_pending, undefined);
    await f.host.withProject(f.ref, runtime => {
      const published = runtime.coordinator.artifacts.query.listArtifactVersions("p", result.artifact.artifact_id);
      assert.equal(published.length, 1); assert.deepEqual((published[0]!.payload as any).body, originalBody);
    });
  } finally { store.close(); }
});

test("a conflicting immutable Artifact cannot replace the retained publication snapshot or attach itself to the draft", async t => {
  const f = await fixture(t);
  const original = (await f.bound.invoke(pagesActions.create, { title: "Approved", body: body("Approved snapshot") })).document;
  const store = openPagesStore(f.home);
  try { store.beginPublication(original.id, "p", "owner"); } finally { store.close(); }
  await f.host.withProject(f.ref, runtime => registerPagesArtifactVersion(runtime.coordinator, "p", "p", "owner")({ project_id: "p", page_id: original.id,
    title: "Conflicting", body: body("Different content"), goal_id: "", version: 1 }));
  await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id }), { code: "pages.publication_conflict" });
  const page = (await f.bound.invoke(pagesActions.get, { id: original.id })).document;
  assert.equal(page.artifact_version, 0); assert.equal(page.publication_pending!.version, 1); assert.deepEqual(page.body, original.body);
});
