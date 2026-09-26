import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGitWorktreePort, readWriterIntegration, prepareWriterIntegration } from "@molis-ai/molis-work-app-local-host";
const exec = promisify(execFile);

test("a file changed on both sides is never overwritten as-is: a clean three-way merge or a person's resolution is what gets written", { timeout: 30_000 }, async () => {
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "integration-conflict-"))), root = path.join(home, "repo"); await mkdir(root);
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  await git("init", "-q"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
  await writeFile(path.join(root, "clean.txt"), "one\ntwo\nthree\n"); await writeFile(path.join(root, "clash.txt"), "alpha\nbeta\n"); await writeFile(path.join(root, "append.ts"), "function a() {\n  return 1;\n}\n");
  await git("add", "."); await git("commit", "-qm", "base");
  const tree = await createGitWorktreePort(root).create("child"), childRoot = path.resolve(root, tree.directory);
  const grants = async () => [{ workspace_id: "main", canonical_path: root, realpath_verified: true, display_name: "Main" }, { workspace_id: "child", canonical_path: childRoot, realpath_verified: true, display_name: "Child" }] as never;
  const selection = { workspace_id: "main", writer_workspace_id: "child" };
  try {
    // The child edits the last line of one file and the first line of another; the main workspace edits too.
    await writeFile(path.join(childRoot, "clean.txt"), "one\ntwo\nthree (child)\n"); await writeFile(path.join(childRoot, "clash.txt"), "alpha (child)\nbeta\n");
    await writeFile(path.join(root, "clean.txt"), "one (main)\ntwo\nthree\n"); await writeFile(path.join(root, "clash.txt"), "alpha (main)\nbeta\n");
    await writeFile(path.join(childRoot, "append.ts"), "function a() {\n  return 1;\n}\n\nfunction child() {\n  return 2;\n}\n");
    await writeFile(path.join(root, "append.ts"), "function a() {\n  return 1;\n}\n\nfunction main() {\n  return 3;\n}\n");
    const view = await readWriterIntegration(selection, grants);
    const appended = view.files.find(file => file.path.join("/") === "append.ts")!;
    assert.match(appended.conflict!.merged_text, /<<<<<<< 主工作区\n\nfunction main\(\) \{\n  return 3;\n\}\n\|{7} 原基线\n=======\n\nfunction child\(\) \{\n  return 2;\n\}\n>>>>>>> 子任务/,
      "a shared closing brace stays inside both sides, so keeping both yields whole functions");
    const clean = view.files.find(file => file.path.join("/") === "clean.txt")!, clash = view.files.find(file => file.path.join("/") === "clash.txt")!;
    assert.equal(clean.selectable, false, "a conflict is never selectable as the child's plain version");
    assert.equal(clean.conflict?.clean, true); assert.equal(clean.conflict?.merged_text, "one (main)\ntwo\nthree (child)\n");
    assert.equal(clean.conflict?.base_text, "one\ntwo\nthree\n"); assert.match(clean.reason!, /没有冲突/);
    assert.equal(clash.conflict?.clean, false); assert.equal(clash.conflict?.markers, 1);
    assert.match(clash.conflict!.merged_text, /<<<<<<< 主工作区\nalpha \(main\)\n\|{7} 原基线\nalpha\n=======\nalpha \(child\)\n>>>>>>> 子任务/, "each side is shown whole, with the original between them");

    await assert.rejects(prepareWriterIntegration({ ...selection, files: [{ path: clean.path, revision: clean.revision! }] }, grants), /三方合并/, "without a resolution the conflict stays blocked");
    await assert.rejects(prepareWriterIntegration({ ...selection, files: [{ path: clash.path, revision: clash.revision!, resolution: clash.conflict!.merged_text }] }, grants), /冲突标记/);
    await assert.rejects(prepareWriterIntegration({ ...selection, files: [{ path: clash.path, revision: clash.revision!, resolution: "alpha (main)\nbeta\n" }] }, grants), /相同/);

    const resolvedClash = "alpha (main + child)\nbeta\n";
    const prepared = await prepareWriterIntegration({ ...selection, files: [
      { path: clean.path, revision: clean.revision!, resolution: clean.conflict!.merged_text },
      { path: clash.path, revision: clash.revision!, resolution: resolvedClash }] }, grants);
    assert.deepEqual(prepared.files.map(file => file.after_text), ["one (main)\ntwo\nthree (child)\n", resolvedClash], "the review shows exactly the text that will be written");
    await prepared.execute();
    assert.equal(await readFile(path.join(root, "clean.txt"), "utf8"), "one (main)\ntwo\nthree (child)\n");
    assert.equal(await readFile(path.join(root, "clash.txt"), "utf8"), resolvedClash);

    // A resolution made against contents that have since changed is refused rather than applied to the new contents.
    await writeFile(path.join(childRoot, "clean.txt"), "one\ntwo\nthree (child again)\n");
    const again = (await readWriterIntegration(selection, grants)).files.find(file => file.path.join("/") === "clean.txt")!;
    await writeFile(path.join(root, "clean.txt"), "one (main, later)\ntwo\nthree\n");
    await assert.rejects(prepareWriterIntegration({ ...selection, files: [{ path: again.path, revision: again.revision!, resolution: "x\n" }] }, grants), /又变了/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
