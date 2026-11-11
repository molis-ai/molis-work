import assert from "node:assert/strict";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, promises as fs, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";

// S-102: a project's storage directory is <projects directory>/<project_id>; a project id is one plain directory name, so a catalog row
// (an edited or restored catalog) can never point a file operation (delete, rename, source-state scan) outside that directory.

const insertRow = (home: string, projectId: string) => {
  const db = openTestSqlite(join(home, "projects", "catalog.db"));
  try {
    db.prepare("INSERT INTO projects (project_id, display_name, source, data_class, created_at, updated_at) VALUES (?, 'x', 'created', 'user', 't', 't')").run(projectId);
  } finally { db.close(); }
};
const guarded = { code: "catalog.project_storage_invalid" };

test("S-102 a catalog row whose project id is not a plain directory name is refused before any file is touched: reading, deleting and removing a demo project", async t => {
  const root = mkdtempSync(join(tmpdir(), "security-project-storage-")), home = join(root, "home");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    // What a row with id "../victim" would delete: the directory next to the projects directory.
    const victim = join(home, "victim");
    mkdirSync(victim); writeFileSync(join(victim, "keep.txt"), "keep");
    const before = readdirSync(join(home, "projects")).sort();
    for (const id of ["..", "../victim", "a/b", "a\\b", "/etc"]) {
      insertRow(home, id);
      assert.throws(() => catalog.getProject(id), guarded, `getProject ${JSON.stringify(id)}`);
      assert.throws(() => catalog.listProjects(), guarded, `listProjects with ${JSON.stringify(id)} in the catalog`);
      await assert.rejects(catalog.deleteProject({ project_id: id, actor_id: "tester", delete_confirmed: true, idempotency_key: `delete-${id}` }), guarded, `deleteProject ${JSON.stringify(id)}`);
      await assert.rejects(catalog.removeDemoProject({ project_id: id, actor_id: "tester", delete_confirmed: true, idempotency_key: `demo-${id}` }), guarded, `removeDemoProject ${JSON.stringify(id)}`);
      const db = openTestSqlite(join(home, "projects", "catalog.db"));
      try { db.prepare("DELETE FROM projects WHERE project_id = ?").run(id); } finally { db.close(); }
    }
    assert.equal(readFileSync(join(victim, "keep.txt"), "utf8"), "keep", "the directory next to the projects directory is untouched");
    assert.deepEqual(readdirSync(join(home, "projects")).sort(), before, "nothing was staged, renamed or created beside the catalog");
    assert.equal(existsSync(join(home, "projects", "..", "victim")), true);
  } finally { catalog.close(); }
});

// A deletion moves the project's directory to <projects directory>/.deleting-<project_id>-<uuid> and records that in its receipt. The clean-up
// then runs from the receipt, in whichever process and whichever copy of the Home finds it pending, so the recorded value is not trusted either.

type Catalog = Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
const stagesIn = (home: string) => readdirSync(join(home, "projects")).filter(name => name.startsWith(".deleting-"));
const receiptOf = (catalog: Catalog, deletionId: string) => {
  const receipt = catalog.listProjectDeletions().find(item => item.deletion_id === deletionId);
  assert.ok(receipt, "the deletion keeps its receipt");
  return receipt;
};
/** Deletes a project the way an interrupted run leaves it: the catalog has committed, the receipt is pending and the staged directory is on disk. */
async function interruptedDeletion(t: TestContext, catalog: Catalog, displayName: string) {
  const project = await catalog.createProject({ display_name: displayName, actor_id: "tester" });
  const originalRm = fs.rm;
  const removal = t.mock.method(fs, "rm", async (...args: Parameters<typeof fs.rm>) => {
    if (String(args[0]).includes(".deleting-")) throw new Error("the clean-up was interrupted");
    return originalRm(...args);
  });
  try {
    const key = `delete-${project.project_id}`;
    const { deletion } = await catalog.deleteProject({ project_id: project.project_id, actor_id: "tester", delete_confirmed: true, idempotency_key: key });
    assert.equal(deletion.cleanup_state, "pending");
    return { projectId: project.project_id, deletionId: deletion.deletion_id, key };
  } finally { removal.mock.restore(); }
}
const recordStaged = (home: string, deletionId: string, stagedDirectory: string, projectId?: string) => {
  const db = openTestSqlite(join(home, "projects", "catalog.db"));
  try {
    db.prepare("UPDATE project_deletions SET staged_directory = ?, project_id = COALESCE(?, project_id), cleanup_state = 'pending', cleanup_error = NULL, cleaned_at = NULL WHERE deletion_id = ?")
      .run(stagedDirectory, projectId ?? null, deletionId);
  } finally { db.close(); }
};

