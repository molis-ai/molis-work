// SECURITY-INVARIANTS S-52: the Host runs Git for a workspace without executing what the repository configures (hooks, filters,
// fsmonitor, a submodule's own filters), except in an operation the person approved. This file holds the writer's work tree half,
// through the package's public entry; reading the repository, preparing a review and the approved operation are in
// tests/git-operations.test.ts, because they need the Host's internal functions (docs/system/SECURITY-INVARIANTS.md §2).
import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGitWorktreePort } from "@molis-ai/molis-work-app-local-host";

const exec = promisify(execFile);

/** A repository with a submodule; helpers that leave a mark under `ran` when anything executes them. */
async function fixture(t: import("node:test").TestContext) {
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "s52-writer-"))), root = path.join(home, "repo"), ran = path.join(home, "ran");
  t.after(() => rm(home, { recursive: true, force: true }));
  const source = path.join(home, "source");
  await mkdir(root); await mkdir(ran); await mkdir(source);
  const git = (cwd: string, ...args: string[]) => exec("git", args, { cwd });
  for (const cwd of [source, root]) {
    await git(cwd, "init", "-q", "-b", "main"); await git(cwd, "config", "user.name", "Fixture"); await git(cwd, "config", "user.email", "fixture@example.invalid");
  }
  await writeFile(path.join(source, ".gitattributes"), "*.txt filter=inner\n"); await writeFile(path.join(source, "inner.txt"), "inner\n");
  await git(source, "add", "."); await git(source, "commit", "-qm", "inner");
  await writeFile(path.join(root, "connect.ts"), "const retries = 0;\n");
  await git(root, "-c", "protocol.file.allow=always", "submodule", "add", "-q", source, "inner");
  await git(root, "add", "."); await git(root, "commit", "-qm", "base");
  // A filter passes its content through; anything else leaves stdin alone.
  const helper = async (name: string, filter = true) => {
    const file = path.join(home, `${name}.sh`);
    await writeFile(file, `#!/bin/sh\ntouch "${path.join(ran, name)}"\n${filter ? "cat" : "exit 1"}\n`, { mode: 0o755 });
    return file;
  };
  return { home, root, ran, git, helper };
}

test("S-52 a writer's work tree is prepared, created, read and removed without a hook, a filter or a submodule's work tree, whatever Git variables the Host inherited", async t => {
  const f = await fixture(t);
  // Configured after the fixture's own Git commands, so anything that runs them is the Host.
  const hooks = path.join(f.home, "hooks");
  await mkdir(hooks);
  for (const hook of ["post-checkout", "reference-transaction"]) await writeFile(path.join(hooks, hook), `#!/bin/sh\ntouch "${path.join(f.ran, hook)}"\n`, { mode: 0o755 });
  await f.git(f.root, "config", "core.hooksPath", hooks);
  await f.git(f.root, "config", "core.fsmonitor", await f.helper("fsmonitor", false));
  await f.git(path.join(f.root, "inner"), "config", "filter.inner.clean", await f.helper("inner-filter"));
  // The same size as committed, so Git must read the content (through the submodule's filter) to tell it changed.
  await writeFile(path.join(f.root, "inner", "inner.txt"), "INNER\n");
  // Variables the Host process inherited that would point Git at another repository and index.
  const decoy = path.join(f.home, "decoy");
  await exec("git", ["init", "-q", "-b", "decoy", decoy]);
  const inherited = { GIT_DIR: path.join(decoy, ".git"), GIT_WORK_TREE: decoy, GIT_INDEX_FILE: path.join(decoy, ".git", "index") };
  const saved = Object.fromEntries(Object.keys(inherited).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, inherited);
    const port = createGitWorktreePort(f.root), preview = await port.preview("safe");
    const created = await port.create("safe", preview.base_commit);
    assert.equal(await readFile(path.join(f.root, created.directory, "connect.ts"), "utf8"), "const retries = 0;\n", "the work tree is the granted repository's");
    assert.deepEqual(await port.changes(created), []);
    await port.remove(created);
    assert.deepEqual(await port.list(), []);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  assert.deepEqual(await readdir(f.ran), [], "no hook, fsmonitor or submodule filter ran");
});

test("S-52 a repository whose files use a content filter gets no writer's work tree, and the filter does not run", async t => {
  const f = await fixture(t);
  await f.git(f.root, "config", "filter.outer.clean", await f.helper("outer-filter"));
  await f.git(f.root, "config", "filter.outer.smudge", await f.helper("outer-smudge"));
  await writeFile(path.join(f.root, ".gitattributes"), "connect.ts filter=outer\n");
  await writeFile(path.join(f.root, "connect.ts"), "dirty filter input\n");
  const port = createGitWorktreePort(f.root);
  await assert.rejects(port.preview("filtered"), /内容过滤器/);
  await assert.rejects(port.create("filtered"), /内容过滤器/);
  assert.deepEqual(await port.list(), []);
  assert.deepEqual(await readdir(f.ran), []);
});

test("S-52 a writer's work tree holding an initialized submodule is not removed, and the submodule's changes stay", async t => {
  const f = await fixture(t);
  const port = createGitWorktreePort(f.root), created = await port.create("held", (await port.preview("held")).base_commit);
  const directory = path.join(f.root, created.directory), inner = path.join(directory, "inner");
  await f.git(directory, "-c", "protocol.file.allow=always", "submodule", "update", "--init", "-q");
  await f.git(inner, "config", "filter.inner.clean", await f.helper("inner-filter"));
  await writeFile(path.join(inner, "inner.txt"), "INNER\n");
  // The Host's status no longer opens the submodule; Git itself refuses to remove a work tree that holds one.
  await assert.rejects(port.remove(created));
  assert.equal(await readFile(path.join(inner, "inner.txt"), "utf8"), "INNER\n", "the submodule's uncommitted change is still there");
  assert.equal((await port.list()).length, 1);
  assert.deepEqual(await readdir(f.ran), [], "the submodule's filter did not run");
});
