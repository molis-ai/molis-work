import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { pagesActions, pagesManifest, PAGES_SUBJECT_KIND } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import type { ProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { servePages } from "./fixtures/pages-runtime.js";
import { PAGES_ARTIFACT_TYPE_ID, PAGES_ARTIFACT_SCHEMA_VERSION, type PagesRecord } from "@molis-ai/molis-work-plugin-pages/contract";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
/** Pages as the Home Runtime runs it in one project (W5-01-PAGES-04): the publication is the plugin's, the 成果库 the project's. */
async function fixture(t: any) {
  const f = await servePages(t), caller = { ...f.caller, actor_id: "owner" };
  return { home: f.home, host: f.host, ref: f.project.reference, projectId: f.project.project_id, caller, client: f.client, bound: bindActionClient(f.client, () => caller) };
}

for (const failure of ["before-artifact", "after-artifact", "after-association"] as const) {
  test(`publication ${failure} preserves its snapshot across edits and restart, then links exactly one original version`, async t => {
    const f = await fixture(t);
    const original = (await f.bound.invoke(pagesActions.create, { title: "Original title", body: body("Original approved body"), goal_id: "original-goal" })).document;
    const db = openHomeSqliteDatabase(f.home, "pages");
    t.after(() => db.close());
    if (failure === "after-artifact") db.exec("CREATE TRIGGER fail_publication BEFORE UPDATE OF artifact_version ON pages WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture page write interrupted'); END");
    else if (failure === "after-association") db.exec("CREATE TRIGGER fail_publication BEFORE UPDATE OF publication_pending_json ON pages WHEN NEW.publication_pending_json IS NULL AND OLD.publication_pending_json IS NOT NULL BEGIN SELECT RAISE(ABORT, 'fixture snapshot clear interrupted'); END");
    else await f.host.withProject(f.ref, runtime => runtime.store.db.exec("CREATE TRIGGER fail_publication BEFORE INSERT ON library_artifact_versions BEGIN SELECT RAISE(ABORT, 'fixture artifact write interrupted'); END"));
    await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id, expected_version: original.version }), /fixture .* interrupted/);
    const failed = (await f.bound.invoke(pagesActions.get, { id: original.id })).document;
    assert.equal(failed.artifact_version, 0); assert.equal(failed.publication_pending!.version, 1);
    assert.equal(failed.publication_pending!.source_version, original.version);
    const versions = () => f.host.withProject(f.ref, runtime => runtime.artifacts.query.listArtifactVersions(f.projectId, "pages-" + original.id));
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

function seedUntrackedHead(artifacts: ProjectVersionStores["artifacts"], projectId: string, document: Pick<PagesRecord, "id" | "title" | "body">): void {
  artifacts.commands.registerVersion({
    project_id: projectId, actor_id: "owner", owner_actor_id: LOCAL_PERSON_ACTOR_ID,
    artifact_id: "pages-" + document.id, version: 1,
    artifact_type_id: PAGES_ARTIFACT_TYPE_ID, schema_version: PAGES_ARTIFACT_SCHEMA_VERSION,
    producer: { plugin_id: pagesManifest.plugin_id, plugin_version: pagesManifest.version, binding_signature: pagesManifest.publisher.signature },
    content: { kind: "inline", payload: { title: document.title, page_id: document.id, goal_id: "old-goal", body: document.body } },
    origin: { kind: "pinned", subject: { kind: PAGES_SUBJECT_KIND, id: document.id }, revision: "opaque-revision" },
    metadata: { page_id: document.id, goal_id: "old-goal", title: document.title }, title: document.title,
    media_type: "application/json", scope: "personal", supersedes_version: null,
  });
}

test("W1-18-PIN-CURRENT-01: an untracked Artifact head without a snapshot advances without overwriting the original version or the current draft", async t => {
  const f = await fixture(t);
  const original = (await f.bound.invoke(pagesActions.create, { title: "Existing pin", body: body("Already published"), goal_id: "old-goal" })).document;
  // No numeric source revision: the actual line-head adapter reports null, but there is no durable pending intent.
  await f.host.withProject(f.ref, runtime => seedUntrackedHead(runtime.artifacts, f.projectId, original));
  const edited = (await f.bound.invoke(pagesActions.update, { id: original.id, body: body("New unpublished work"), goal_id: "new-goal" })).document;
  assert.equal(edited.publication_pending, undefined);
  const result = await f.bound.invoke(pagesActions.promote, { id: original.id, expected_version: edited.version });
  assert.equal(result.recovered, false); assert.equal(result.artifact.version, 2); assert.equal(result.document.goal_id, "new-goal");
  assert.equal(result.document.publication_pending, undefined);
  assert.deepEqual(result.document.body, body("New unpublished work"));
  await f.host.withProject(f.ref, runtime => {
    const versions = runtime.artifacts.query.listArtifactVersions(f.projectId, result.artifact.artifact_id);
    assert.equal(versions.length, 2);
    const first = versions.find(version => version.version === 1)!, next = versions.find(version => version.version === 2)!;
    assert.equal(first.created_by, "owner"); assert.equal(first.owner_actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.deepEqual(first.payload, { title: original.title, page_id: original.id, goal_id: "old-goal", body: body("Already published") });
    assert.equal(next.created_by, "owner"); assert.equal(next.owner_actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.deepEqual(next.payload, { title: original.title, page_id: original.id, goal_id: "new-goal", body: body("New unpublished work") });
  });
});

test("W1-18-PIN-CURRENT-01: another actor explicitly pins the next version when no publication snapshot is pending", async t => {
  const f = await fixture(t);
  const original = (await f.bound.invoke(pagesActions.create, { title: "Existing pin", body: body("Already published"), goal_id: "old-goal" })).document;
  await f.host.withProject(f.ref, runtime => seedUntrackedHead(runtime.artifacts, f.projectId, original));
  const result = await f.client.invoke({ ...f.caller, actor_id: "another-actor" }, pagesActions.promote, { id: original.id });
  assert.equal(result.recovered, false); assert.equal(result.artifact.version, 2);
  assert.equal(result.document.publication_pending, undefined);
  await f.host.withProject(f.ref, runtime => {
    const versions = runtime.artifacts.query.listArtifactVersions(f.projectId, result.artifact.artifact_id);
    assert.equal(versions.length, 2);
    const first = versions.find(version => version.version === 1)!, next = versions.find(version => version.version === 2)!;
    assert.equal(first.created_by, "owner", "the original producer stays recorded");
    assert.equal(next.created_by, "another-actor", "the explicit new pin records its own producer");
    for (const version of versions) {
      assert.equal(version.owner_actor_id, LOCAL_PERSON_ACTOR_ID, "both pinned versions belong to the person");
      assert.deepEqual(version.payload, { title: original.title, page_id: original.id, goal_id: "old-goal", body: body("Already published") });
    }
  });
});

test("a conflicting immutable Artifact cannot replace the retained publication snapshot or attach itself to the draft", async t => {
  const f = await fixture(t);
  const original = (await f.bound.invoke(pagesActions.create, { title: "Approved", body: body("Approved snapshot") })).document;
  const store = openPagesStore(f.home);
  try { store.beginPublication(original.id, f.projectId, "owner"); } finally { store.close(); }
  // The version the intent will write already exists with other content: the retained snapshot is not replaced and the draft is not attached to it.
  await f.host.withProject(f.ref, runtime => runtime.artifacts.commands.registerVersion({
    project_id: f.projectId, actor_id: "owner", owner_actor_id: LOCAL_PERSON_ACTOR_ID, artifact_id: "pages-" + original.id, version: 1,
    artifact_type_id: PAGES_ARTIFACT_TYPE_ID, schema_version: PAGES_ARTIFACT_SCHEMA_VERSION,
    producer: { plugin_id: pagesManifest.plugin_id, plugin_version: pagesManifest.version, binding_signature: pagesManifest.publisher.signature },
    content: { kind: "inline", payload: { title: "Conflicting", page_id: original.id, goal_id: "", body: body("Different content") } },
    metadata: { page_id: original.id, goal_id: "", title: "Conflicting" },
    origin: { kind: "pinned", subject: { kind: PAGES_SUBJECT_KIND, id: original.id }, revision: String(original.version) },
    title: "Conflicting", media_type: "application/json", scope: "personal", supersedes_version: null }));
  await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id }), { code: "pages.publication_conflict" });
  const page = (await f.bound.invoke(pagesActions.get, { id: original.id })).document;
  assert.equal(page.artifact_version, 0); assert.equal(page.publication_pending!.version, 1); assert.deepEqual(page.body, original.body);
});
