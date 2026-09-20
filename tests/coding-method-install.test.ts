import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

// Real packaged SDK, filesystem discovery, scanner and encrypted Store; no model or network.
test("installed methods preserve captured content, owner and version across restart; deny escapes and duplicate writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-methods-")), workspace = join(root, "workspace");
  const owner = { board_id: "project-a", plugin_id: "io.molis.work.coding" };
  const other = { ...owner, board_id: "project-b" };
  const directory = { canonical_path: workspace, realpath_verified: true };
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.methods-test", appVersion: "1.0.0" },
    storageRoot: join(root, "runtime"), modelConfiguration: async () => { throw new Error("no model needed"); }, resolveCredential: () => null });
  let adapter: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await mkdir(join(workspace, "skills", "evidence"), { recursive: true });
    const body = '---\nname: evidence\ndescription: Read actual evidence.\n---\nRead README.md and quote the exact relevant requirement. Do not edit files.';
    await writeFile(join(workspace, "skills/evidence/SKILL.md"), body);
    await writeFile(join(workspace, "skills/evidence/check.md"), "Distinguish observation from inference.");
    adapter = await open();let library = adapter.skillLibrary!;
    await assert.rejects(library.discover(owner, directory, "../"), /相对目录/);
    await assert.rejects(library.discover(owner, directory, "/tmp"), /相对目录/);
    await assert.rejects(library.discover(owner, directory, "missing"));
    const first = await library.discover(owner, directory, "skills");assert.equal(first.length, 1);assert.notEqual(first[0]!.summary,"---");
    assert.ok(first[0]!.body.includes(body));assert.ok(first[0]!.body.includes("Distinguish observation"));
    const candidates = await library.discover(owner, directory, "skills");
    await assert.rejects(library.install(owner, first[0]!.candidate_id), /候选已失效/);
    await assert.rejects(library.install(other, candidates[0]!.candidate_id), /不属于当前项目/);
    await writeFile(join(workspace, "skills/evidence/SKILL.md"), body.replace('README.md', 'changed-after-preview.md'));
    const outcomes = await Promise.allSettled([library.install(owner, candidates[0]!.candidate_id),library.install(owner, candidates[0]!.candidate_id)]);
    assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1, "one atomic commit, no overwrite on double click");
    const entries = await library.list(owner);assert.equal(entries.length, 1);assert.deepEqual(entries[0]!.tools, []);
    const ref = { skill_id: entries[0]!.skill_id, version: 1 };
    assert.match((await library.read(owner, ref)).body, /Read README.md/);
    assert.doesNotMatch((await library.read(owner, ref)).body, /changed-after-preview/);
    assert.deepEqual(await library.list(other), []);await assert.rejects(library.read(other, ref));
    await assert.rejects(library.read(owner, { ...ref, version: 2 }));
    const duplicate = await library.discover(owner, directory, "skills");
    await assert.rejects(library.install(owner, duplicate[0]!.candidate_id), /同名方法/);
    await adapter.close();adapter = await open();library = adapter.skillLibrary!;
    assert.deepEqual(await library.list(owner), entries);assert.match((await library.read(owner, ref)).body, /Read README.md/);
    await assert.rejects(library.install(owner, duplicate[0]!.candidate_id), /候选已失效/);
    // Root-level SKILL.md and a symlink to another directory exercise SDK path handling.
    await mkdir(join(workspace, "root-package"));await writeFile(join(workspace, "root-package/SKILL.md"), "---\nname: root-package\ndescription: Root package\n---\nRead the task.");
    const atRoot = await library.discover(owner, { canonical_path: join(workspace, "root-package"), realpath_verified: true }, ".");
    assert.equal(atRoot.length, 1);assert.deepEqual(atRoot[0]!.files, ["SKILL.md"]);
    await writeFile(join(root, "outside.md"), "outside workspace");
    await symlink(join(root, "outside.md"), join(workspace, "root-package/outside.md"));
    await assert.rejects(library.discover(owner, directory, "root-package"));
    await mkdir(join(workspace, "unsafe"));await writeFile(join(workspace, "unsafe/SKILL.md"), "---\nname: unsafe\ndescription: Unsafe example\n---\nRun eval('source').");
    const unsafe = await library.discover(owner, directory, "unsafe");
    await assert.rejects(library.install(owner, unsafe[0]!.candidate_id), /refused|evaluates-source/);
    assert.equal((await library.list(owner)).length, 1, "rejected content leaves no installed record");
  } finally { await adapter?.close();await rm(root, { recursive: true, force: true }); }
});
