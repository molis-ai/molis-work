import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions, pagesManifest, PAGES_SUBJECT_KIND } from "@molis-ai/molis-work-plugin-pages";
import type { ProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { PAGES_ARTIFACT_TYPE_ID, PAGES_ARTIFACT_SCHEMA_VERSION, type PagesRecord } from "@molis-ai/molis-work-plugin-pages/contract";

import { openTestHome } from "./fixtures/test-home.js";
import { openPartitionLibraryDatabase } from "./fixtures/plugin-home-stores.js";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
/** Pages as the Home Runtime runs it in one project (W5-01-PAGES-04): the publication is the plugin's, the 成果库 the project's. */
async function fixture(t: TestContext) {
  const f = await openTestHome(t), project = await f.createProject("Pages publication", ["pages"]);
  const ref = project.reference, caller = { ...await f.host.localPersonContext(ref), actor_id: "owner" }, client = f.host.actionClient(ref);
  return { home: f.home, host: f.host, createProject: f.createProject, origin: f.origin, ref, projectId: project.project_id, caller, client, bound: bindActionClient(client, () => caller) };
}

for (const failure of ["artifact write", "root update"] as const) {
  test(`BSH-03 Pages ${failure} failure leaves neither owner changed and a fresh pin includes later edits`, async t => {
    const f = await fixture(t);
    const original = (await f.bound.invoke(pagesActions.create, { title: "Original title", body: body("Original approved body"), goal_id: "original-goal" })).document;
    const alterLibrary = (sql: string) => {
      const db = openPartitionLibraryDatabase(f.home, f.projectId, "pages");
      try { db.exec(sql); } finally { db.close(); }
    };
    const alterProject = (sql: string) => f.host.withProject(f.ref, ({ store }) => store.db.exec(sql));
    if (failure === "root update") {
      const sentinel = (await f.bound.invoke(pagesActions.create, { title: "Published constraint fixture" })).document;
      await f.bound.invoke(pagesActions.promote, { id: sentinel.id, expected_version: sentinel.version });
      alterLibrary("CREATE UNIQUE INDEX fail_publication ON pages ((1)) WHERE artifact_version > 0");
    } else await alterProject("CREATE TRIGGER fail_publication BEFORE INSERT ON library_artifact_versions BEGIN SELECT RAISE(ABORT, 'fixture artifact write interrupted'); END");
    await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id, goal_id: "refused-goal", expected_version: original.version }),
      failure === "artifact write" ? /fixture artifact write interrupted/u : /UNIQUE constraint failed/u);
    const failed = (await f.bound.invoke(pagesActions.get, { id: original.id })).document;
    assert.deepEqual(failed, original);
    const versions = () => f.host.withProject(f.ref, runtime => runtime.artifacts.query.listArtifactVersions(f.projectId, "pages-" + original.id));
    assert.deepEqual(await versions(), []);
    if (failure === "root update") alterLibrary("DROP INDEX fail_publication");
    else await alterProject("DROP TRIGGER fail_publication");
    const edited = (await f.bound.invoke(pagesActions.update, { id: original.id, title: "New draft title", body: body("Later draft edits"), goal_id: "later-goal" })).document;
    await f.host.closeProject(f.ref);
    const fresh = { ...await f.host.localPersonContext(f.ref), actor_id: f.caller.actor_id };
    const reopened = bindActionClient(f.client, () => fresh);
    const result = await reopened.invoke(pagesActions.promote, { id: original.id, expected_version: edited.version });
    assert.equal(result.recovered, false);
    assert.equal(result.document.artifact_version, 1);
    assert.equal(result.document.publication_pending, undefined);
    assert.equal(result.document.title, "New draft title");
    assert.deepEqual(result.document.body, body("Later draft edits"));
    assert.equal(result.document.goal_id, "later-goal");
    assert.deepEqual((await versions())[0]?.payload, { title: "New draft title", page_id: original.id, goal_id: "later-goal", body: body("Later draft edits") });
    await assert.rejects(reopened.invoke(pagesActions.promote, { id: original.id, expected_version: edited.version }), { code: "pages.conflict" });
    assert.equal((await versions()).length, 1);
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

test("BSH-01 a prior immutable Artifact for a different document cannot start a new pin on this line", async t => {
  const f = await fixture(t);
  const original = (await f.bound.invoke(pagesActions.create, { title: "Approved", body: body("Approved snapshot") })).document;
  await f.host.withProject(f.ref, runtime => runtime.artifacts.commands.registerVersion({
    project_id: f.projectId, actor_id: "owner", owner_actor_id: LOCAL_PERSON_ACTOR_ID, artifact_id: "pages-" + original.id, version: 1,
    artifact_type_id: PAGES_ARTIFACT_TYPE_ID, schema_version: PAGES_ARTIFACT_SCHEMA_VERSION,
    producer: { plugin_id: pagesManifest.plugin_id, plugin_version: pagesManifest.version, binding_signature: pagesManifest.publisher.signature },
    content: { kind: "inline", payload: { title: "Conflicting", page_id: original.id, goal_id: "", body: body("Different content") } },
    metadata: { page_id: original.id, goal_id: "", title: "Conflicting" },
    origin: { kind: "pinned", subject: { kind: PAGES_SUBJECT_KIND, id: "another-document" }, revision: String(original.version) },
    title: "Conflicting", media_type: "application/json", scope: "personal", supersedes_version: null }));
  await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id }), { code: "pages.publication_conflict" });
  const page = (await f.bound.invoke(pagesActions.get, { id: original.id })).document;
  assert.equal(page.artifact_version, 0); assert.equal(page.publication_pending, undefined); assert.deepEqual(page.body, original.body);
});