test("S-102 a deletion receipt whose recorded staged directory is not this project's is refused: the files stay, the receipt stays pending and says why", async t => {
  const root = mkdtempSync(join(tmpdir(), "security-project-storage-")), home = join(root, "home");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  // Relative values resolve against the working directory, so this test stands inside its own Home: were the refusal ever lost, "../beside" and
  // ".." would reach only this Home's files, and the assertions below would say so, instead of removing what sits above the checkout.
  const workingDirectory = process.cwd();
  process.chdir(join(home, "projects"));
  try {
    const outside = join(root, "outside");
    mkdirSync(outside); writeFileSync(join(outside, "keep.txt"), "keep");
    const beside = join(home, "beside");
    mkdirSync(beside); writeFileSync(join(beside, "keep.txt"), "keep");
    const live = await catalog.createProject({ display_name: "还在的项目", actor_id: "tester" });
    const { projectId, deletionId, key } = await interruptedDeletion(t, catalog, "删到一半的项目");
    const [stage] = stagesIn(home);
    const uuid = stage.slice(`.deleting-${projectId}-`.length);
    const otherProjectStage = join(home, "projects", `.deleting-${live.project_id}-${uuid}`);
    mkdirSync(otherProjectStage); writeFileSync(join(otherProjectStage, "keep.txt"), "keep");

    for (const recorded of [outside, beside, home, join(home, "projects"), live.database_path, join(home, "projects", live.project_id), "../beside", "", "..", otherProjectStage, `.deleting-${projectId}-not-a-uuid`, `.deleting-${projectId}-${uuid}/..`]) {
      recordStaged(home, deletionId, recorded);
      assert.equal(await catalog.projectDeletion.finishAll(), 1, `the sweep leaves ${JSON.stringify(recorded)} pending`);
      const receipt = receiptOf(catalog, deletionId);
      assert.equal(receipt.cleanup_state, "pending", JSON.stringify(recorded));
      assert.match(receipt.cleanup_error ?? "", /不是这个项目删除时留下的/, JSON.stringify(recorded));
      const replay = await catalog.deleteProject({ project_id: projectId, actor_id: "tester", delete_confirmed: true, idempotency_key: key });
      assert.equal(replay.deletion.cleanup_state, "pending", `a person's retry of ${JSON.stringify(recorded)} is refused too`);
      await assert.rejects(catalog.projectDeletion.settleProject(projectId), guarded, `re-creating the project over ${JSON.stringify(recorded)}`);
      assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep", `outside the Home after ${JSON.stringify(recorded)}`);
      assert.equal(readFileSync(join(beside, "keep.txt"), "utf8"), "keep", `beside the projects directory after ${JSON.stringify(recorded)}`);
      assert.equal(existsSync(live.database_path), true, `the live project after ${JSON.stringify(recorded)}`);
      assert.equal(readFileSync(join(otherProjectStage, "keep.txt"), "utf8"), "keep", `another project's stage after ${JSON.stringify(recorded)}`);
      assert.equal(existsSync(join(home, "projects", stage)), true, `this deletion's own stage waits after ${JSON.stringify(recorded)}`);
    }

    // A project id that is no plain directory name has no stage at all, whatever the row records beside it.
    for (const id of ["..", "../outside"]) {
      recordStaged(home, deletionId, join(outside, `.deleting-${id}-${uuid}`), id);
      assert.equal(await catalog.projectDeletion.finishAll(), 1, `the sweep leaves project id ${JSON.stringify(id)} pending`);
      assert.equal(receiptOf(catalog, deletionId).cleanup_state, "pending");
      assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep", `outside the Home with project id ${JSON.stringify(id)}`);
    }
    recordStaged(home, deletionId, join(home, "projects", stage), projectId);

    // The right name under somebody else's directory is what a copied Home holds, so it stands for this Home's stage: only that one goes.
    const lookalike = join(outside, stage);
    mkdirSync(lookalike); writeFileSync(join(lookalike, "keep.txt"), "keep");
    recordStaged(home, deletionId, lookalike);
    assert.equal(await catalog.projectDeletion.finishAll(), 0);
    assert.equal(readFileSync(join(lookalike, "keep.txt"), "utf8"), "keep", "the directory the row named is not this Home's and stays");
    assert.equal(existsSync(join(home, "projects", stage)), false, "this Home's stage is what the clean-up removed");
    assert.equal(receiptOf(catalog, deletionId).cleanup_state, "complete");

    // A stage replaced by a link: the clean-up removes the link and never follows it.
    const linked = await interruptedDeletion(t, catalog, "暂存被换成链接的项目");
    const [linkedStage] = stagesIn(home).filter(name => name.startsWith(`.deleting-${linked.projectId}-`));
    rmSync(join(home, "projects", linkedStage), { recursive: true, force: true });
    symlinkSync(outside, join(home, "projects", linkedStage));
    assert.equal(await catalog.projectDeletion.finishAll(), 0, "the link is this deletion's stage by name, so the clean-up finishes");
    assert.equal(receiptOf(catalog, linked.deletionId).cleanup_state, "complete");
    assert.equal(existsSync(join(home, "projects", linkedStage)), false);
    assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep", "a stage that is a link does not lead the clean-up out of the Home");
  } finally { process.chdir(workingDirectory); catalog.close(); }
});

