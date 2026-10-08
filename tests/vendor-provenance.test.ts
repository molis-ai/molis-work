import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before, describe } from "node:test";
import { fileURLToPath } from "node:url";
import { vendoredProvenanceProblems } from "../scripts/gates/vendored-provenance.mjs";

// specs/repository-anti-corruption, decision 2026-10-08 "Prologue SDK 收敛与私有包" (W1-23): every vendored package archive has
// a `.sha256` and a `.provenance.json` that match it, and vendor/prologue-sdk/patch-history.json records the patches deleted
// from that folder. The rule lives in scripts/gates/vendored-provenance.mjs and is plugged into scripts/check-health-gates.mjs;
// like tests/health-gates-merge-base.test.ts, each rule is mutation-verified on a small scratch repository: one violation
// added on a branch makes `--base main` fail, and `--update` on that branch (the laundering move) does not change that.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(repoRoot, "scripts/check-health-gates.mjs");
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const drop = (file: string) => rmSync(path.join(repo, file), { force: true });
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const edit = (file: string, change: (json: any) => void) => { const json = JSON.parse(read(file)); change(json); put(file, `${JSON.stringify(json, null, 2)}\n`); };

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const COMMIT_C = "c".repeat(40);
const BLOB = "d".repeat(40);
const CURRENT = "vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-current.tgz";
const OTHER = "vendor/other/other-1.0.0.tgz";
const PATCH = "vendor/prologue-sdk/current.patch";
const HISTORY = "vendor/prologue-sdk/patch-history.json";

/** An archive with the records the gate wants beside it. */
const archive = (file: string, content: string, extra: Record<string, unknown> = {}) => {
  const name = path.basename(file);
  put(file, content);
  put(`${file}.sha256`, `${sha256(content)}  ${name}\n`);
  put(`${file}.provenance.json`, `${JSON.stringify({
    schema: "test-provenance-v1",
    source: { commit: COMMIT_A, dirty: false },
    artifact: { file: name, bytes: Buffer.byteLength(content), sha256: sha256(content), integrity: `sha512-${createHash("sha512").update(content).digest("base64")}` },
    ...extra,
  }, null, 2)}\n`);
};
const history = () => ({
  schema: "prologue-sdk-patch-history-v1",
  retrieval: { lastCommitWithAllPatches: COMMIT_C },
  upstream: { mainHead: COMMIT_C, commitsChecked: [COMMIT_A, COMMIT_B, COMMIT_C] },
  patches: [
    { file: "one.patch", bytes: 10, diffEntries: 1, sha256: sha256("one"), gitBlob: BLOB, base: COMMIT_A, commit: COMMIT_B, sourceKind: "upstream-commit", source: "branch one", summary: "does one", package: { file: "one.tgz", bytes: 5, sha256: sha256("one.tgz"), gitBlob: BLOB } },
    { file: "two.patch", bytes: 20, diffEntries: 2, sha256: sha256("two"), gitBlob: BLOB, base: COMMIT_A, commit: null, sourceKind: "uncommitted-worktree", source: "a work tree", summary: "does two", package: { file: "two.tgz", bytes: 6, sha256: sha256("two.tgz"), gitBlob: BLOB } },
  ],
  packagesWithoutPatch: [{ file: "three.tgz", bytes: 7, sha256: sha256("three.tgz"), gitBlob: BLOB, commit: COMMIT_B, description: "a package" }],
});

// Fixture: the current Prologue package (with an alternative patch it names), the patch history, and one package of another
// vendor folder; all records consistent.
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-vendor-provenance-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 20, classLines: 10, classMethods: 3, functionLines: 8, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
  put("specs/demo/spec.md", "# Demo\n\n状态：进行中\n");
  put(PATCH, "the patch\n");
  archive(CURRENT, "current archive", { alsoBuildableFrom: { patch: { file: "current.patch", bytes: Buffer.byteLength("the patch\n"), sha256: sha256("the patch\n") } } });
  archive(OTHER, "other archive");
  put(HISTORY, `${JSON.stringify(history(), null, 2)}\n`);
  git("add", "-A");
  assert.equal(gate("--update").code, 0);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};

