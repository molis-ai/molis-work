import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, nextPinnedVersion, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { PPT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/ppt";
import { pagesActions, PAGES_ACTION_PERMISSIONS, PAGES_SUBJECT_KIND } from "@molis-ai/molis-work-plugin-pages";
import { formActions, FORM_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-form";
import { datasetActions, DATASET_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-dataset";
import { pptActions, PPT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-ppt";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

// A document that was pinned in a project, moved away and moved back: its record starts counting fixed versions again
// (they stay with the old project), but the project's 成果库 still holds the earlier ones. The next pin must be a new
// version of what the document says now, never an old one handed back as "recovered".
const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
interface Kind {
  name: string;
  subject: string;
  prefix: string;
  permissions: readonly string[];
  // The plugin's own actions, loosely typed: the four plugins share this shape and differ in names and record keys.
  create: any; update: any; get: any; promote: any; move: any;
  record: string;
  seed: (title: string) => object;
  edit: (title: string) => object;
}
const kinds: Kind[] = [
  { name: "Pages", subject: PAGES_SUBJECT_KIND, prefix: "pages-", permissions: PAGES_ACTION_PERMISSIONS, record: "document", seed: title => ({ title, body: body("first") }),
    edit: title => ({ title, body: body(title) }), create: pagesActions.create, update: pagesActions.update, get: pagesActions.get, promote: pagesActions.promote, move: pagesActions.move },
  { name: "Form", subject: "form", prefix: "form-", permissions: FORM_ACTION_PERMISSIONS, record: "form", seed: title => ({ title }),
    edit: title => ({ title }), create: formActions.create, update: formActions.update, get: formActions.get, promote: formActions.promote, move: formActions.move },
  { name: "Dataset", subject: "dataset", prefix: "dataset-", permissions: DATASET_ACTION_PERMISSIONS, record: "dataset", seed: title => ({ title }),
    edit: title => ({ title }), create: datasetActions.create, update: datasetActions.update, get: datasetActions.get, promote: datasetActions.promote, move: datasetActions.move },
  { name: "PPT", subject: PPT_SUBJECT_KIND, prefix: "ppt-", permissions: PPT_ACTION_PERMISSIONS, record: "presentation", seed: title => ({ title }),
    edit: title => ({ title }), create: pptActions.create, update: pptActions.update, get: pptActions.get, promote: pptActions.promote, move: pptActions.move },
];

async function fixture(t: test.TestContext, permissions: readonly string[]) {
  const home = await mkdtemp(join(tmpdir(), "document-pin-move-"));
  process.env.MOLIS_WORK_HOME = home;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const refA = molisWorkHostProjectReference({ databasePath: join(home, "a.sqlite"), projectId: "pa" });
  const refB = molisWorkHostProjectReference({ databasePath: join(home, "b.sqlite"), projectId: "pb" });
  const callerA: ActionCallContext = { actor_id: "owner", project_id: "pa", audience: "user", permissions: [...permissions] };
  const callerB: ActionCallContext = { ...callerA, project_id: "pb" };
  await host.withProject(refA, runtime => runtime.coordinator.initializeBoard({ project_id: "pa", title: "A", actor_id: "owner", idempotency_key: "a" }));
  await host.withProject(refB, runtime => runtime.coordinator.initializeBoard({ project_id: "pb", title: "B", actor_id: "owner", idempotency_key: "b" }));
  const a = bindActionClient(host.actionClient(refA), () => callerA), b = bindActionClient(host.actionClient(refB), () => callerB);
  const versions = (ref: typeof refA, project: string, artifactId: string) => host.withProject(ref, runtime => runtime.coordinator.artifacts.query.listArtifactVersions(project, artifactId));
  return { host, refA, refB, a, b, versions };
}

for (const kind of kinds) {
  test(`${kind.name}: pinning after the document went to another project and came back pins what it says now`, async t => {
    const f = await fixture(t, kind.permissions);
    const created = (await f.a.invoke(kind.create, kind.seed("First"))) as Record<string, any>;
    const id = created[kind.record].id as string, artifactId = kind.prefix + id;
    const first = await f.a.invoke(kind.promote, { id }) as any;
    assert.deepEqual([first.artifact.version, first.recovered], [1, false]);

    await f.a.invoke(kind.move, { subject: { kind: kind.subject, id }, to_project_id: "pb" });
    await f.b.invoke(kind.move, { subject: { kind: kind.subject, id }, to_project_id: "pa" });
    const back = ((await f.a.invoke(kind.get, { id })) as Record<string, any>)[kind.record];
    assert.equal(back.artifact_version, 0, "the record does not claim a fixed version the move let go of");
    const edited = ((await f.a.invoke(kind.update, { id, ...kind.edit("Second"), expected_version: back.version })) as Record<string, any>)[kind.record];

    const second = await f.a.invoke(kind.promote, { id, expected_version: edited.version }) as any;
    assert.equal(second.recovered, false, "an earlier fixed version is not an interrupted pin");
    assert.equal(second.artifact.version, 2, "numbering continues after what the 成果库 already holds");
    assert.equal(second[kind.record].artifact_version, 2);
    const saved = await f.versions(f.refA, "pa", artifactId);
    assert.deepEqual(saved.map(version => version.version), [1, 2]);
    assert.equal(saved[0]!.title, "First", "the first fixed version stays as it was");
    assert.equal(saved[1]!.title, "Second", "the new version is the document as it is now");
    assert.equal(saved[1]!.supersedes_version, 1);

    // The next pin goes on from there.
    const third = await f.a.invoke(kind.promote, { id }) as any;
    assert.deepEqual([third.artifact.version, third.recovered], [3, false]);
  });

  test(`${kind.name}: each project's fixed versions are numbered by what that project already holds`, async t => {
    const f = await fixture(t, kind.permissions);
    const id = ((await f.a.invoke(kind.create, kind.seed("In A"))) as Record<string, any>)[kind.record].id as string;
    await f.a.invoke(kind.promote, { id });
    await f.a.invoke(kind.move, { subject: { kind: kind.subject, id }, to_project_id: "pb" });
    // B has no version of it yet: its line starts at 1, and the one in A stays in A.
    const inB = await f.b.invoke(kind.promote, { id }) as any;
    assert.deepEqual([inB.artifact.version, inB.recovered], [1, false]);
    await f.b.invoke(kind.move, { subject: { kind: kind.subject, id }, to_project_id: "pa" });
    await f.a.invoke(kind.move, { subject: { kind: kind.subject, id }, to_project_id: "pb" });
    // Back in B, where its version 1 already is.
    const again = await f.b.invoke(kind.promote, { id }) as any;
    assert.deepEqual([again.artifact.version, again.recovered], [2, false]);
    assert.deepEqual((await f.versions(f.refA, "pa", kind.prefix + id)).map(version => version.version), [1]);
    assert.deepEqual((await f.versions(f.refB, "pb", kind.prefix + id)).map(version => version.version), [1, 2]);
  });
}

test("the next fixed version: after the record's own count, finishing a pending one, recovering an unrecorded older write, or going on after what was written", () => {
  const head = (version: number, source_revision: number | null) => ({ version, source_revision });
  assert.equal(nextPinnedVersion({ recorded: 0, pending: null, head: null }), 1, "first pin");
  assert.equal(nextPinnedVersion({ recorded: 3, pending: null, head: head(3, 7) }), 4, "everything in the 成果库 is recorded");
  assert.equal(nextPinnedVersion({ recorded: 2, pending: 3, head: head(3, 7) }), 3, "a pending pin keeps its number");
  assert.equal(nextPinnedVersion({ recorded: 0, pending: null, head: head(1, null) }), 1, "one write without a source revision that the record never saw is an interrupted pin from before snapshots");
  assert.equal(nextPinnedVersion({ recorded: 0, pending: null, head: head(1, 4) }), 2, "a write that names its source revision was recorded once: the record was moved or restored");
  assert.equal(nextPinnedVersion({ recorded: 0, pending: null, head: head(3, 4) }), 4, "several unrecorded versions are never one interrupted pin");
  assert.equal(nextPinnedVersion({ recorded: 1, pending: null, head: head(5, null) }), 6);
});