test("S-102 a refused deletion receipt runs nothing: no owner is called and every step stays as it was, whichever column was edited", async t => {
  const root = mkdtempSync(join(tmpdir(), "security-project-storage-")), home = join(root, "home");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const calls: string[] = [];
  let broken = true;
  const dispose = projectDeletedHooksFor(home).register({ id: "test-owner", label: null, clear(projectId) { calls.push(projectId); if (broken) throw new Error("暂时清不掉"); } });
  try {
    const outside = join(root, "outside");
    mkdirSync(outside); writeFileSync(join(outside, "keep.txt"), "keep");
    const live = await catalog.createProject({ display_name: "还在用的项目", actor_id: "tester" });
    const { projectId, deletionId, key } = await interruptedDeletion(t, catalog, "所有者还没清完的项目");
    const [stage] = stagesIn(home);
    const staged = join(home, "projects", stage);
    const stepsBefore = receiptOf(catalog, deletionId).owner_steps;
    assert.deepEqual(stepsBefore.filter(step => step.owner_id === "test-owner").map(step => [step.state, step.error]), [["pending", "暂时清不掉"]]);
    // From here the owner would succeed, so a call would also turn its step complete.
    broken = false;
    calls.length = 0;

    for (const [edited, recordedDirectory, recordedProject] of [
      ["only the staged directory", outside, projectId],
      ["only the project id, to a project still in use", staged, live.project_id],
      ["only the project id, to a value that is no plain directory name", staged, "../outside"],
    ]) {
      recordStaged(home, deletionId, recordedDirectory, recordedProject);
      assert.equal(await catalog.projectDeletion.finishAll(), 1, `the sweep: ${edited}`);
      const replay = await catalog.deleteProject({ project_id: projectId, actor_id: "tester", delete_confirmed: true, idempotency_key: key });
      assert.equal(replay.deletion.cleanup_state, "pending", `a person's retry: ${edited}`);
      await assert.rejects(catalog.projectDeletion.settleProject(recordedProject), guarded, `re-creating the project: ${edited}`);
      assert.deepEqual(calls, [], `no owner is called: ${edited}`);
      const receipt = receiptOf(catalog, deletionId);
      assert.equal(receipt.cleanup_state, "pending", edited);
      assert.match(receipt.cleanup_error ?? "", /不是这个项目删除时留下的/, edited);
      assert.deepEqual(receipt.owner_steps, stepsBefore, `every step stays as it was: ${edited}`);
      assert.equal(existsSync(staged), true, `the stage waits: ${edited}`);
      assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep", `outside the Home: ${edited}`);
      assert.equal(existsSync(live.database_path), true, `the live project: ${edited}`);
    }

    // The same receipt with its own values goes through, so what refused it above was the edit and nothing else.
    recordStaged(home, deletionId, staged, projectId);
    assert.equal(await catalog.projectDeletion.finishAll(), 0);
    assert.deepEqual(calls, [projectId]);
    assert.equal(receiptOf(catalog, deletionId).cleanup_state, "complete");
    assert.equal(existsSync(staged), false);
  } finally { dispose(); catalog.close(); }
});