describe("the gate on a scratch repository", () => {
  test("consistent records pass, with and without --base", () => {
    git("checkout", "-q", "-f", "main");
    assert.equal(gate("--base", "main").code, 0, gate("--base", "main").out);
    assert.equal(gate().code, 0, gate().out);
    assert.deepEqual(vendoredProvenanceProblems(repo), []);
  });

  const cases: Array<{ name: string; mutate: () => void; expect: RegExp[] }> = [
    { name: "an archive that changed while its records did not", mutate: () => put(CURRENT, "a longer archive"), expect: [/current\.tgz\.sha256 says/, /artifact\.bytes is 15, the archive has 16/, /artifact\.sha256 is/, /artifact\.integrity does not match/] },
    { name: "an archive without a .sha256", mutate: () => drop(`${CURRENT}.sha256`), expect: [/no prologue-sdk-0\.0\.0-rc\.1-current\.tgz\.sha256 beside it/] },
    { name: "an archive in another vendor folder without a .sha256", mutate: () => drop(`${OTHER}.sha256`), expect: [/vendor\/other\/other-1\.0\.0\.tgz: no other-1\.0\.0\.tgz\.sha256 beside it/] },
    { name: "an archive without provenance", mutate: () => drop(`${CURRENT}.provenance.json`), expect: [/no prologue-sdk-0\.0\.0-rc\.1-current\.tgz\.provenance\.json beside it/] },
    { name: "a new archive that brings no records at all", mutate: () => put("vendor/new/new-2.0.0.tgz", "new"), expect: [/new-2\.0\.0\.tgz: no new-2\.0\.0\.tgz\.sha256/, /new-2\.0\.0\.tgz: no new-2\.0\.0\.tgz\.provenance\.json/] },
    { name: "a .sha256 that names another file", mutate: () => put(`${OTHER}.sha256`, `${sha256("other archive")}  renamed.tgz\n`), expect: [/other-1\.0\.0\.tgz\.sha256 says/] },
    { name: "provenance with another byte count", mutate: () => edit(`${CURRENT}.provenance.json`, (json) => { json.artifact.bytes += 1; }), expect: [/artifact\.bytes is 16, the archive has 15/] },
    { name: "provenance with another SHA-256", mutate: () => edit(`${CURRENT}.provenance.json`, (json) => { json.artifact.sha256 = sha256("x"); }), expect: [/artifact\.sha256 is/] },
    { name: "provenance with another integrity string", mutate: () => edit(`${CURRENT}.provenance.json`, (json) => { json.artifact.integrity = "sha512-AAAA"; }), expect: [/artifact\.integrity does not match/] },
    { name: "provenance for another file name", mutate: () => edit(`${CURRENT}.provenance.json`, (json) => { json.artifact.file = "older.tgz"; }), expect: [/artifact\.file is "older\.tgz"/] },
    { name: "provenance with a short commit", mutate: () => edit(`${CURRENT}.provenance.json`, (json) => { json.source.commit = "9fc3b173"; }), expect: [/source\.commit must be a full 40-character commit/] },
    { name: "provenance of a dirty source tree", mutate: () => edit(`${CURRENT}.provenance.json`, (json) => { json.source.dirty = true; }), expect: [/source\.dirty must be false/] },
    { name: "provenance that is not JSON", mutate: () => put(`${CURRENT}.provenance.json`, "{"), expect: [/provenance\.json: not readable JSON/] },
    { name: "records left behind by a replaced package", mutate: () => drop(OTHER), expect: [/other-1\.0\.0\.tgz\.sha256: its archive is gone/, /other-1\.0\.0\.tgz\.provenance\.json: its archive is gone/] },
    { name: "an alternative patch that was deleted without the sentence", mutate: () => drop(PATCH), expect: [/alsoBuildableFrom\.patch names "current\.patch", which is not in the folder/] },
    { name: "an alternative patch with other bytes", mutate: () => put(PATCH, "a different patch\n"), expect: [/alsoBuildableFrom\.patch current\.patch has other bytes or SHA-256/] },
    { name: "a patch history of another schema", mutate: () => edit(HISTORY, (json) => { json.schema = "v0"; }), expect: [/schema must be prologue-sdk-patch-history-v1/] },
    { name: "a patch history that is not JSON", mutate: () => put(HISTORY, "["), expect: [/patch-history\.json: not readable JSON/] },
    { name: "a recorded patch without a SHA-256", mutate: () => edit(HISTORY, (json) => { json.patches[0].sha256 = "abc"; }), expect: [/patches\[0\]\.sha256 must be 64 hex characters/] },
    { name: "a recorded patch without its git blob", mutate: () => edit(HISTORY, (json) => { delete json.patches[1].gitBlob; }), expect: [/patches\[1\]\.gitBlob must be 40 hex characters/] },
    { name: "a recorded patch without a base", mutate: () => edit(HISTORY, (json) => { json.patches[0].base = "a7e785b8"; }), expect: [/patches\[0\]\.base must be a full 40-character commit/] },
    { name: "a recorded patch listed twice", mutate: () => edit(HISTORY, (json) => { json.patches[1].file = "one.patch"; }), expect: [/patches\[1\]\.file one\.patch appears twice/] },
    { name: "a recorded patch with an unknown source kind", mutate: () => edit(HISTORY, (json) => { json.patches[0].sourceKind = "somewhere"; }), expect: [/patches\[0\]\.sourceKind must be one of/] },
    { name: "a recorded work-tree patch that names a commit", mutate: () => edit(HISTORY, (json) => { json.patches[1].commit = COMMIT_B; }), expect: [/patches\[1\]\.commit must be set exactly for the sourceKind upstream-commit/] },
    { name: "a recorded upstream-commit patch without its commit", mutate: () => edit(HISTORY, (json) => { json.patches[0].commit = null; }), expect: [/patches\[0\]\.commit must be set exactly for the sourceKind upstream-commit/] },
    { name: "a recorded patch without a source", mutate: () => edit(HISTORY, (json) => { json.patches[0].source = " "; }), expect: [/patches\[0\]\.source must say where the patch came from/] },
    { name: "a commit the upstream check does not list", mutate: () => edit(HISTORY, (json) => { json.patches[0].commit = "e".repeat(40); }), expect: [/patches\[0\]\.commit names e{40}, which upstream\.commitsChecked does not list/] },
    { name: "a package record without bytes", mutate: () => edit(HISTORY, (json) => { json.patches[0].package.bytes = 0; }), expect: [/patches\[0\]\.package\.bytes must be a positive integer/] },
    { name: "a package recorded twice", mutate: () => edit(HISTORY, (json) => { json.packagesWithoutPatch[0].file = "one.tgz"; }), expect: [/packagesWithoutPatch\[0\]\.file one\.tgz appears twice/] },
    { name: "a tgz-less package without a commit", mutate: () => edit(HISTORY, (json) => { delete json.packagesWithoutPatch[0].commit; }), expect: [/packagesWithoutPatch\[0\]\.commit must be a full 40-character commit/] },
    { name: "an empty upstream check", mutate: () => edit(HISTORY, (json) => { json.upstream.commitsChecked = []; }), expect: [/upstream\.commitsChecked must list full 40-character commits/] },
    { name: "a deleted patch that comes back", mutate: () => put("vendor/prologue-sdk/two.patch", "back"), expect: [/two\.patch is recorded as deleted but is back in vendor\/prologue-sdk\//] },
  ];
  for (const { name, mutate, expect } of cases) {
    test(`fails on ${name}`, () => {
      branch("mutation", mutate);
      const attempt = gate("--base", "main");
      assert.equal(attempt.code, 1, attempt.out);
      for (const pattern of expect) assert.match(attempt.out, pattern);
    });
  }

  test("rewriting the baseline on the branch does not hide it, and the quick check without --base fails too", () => {
    branch("laundering", () => put(CURRENT, "a longer archive"));
    // The rule is an invariant of the tree, not a count: --update only rewrites counts.
    gate("--update");
    const again = gate("--base", "main");
    assert.equal(again.code, 1, again.out);
    assert.match(again.out, /current\.tgz\.sha256 says/);
    const quick = gate();
    assert.equal(quick.code, 1, quick.out);
    assert.match(quick.out, /current\.tgz\.sha256 says/);
  });

  test("a repository without any vendored archive or patch history has nothing to complain about", () => {
    branch("empty", () => { rmSync(path.join(repo, "vendor"), { recursive: true, force: true }); });
    assert.deepEqual(vendoredProvenanceProblems(repo), []);
  });
});

describe("the records of this repository", () => {
  const file = (relative: string) => readFileSync(path.join(repoRoot, relative), "utf8");
  const json = (relative: string) => JSON.parse(file(relative));
  const folder = "vendor/prologue-sdk";
  const current = "prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz";

  test("every vendored archive matches its .sha256 and provenance", () => {
    assert.deepEqual(vendoredProvenanceProblems(repoRoot), []);
  });

  test("the current Prologue package is the one agent-host depends on, built from a recorded upstream commit without a patch", () => {
    const provenance = json(`${folder}/${current}.provenance.json`);
    assert.equal(provenance.artifact.file, current);
    assert.equal(json("horizontal/agent-host/package.json").dependencies["@prologue/sdk"], `file:../../${folder}/${current}`);
    assert.equal(provenance.source.commit, "9fc3b17386419625a36359b74fb4789c17a3adc8");
    assert.deepEqual(provenance.source.patches, []);
    assert.equal(provenance.source.dirty, false);
  });

  test("only the patch the provenance names is left in vendor/prologue-sdk", () => {
    const named = json(`${folder}/${current}.provenance.json`).alsoBuildableFrom?.patch?.file;
    const patches = readdirSync(path.join(repoRoot, folder)).filter((name) => name.endsWith(".patch"));
    assert.deepEqual(patches, named ? [named] : []);
  });

  test("patch-history.json holds the 25 deleted patches and the 9 packages that never had one", () => {
    const record = json(`${folder}/patch-history.json`);
    assert.equal(record.patches.length, 25);
    assert.equal(record.packagesWithoutPatch.length, 9);
    assert.equal(record.patches.reduce((sum: number, patch: { bytes: number }) => sum + patch.bytes, 0), 2_566_805);
    const kinds = record.patches.reduce((count: Record<string, number>, patch: { sourceKind: string }) => ({ ...count, [patch.sourceKind]: (count[patch.sourceKind] ?? 0) + 1 }), {});
    assert.deepEqual(kinds, { "upstream-commit": 7, "uncommitted-worktree": 17, "molis-repo": 1 });
    // Every patch made a package; the one the old README had no hash for (network-dispatch) is recorded with the hash its
    // README carried at d4a2f41b, which is also the SHA-256 of the tgz blob in that commit.
    const networkDispatch = record.patches.find((patch: { file: string }) => patch.file === "network-dispatch.patch");
    assert.equal(networkDispatch.package.sha256, "7ee09e00ef074b761c0d44a86a7d357e11485ea26868f3e77fb99ed757ae384e");
    assert.equal(networkDispatch.package.file, "prologue-sdk-0.0.0-rc.1-network-dispatch.tgz");
    assert.equal(record.upstream.commitsChecked.length, 19);
    for (const patch of record.patches) assert.ok(!existsSync(path.join(repoRoot, folder, patch.file)), patch.file);
  });

  test("the README states what the records hold and no longer carries what they showed to be false", () => {
    const readme = file(`${folder}/README.md`);
    const record = json(`${folder}/patch-history.json`);
    assert.ok(readme.includes("25 份补丁（合计 2,566,805 字节）"));
    assert.ok(readme.includes(`记录里写到的每个 Prologue 提交（${record.upstream.commitsChecked.length} 个）`));
    assert.ok(readme.includes(`\`${record.upstream.mainHead.slice(0, 8)}\``));
    assert.ok(readme.includes(json(`${folder}/${current}.provenance.json`).source.commit));
    // Statements the dependency plan (specs/repository-anti-corruption/dependencies-and-sdk-plan.md §4.1) showed to be wrong:
    // the source commits are pushed (merged upstream as PR #3), the network-dispatch hash was recorded.
    assert.doesNotMatch(readme, /暂未推到|没有推到 molis-ai\/prologue|当时没有记录|未记录/);
    assert.doesNotMatch(readme, /最后一次含有它们的提交/);
    assert.doesNotMatch(file("specs/BACKLOG.md"), /^\| BL-024 \|/m);
  });
});