test("AC-T3-01 AC-T3-02 AC-T3-03 AC-T3-04: Pages compares exact fixed versions in either direction through the action and protected route", async t => {
  const f = await fixture(t);
  const id = (await f.bound.invoke(pagesActions.create, { title: "Original title",
    markdown: "Original A\n\n# Keep this heading\n\nRemoved B\n\nKeep this paragraph" })).document.id;
  const pin = () => f.bound.invoke(pagesActions.promote, { id });
  const compare = (before: number, after: number) => f.bound.invoke(pagesActions.artifactDiff, { id, before_version: before, after_version: after });
  await pin();
  await f.bound.invoke(pagesActions.update, { id, markdown: "Edited A\n\n# Keep this heading\n\nKeep this paragraph\n\nNew C" });
  await pin();
  await f.bound.invoke(pagesActions.update, { id, title: "Revised title" });
  await pin();
  await f.bound.invoke(pagesActions.update, { id, title: "Unpublished draft", markdown: "Unpublished edits" });

  const diff = await compare(1, 2);
  assert.equal(diff.identical, false);
  assert.equal(diff.title_changed, false);
  assert.deepEqual(diff.summary, { equal: 2, modified: 1, added: 1, removed: 1 });
  assert.deepEqual(diff.paragraphs.map(entry => [entry.kind, entry.before_index, entry.after_index, entry.before_text, entry.after_text]), [
    ["modified", 1, 1, "Original A", "Edited A"],
    ["equal", 2, 2, "# Keep this heading", "# Keep this heading"],
    ["removed", 3, null, "Removed B", null],
    ["equal", 4, 3, "Keep this paragraph", "Keep this paragraph"],
    ["added", null, 4, null, "New C"],
  ]);
  const reverse = await compare(3, 2);
  assert.equal(reverse.identical, false);
  assert.equal(reverse.title_changed, true);
  assert.deepEqual([reverse.before_title, reverse.after_title], ["Revised title", "Original title"]);
  assert.deepEqual(reverse.summary, { equal: 4, modified: 0, added: 0, removed: 0 });

  await assert.rejects(compare(2, 2), { code: "pages.invalid" });
  await assert.rejects(compare(2, 99), { code: "pages.not_found" });
  const other = await f.createProject("Outside the document's project", ["pages"]);
  const caller = await f.host.localPersonContext(other.reference);
  await assert.rejects(f.host.actionClient(other.reference).invoke(caller, pagesActions.artifactDiff,
    { id, before_version: 1, after_version: 2 }), { code: "pages.not_found" });

  const url = f.origin + "/projects/" + f.projectId + "/api/plugins/" + pagesManifest.plugin_id + "/pages/" + id + "/versions/diff";
  const response = await fetch(url + "?before=1&after=2");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), diff);
  const badVersion = await fetch(url + "?before=1.5&after=2");
  assert.equal(badVersion.status, 400);
  assert.equal((await badVersion.json()).code, "pages.invalid");
  const wrongProject = await fetch(url + "?before=1&after=2&project_id=" + other.project_id);
  assert.equal(wrongProject.status, 403);
  assert.equal((await wrongProject.json()).code, "actions.scope_mismatch");
});

test("AC-T3-01: a large version pair uses positional comparison, skips empty placeholders and keeps original block indexes", async t => {
  const f = await fixture(t);
  const makeBody = (edit: string) => ({ type: "doc" as const, content: [
    { type: "paragraph" },
    ...Array.from({ length: 449 }, (_, index) => body(index === 2 ? edit : `Paragraph ${index + 1}`).content[0]),
  ] });
  const id = (await f.bound.invoke(pagesActions.create, { title: "Long draft", body: makeBody("Original block") })).document.id;
  await f.bound.invoke(pagesActions.promote, { id });
  await f.bound.invoke(pagesActions.update, { id, body: makeBody("Revised block") });
  await f.bound.invoke(pagesActions.promote, { id });
  const diff = await f.bound.invoke(pagesActions.artifactDiff, { id, before_version: 1, after_version: 2 });
  assert.deepEqual(diff.summary, { equal: 448, modified: 1, added: 0, removed: 0 });
  assert.deepEqual(diff.paragraphs[2], { kind: "modified", before_index: 4, after_index: 4, block_kind: "paragraph", before_text: "Original block", after_text: "Revised block" });
});