test("S-102 a Home copied while a deletion is under way clears its own staged directory and leaves the original Home's alone", async t => {
  const root = mkdtempSync(join(tmpdir(), "security-project-storage-")), original = join(root, "original"), copy = join(root, "copy");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: original });
  let deletionId: string;
  try { ({ deletionId } = await interruptedDeletion(t, catalog, "删到一半时被拷走的项目")); } finally { catalog.close(); }
  const [stage] = stagesIn(original);
  writeFileSync(join(original, "projects", stage, "marker.txt"), "only in the original");
  cpSync(original, copy, { recursive: true });
  assert.deepEqual(stagesIn(copy), [stage]);

  const copied = await openMolisWorkProjectCatalog({ homeDirectory: copy });
  try {
    assert.equal(await copied.projectDeletion.finishAll(), 0);
    assert.equal(receiptOf(copied, deletionId).cleanup_state, "complete");
  } finally { copied.close(); }
  assert.equal(readFileSync(join(original, "projects", stage, "marker.txt"), "utf8"), "only in the original", "the copy never reaches into the original Home");
  assert.deepEqual(stagesIn(copy), [], "a receipt the copy calls complete has left nothing of the deleted project in the copy");

  const resumed = await openMolisWorkProjectCatalog({ homeDirectory: original });
  try {
    assert.equal(receiptOf(resumed, deletionId).cleanup_state, "pending", "the original's own deletion is still its own to finish");
    assert.equal(await resumed.projectDeletion.finishAll(), 0);
    assert.deepEqual(stagesIn(original), []);
  } finally { resumed.close(); }
});

// A project's default output directory is <Home>/outputs/<project_id>, derived from the trusted Home, never from a receipt. The person may choose to
// delete its files with the project (specs/shared-sources-and-surfaces §3 「永久删除怎么做」): that step, too, never leaves the Home (SSC-21).

const deleteWithOutput = (catalog: Catalog, projectId: string) =>
  catalog.deleteProject({ project_id: projectId, actor_id: "tester", delete_confirmed: true, idempotency_key: `delete-with-output-${projectId}`, output_files: "delete" });
const outputStep = (deletion: { owner_steps: ReadonlyArray<{ owner_id: string; state: string; error: string | null }> }) => {
  const [step] = deletion.owner_steps.filter(item => item.owner_id === "project-output");
  assert.ok(step, "the person chose to delete the files, so the receipt has the step");
  return step;
};

test("SSC-21 S-102 deleting a default output directory's files never follows a symbolic link: outputs or the folder as a link is refused and the step waits to be retried, a link inside is removed as a link", async t => {
  const root = mkdtempSync(join(tmpdir(), "security-project-storage-")), home = join(root, "home");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const outputs = join(realpathSync(home), "outputs"), outside = join(root, "outside");
    const keep = (projectId: string) => join(outside, projectId, "keep.txt");
    const leaveOutside = (projectId: string) => { mkdirSync(join(outside, projectId), { recursive: true }); writeFileSync(keep(projectId), "keep"); };

    // `outputs` is a link to a folder outside the Home with the project's id in it.
    const underLinkedOutputs = await catalog.createProject({ display_name: "outputs 是链接", actor_id: "tester" });
    leaveOutside(underLinkedOutputs.project_id);
    symlinkSync(outside, outputs);
    assert.equal(catalog.projectDeletion.outputContents(underLinkedOutputs.project_id), "unknown", "the dialog cannot say what is there, so it asks");
    const refused = await deleteWithOutput(catalog, underLinkedOutputs.project_id);
    assert.equal(refused.deletion.cleanup_state, "pending");
    assert.equal(outputStep(refused.deletion).state, "pending");
    assert.match(outputStep(refused.deletion).error ?? "", /符号链接/);
    assert.equal(existsSync(underLinkedOutputs.database_path), false, "the project itself is deleted: only this step waits");
    assert.equal(await catalog.projectDeletion.finishAll(), 1, "the sweep leaves it pending too");
    assert.equal(readFileSync(keep(underLinkedOutputs.project_id), "utf8"), "keep", "nothing outside the Home is removed");

    // Once `outputs` is a folder of this Home again, the same request finishes, and only the Home's own folder goes.
    unlinkSync(outputs);
    mkdirSync(join(outputs, underLinkedOutputs.project_id), { recursive: true });
    writeFileSync(join(outputs, underLinkedOutputs.project_id, "draft.md"), "draft");
    const retried = await deleteWithOutput(catalog, underLinkedOutputs.project_id);
    assert.equal(retried.replayed, true);
    assert.equal(retried.deletion.cleanup_state, "complete");
    assert.equal(outputStep(retried.deletion).state, "complete");
    assert.equal(existsSync(join(outputs, underLinkedOutputs.project_id)), false);
    assert.equal(readFileSync(keep(underLinkedOutputs.project_id), "utf8"), "keep");

    // The project's own folder is a link.
    const linkedFolder = await catalog.createProject({ display_name: "输出目录是链接", actor_id: "tester" });
    leaveOutside(linkedFolder.project_id);
    symlinkSync(join(outside, linkedFolder.project_id), join(outputs, linkedFolder.project_id));
    assert.equal(catalog.projectDeletion.outputContents(linkedFolder.project_id), "unknown");
    const linked = await deleteWithOutput(catalog, linkedFolder.project_id);
    assert.equal(outputStep(linked.deletion).state, "pending");
    assert.equal(lstatSync(join(outputs, linkedFolder.project_id)).isSymbolicLink(), true, "the link is left for the person to look at");
    assert.equal(readFileSync(keep(linkedFolder.project_id), "utf8"), "keep");

    // A link inside the folder is removed as a link: what it points to stays.
    const linkInside = await catalog.createProject({ display_name: "里面有链接", actor_id: "tester" });
    leaveOutside(linkInside.project_id);
    mkdirSync(join(outputs, linkInside.project_id));
    writeFileSync(join(outputs, linkInside.project_id, "report.md"), "report");
    symlinkSync(join(outside, linkInside.project_id), join(outputs, linkInside.project_id, "elsewhere"));
    const inside = await deleteWithOutput(catalog, linkInside.project_id);
    assert.equal(inside.deletion.cleanup_state, "complete");
    assert.equal(existsSync(join(outputs, linkInside.project_id)), false);
    assert.equal(readFileSync(keep(linkInside.project_id), "utf8"), "keep", "the link is not followed");
  } finally { catalog.close(); }
});

test("SSC-21 S-102 a receipt edited to name a project still in the catalog never deletes that project's default output directory", async t => {
  const root = mkdtempSync(join(tmpdir(), "security-project-storage-")), home = join(root, "home");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const outputs = join(realpathSync(home), "outputs");
    const live = await catalog.createProject({ display_name: "还在用的项目", actor_id: "tester" });
    const recycled = await catalog.createProject({ display_name: "在回收站里的项目", actor_id: "tester" });
    await catalog.commit(() => catalog.recycle.change({ project_id: recycled.project_id, actor_id: "tester", operation_id: "recycle-one",
      expected_state: catalog.recycle.inspect(recycled.project_id).state, recycled: true, confirmed: true }, () => undefined));
    for (const project of [live, recycled]) {
      mkdirSync(join(outputs, project.project_id), { recursive: true });
      writeFileSync(join(outputs, project.project_id, "work.md"), "in use");
    }
    const gone = await catalog.createProject({ display_name: "删掉的项目", actor_id: "tester" });
    const { deletion } = await deleteWithOutput(catalog, gone.project_id);
    assert.equal(deletion.cleanup_state, "complete");

    // The receipt is edited to stand for a project that is still there, with a stage name that project's deletion would give, and its step reset.
    for (const target of [live, recycled]) {
      const db = openTestSqlite(join(home, "projects", "catalog.db"));
      try {
        db.prepare("UPDATE project_deletion_steps SET state = 'pending', error = NULL WHERE deletion_id = ? AND owner_id = 'project-output'").run(deletion.deletion_id);
      } finally { db.close(); }
      recordStaged(home, deletion.deletion_id, join(home, "projects", `.deleting-${target.project_id}-00000000-0000-4000-8000-000000000000`), target.project_id);
      assert.equal(await catalog.projectDeletion.finishAll(), 1, target.display_name);
      const step = outputStep(receiptOf(catalog, deletion.deletion_id));
      assert.equal(step.state, "pending", target.display_name);
      assert.match(step.error ?? "", /还在目录库里/, target.display_name);
      assert.equal(readFileSync(join(outputs, target.project_id, "work.md"), "utf8"), "in use", target.display_name);
    }
  } finally { catalog.close(); }
});
