import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { mergeJsonText } from "../scripts/merge-drivers/json-merge.mjs";
import { ARRAY_IDENTITIES, stepsFor } from "../scripts/merge-drivers/rules.mjs";

// The merge drivers of `.gitattributes` (docs/system/PARALLEL-DEVELOPMENT.md §2.1): the JSON tables and dictionaries merge by key in
// the file's own layout, a key given two values is still a conflict, a generated snapshot takes the incoming side and is listed for
// `pnpm merge:regenerate`, and a failing driver ends as git's own line merge. The first half merges the repository's real files in
// memory; the second runs git on a scratch repository with the drivers registered by scripts/setup-merge-drivers.mjs.
const root = fileURLToPath(new URL("..", import.meta.url));
const real = (file: string) => readFileSync(path.join(root, file), "utf8");
const scratch = mkdtempSync(path.join(tmpdir(), "molis-merge-drivers-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const ok = (result: ReturnType<typeof mergeJsonText>) => {
  assert.ok("text" in result && typeof result.text === "string", `a clean merge, not conflicts at ${"conflicts" in result ? result.conflicts?.join(", ") : ""}`);
  return result.text as string;
};
const insertAfter = (object: Record<string, unknown>, anchor: string, key: string, value: unknown) =>
  Object.fromEntries(Object.entries(object).flatMap(entry => entry[0] === anchor ? [entry, [key, value]] : [entry]));

test("a locale dictionary: keys added and changed on different sides merge into JSON.stringify's own layout", () => {
  const baseText = real("apps/workbench/resources/locales/zh.json");
  const base = JSON.parse(baseText) as { messages: Record<string, unknown> };
  const keys = Object.keys(base.messages);
  const ours = { ...base, messages: insertAfter(base.messages, keys[10]!, "common.zz-merge-test.ours", "我们加的") };
  const theirs = { ...base, messages: { ...insertAfter(base.messages, keys[4000]!, "workbench.zz-merge-test.theirs", "他们加的"), [keys[20]!]: "他们改的" } };
  const stringify = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const merged = ok(mergeJsonText(baseText, stringify(ours), stringify(theirs)));
  const expected = { ...ours, messages: { ...insertAfter(ours.messages, keys[4000]!, "workbench.zz-merge-test.theirs", "他们加的"), [keys[20]!]: "他们改的" } };
  assert.equal(merged, stringify(expected), "byte for byte what JSON.stringify writes for the merged dictionary, keys in place");
});

test("a key given two different values is a conflict, and so is an array both sides changed", () => {
  const base = `{\n  "a": 1,\n  "list": [1, 2],\n  "b": { "c": 1 }\n}\n`;
  const sameKey = mergeJsonText(base, base.replace(`"a": 1`, `"a": 2`), base.replace(`"a": 1`, `"a": 3`));
  assert.deepEqual("conflicts" in sameKey && sameKey.conflicts, ["a"]);
  const nested = mergeJsonText(base, base.replace(`"c": 1`, `"c": 2`), base.replace(`"c": 1`, `"c": 3`));
  assert.deepEqual("conflicts" in nested && nested.conflicts, ["b.c"]);
  const arrays = mergeJsonText(base, base.replace("[1, 2]", "[1, 2, 3]"), base.replace("[1, 2]", "[0, 1, 2]"));
  assert.deepEqual("conflicts" in arrays && arrays.conflicts, ["list"], "an array without declared identities is not merged");
  const deleted = mergeJsonText(base, base.replace(`  "a": 1,\n`, ""), base.replace(`"a": 1`, `"a": 5`));
  assert.deepEqual("conflicts" in deleted && deleted.conflicts, ["a"], "deleted on one side and changed on the other");
  const both = ok(mergeJsonText(base, base.replace(`"a": 1`, `"a": 2`), base.replace(`"a": 1`, `"a": 2`).replace(`"c": 1`, `"c": 4`)));
  assert.equal(both, `{\n  "a": 2,\n  "list": [1, 2],\n  "b": { "c": 4 }\n}\n`, "the same change on both sides is no conflict; an inline object stays inline");
});

test("hand-laid tables keep their layout: error owners, version exceptions, versions.json carriers and the Goals golden record", () => {
  const owners = real("tooling/gates/error-owners.json");
  const oursOwners = owners.replace(`  "owners": {\n`, `  "owners": {\n    "zz_ours": {\n      "paths": ["apps/zz-ours/"],\n      "reason": "ours"\n    },\n`);
  const theirsOwners = owners.replace(`"paths": ["horizontal/appearance/"]`, `"paths": ["horizontal/appearance/", "apps/zz-theirs.ts"]`);
  const mergedOwners = ok(mergeJsonText(owners, oursOwners, theirsOwners, { identities: ARRAY_IDENTITIES["tooling/gates/error-owners.json"] }));
  assert.equal(mergedOwners, oursOwners.replace(`"paths": ["horizontal/appearance/"]`, `"paths": ["horizontal/appearance/", "apps/zz-theirs.ts"]`),
    "the new owner and the new path both land, every other byte as it was");

  const exceptions = real("tooling/gates/version-exceptions.json");
  const row = (file: string) => `  {\n    "file": "${file}",\n    "name": "version",\n    "values": { "1": 1 },\n    "reason": "test"\n  }`;
  const append = (file: string) => exceptions.replace(/\n\]\n$/, `,\n${row(file)}\n]\n`);
  const mergedExceptions = ok(mergeJsonText(exceptions, append("ours.ts"), append("theirs.ts"), { identities: ARRAY_IDENTITIES["tooling/gates/version-exceptions.json"] }));
  assert.equal(mergedExceptions, exceptions.replace(/\n\]\n$/, `,\n${row("ours.ts")},\n${row("theirs.ts")}\n]\n`), "rows both sides appended are both kept, ours first");
  const twice = mergeJsonText(exceptions, append("same.ts"), append("same.ts").replace(`"reason": "test"`, `"reason": "other"`),
    { identities: ARRAY_IDENTITIES["tooling/gates/version-exceptions.json"] });
  assert.ok("conflicts" in twice && twice.conflicts?.length, "one row (file and name) given two reasons is a conflict");

  const versions = real("tooling/versions.json");
  const parsed = JSON.parse(versions) as { versions: Record<string, number>; carriers: unknown[] };
  const carrier = (key: string) => ({ file: `prompts/${key}.md`, key, pattern: "(^version: )\\d+()" });
  const stringify = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const oursVersions = { ...parsed, versions: { ...parsed.versions, "prompt.zz-ours": 1 }, carriers: [...parsed.carriers, carrier("prompt.zz-ours")] };
  const theirsVersions = { ...parsed, versions: { ...parsed.versions, "prompt.zz-theirs": 1 }, carriers: [...parsed.carriers, carrier("prompt.zz-theirs")] };
  const mergedVersions = ok(mergeJsonText(versions, stringify(oursVersions), stringify(theirsVersions), { identities: ARRAY_IDENTITIES["tooling/versions.json"] }));
  assert.equal(mergedVersions, stringify({ ...parsed, versions: { ...oursVersions.versions, "prompt.zz-theirs": 1 }, carriers: [...oursVersions.carriers, carrier("prompt.zz-theirs")] }));

  const golden = real("tests/fixtures/goals-page-golden/golden.json");
  const record = JSON.parse(golden) as Record<string, { sha256: string; length: number }>;
  const names = Object.keys(record);
  const change = (name: string, length: number) => `${JSON.stringify({ ...record, [name]: { ...record[name]!, length } }, null, 1)}\n`;
  assert.equal(`${JSON.stringify(record, null, 1)}\n`, golden, "the record is written with one space");
  const mergedGolden = ok(mergeJsonText(golden, change(names[0]!, 1), change(names[1]!, 2)));
  assert.equal(mergedGolden, `${JSON.stringify({ ...record, [names[0]!]: { ...record[names[0]!]!, length: 1 }, [names[1]!]: { ...record[names[1]!]!, length: 2 } }, null, 1)}\n`,
    "neighbouring records changed on different sides (the zh and en of one page) merge; one record changed on both stays a conflict");
});

test("new keys both sides add after the same key come out in name order", () => {
  const base = `{\n  "a": 1,\n  "m": 1\n}\n`;
  const merged = ok(mergeJsonText(base, `{\n  "a": 1,\n  "b": 1,\n  "d": 1,\n  "m": 1\n}\n`, `{\n  "a": 1,\n  "c": 1,\n  "m": 1\n}\n`));
  assert.equal(merged, `{\n  "a": 1,\n  "b": 1,\n  "c": 1,\n  "d": 1,\n  "m": 1\n}\n`);
});

test("the regeneration steps: versions before the build, the build before the action and library snapshots", () => {
  const ids = (files: string[]) => stepsFor(files).map((step: { id: string }) => step.id);
  assert.deepEqual(ids(["tooling/gates/api/plugin-sdk/index.txt"]), ["api"], "the API snapshot reads the source and needs no build");
  assert.deepEqual(ids(["tooling/gates/actions/actions.tsv", "tooling/versions.json"]), ["versions", "build", "actions"]);
  assert.deepEqual(ids(["tooling/gates/schemas/stores.tsv", "tooling/gates/api/contracts/platform/plugin.txt"]), ["build", "api", "schemas"]);
  assert.deepEqual(ids(["apps/workbench/resources/locales/zh.json"]), []);
  const scripts = JSON.parse(real("package.json")).scripts as Record<string, string>;
  for (const step of stepsFor(["tooling/versions.json", "tooling/gates/api/x.txt", "tooling/gates/actions/actions.tsv", "tooling/gates/schemas/stores.tsv"])) {
    assert.equal(step.command[0], "pnpm");
    assert.ok(scripts[step.command[1]!], `package.json has the script ${step.command[1]}`);
  }
  assert.equal(scripts.prepare, "node scripts/setup-merge-drivers.mjs", "pnpm install registers the drivers");
});

// A scratch repository with this checkout's drivers, .gitattributes and setup script, and no global or system git config.
const repo = path.join(scratch, "repo");
const env = { ...process.env, GIT_CONFIG_GLOBAL: path.join(scratch, "no-global-config"), GIT_CONFIG_NOSYSTEM: "1", MOLIS_MERGE_DRIVER_CRASH: "" };
const git = (args: string[], cwd = repo, extra: Record<string, string> = {}) =>
  spawnSync("git", ["-c", "user.name=merge", "-c", "user.email=merge@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, env: { ...env, ...extra }, encoding: "utf8" });
const must = (args: string[], cwd = repo) => { const run = git(args, cwd); assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`); return run.stdout; };
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const listFile = () => path.resolve(repo, must(["rev-parse", "--git-path", "molis-merge-regenerate"]).trim());

/** Commit `ours` on main and `theirs` on a side branch, both from `base`, then merge the side branch into main from `cwd`. */
const mergeCase = (name: string, file: string, base: string, ours: string, theirs: string, cwd = repo, extra: Record<string, string> = {}) => {
  must(["checkout", "-q", "main"]);
  put(file, base); must(["add", "-A"]); must(["commit", "-qm", `${name} base`]);
  must(["checkout", "-qb", name]);
  put(file, theirs); must(["commit", "-qam", `${name} theirs`]);
  must(["checkout", "-q", "main"]);
  put(file, ours); must(["commit", "-qam", `${name} ours`]);
  return git(["merge", "--no-edit", name], cwd, extra);
};
const finish = (merge: ReturnType<typeof git>) => { if (merge.status !== 0) { must(["merge", "--abort"]); } };

test("in a git repository: setup registers the drivers once, outside one it does nothing and still exits 0", () => {
  mkdirSync(repo, { recursive: true });
  must(["init", "-q", "-b", "main"]);
  for (const file of [".gitattributes", "scripts/setup-merge-drivers.mjs", "scripts/script-paths.mjs", "scripts/regenerate-after-merge.mjs",
    "scripts/merge-drivers/driver.mjs", "scripts/merge-drivers/json-merge.mjs", "scripts/merge-drivers/rules.mjs"]) {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    copyFileSync(path.join(root, file), path.join(repo, file));
  }
  must(["add", "-A"]); must(["commit", "-qm", "drivers"]);
  const setup = () => execFileSync(process.execPath, ["scripts/setup-merge-drivers.mjs"], { cwd: repo, env, encoding: "utf8" });
  assert.match(setup(), /registered molis-json and molis-snapshot/);
  assert.equal(setup(), "", "a second run changes nothing and says nothing");
  assert.match(must(["config", "--get", "merge.molis-json.driver"]), /^node scripts\/merge-drivers\/driver\.mjs json %O %A %B %L %P/);
  assert.equal(spawnSync(process.execPath, ["scripts/setup-merge-drivers.mjs", "--check"], { cwd: repo, env }).status, 0);
  const outside = path.join(scratch, "outside");
  mkdirSync(outside);
  const away = spawnSync(process.execPath, [path.join(repo, "scripts/setup-merge-drivers.mjs")], { cwd: outside, env, encoding: "utf8" });
  assert.equal(away.status, 0, "an install outside a checkout is not failed");
  assert.match(away.stdout, /not a git checkout/);
});

test("in a git repository: different keys merge cleanly, from a subdirectory too; one key with two values stops with markers", () => {
  const base = `{\n  "format_version": 1,\n  "messages": {\n    "a.one": "一",\n    "a.two": "二"\n  }\n}\n`;
  const ours = base.replace(`"a.one": "一",\n`, `"a.one": "一",\n    "a.one-and-half": "一点五",\n`);
  const theirs = base.replace(`"a.two": "二"\n`, `"a.two": "二",\n    "a.three": "三"\n`);
  mkdirSync(path.join(repo, "docs"), { recursive: true });
  const clean = mergeCase("locale", "plugins/x/locales/zh.json", base, ours, theirs, path.join(repo, "docs"));
  assert.equal(clean.status, 0, `merged without a conflict: ${clean.stderr}${clean.stdout}`);
  assert.equal(read("plugins/x/locales/zh.json"), `{\n  "format_version": 1,\n  "messages": {\n    "a.one": "一",\n    "a.one-and-half": "一点五",\n    "a.two": "二",\n    "a.three": "三"\n  }\n}\n`);

  const conflict = mergeCase("same-key", "plugins/x/locales/en.json", base, base.replace("一", "one"), base.replace("一", "uno"));
  assert.notEqual(conflict.status, 0, "git reports the conflict");
  assert.match(conflict.stdout, /CONFLICT \(content\)/);
  const text = read("plugins/x/locales/en.json");
  assert.match(text, /^<<<<<<< /m);
  assert.match(text, /"a\.one": "one"/);
  assert.match(text, /"a\.one": "uno"/);
  assert.match(text, /^>>>>>>> /m);
  finish(conflict);
});

test("in a git repository: a snapshot takes the incoming side, is listed, and the regeneration command reads the list", () => {
  rmSync(listFile(), { force: true });
  const base = "# header\na\tb\n";
  const merge = mergeCase("snapshot", "tooling/gates/actions/actions.tsv", base, `${base}ours\t1\n`, `${base}theirs\t1\n`);
  assert.equal(merge.status, 0, `the merge completes: ${merge.stderr}`);
  assert.equal(read("tooling/gates/actions/actions.tsv"), `${base}theirs\t1\n`, "the incoming side, to be regenerated");
  assert.match(merge.stderr, /took the incoming side; it is stale until `pnpm merge:regenerate`/);
  assert.equal(readFileSync(listFile(), "utf8"), "tooling/gates/actions/actions.tsv\n");
  const dry = execFileSync(process.execPath, ["scripts/regenerate-after-merge.mjs", "--dry-run"], { cwd: repo, env, encoding: "utf8" });
  assert.match(dry, /tooling\/gates\/actions\/actions\.tsv/);
  assert.match(dry, /\$ pnpm build\n\$ pnpm actions:update\n/);
  assert.ok(existsSync(listFile()), "a dry run keeps the list");
});

test("in a git repository: a driver that fails ends as git's own merge, markers and both sides intact, nothing half written", () => {
  const base = `{\n  "a": 1,\n  "b": 2\n}\n`;
  const crashed = mergeCase("crash", "tooling/versions.json", base, base.replace(`"a": 1`, `"a": 10`), base.replace(`"a": 1`, `"a": 20`), repo,
    { MOLIS_MERGE_DRIVER_CRASH: "tooling/versions.json" });
  assert.notEqual(crashed.status, 0);
  assert.match(crashed.stderr, /crash requested by the test; falling back to git's line merge/);
  const text = read("tooling/versions.json");
  assert.match(text, /<<<<<<< [^\n]*\n {2}"a": 10,\n=======\n {2}"a": 20,\n>>>>>>> /, "the usual markers around the two sides");
  assert.match(text, /\n {2}"b": 2\n\}\n$/, "the rest of the file as it was");
  finish(crashed);

  const unreadable = "{\n  \"a\": 1,\n  \"x\": 0,\n  \"y\": 0,\n  \"b\": 2,\n}\n"; // a trailing comma: not JSON, so the driver refuses it
  const broken = mergeCase("broken", "tooling/gates/error-owners.json", unreadable, unreadable.replace(`"a": 1`, `"a": 3`), unreadable.replace(`"b": 2`, `"b": 4`));
  assert.equal(broken.status, 0, "lines that do not touch merge as git would merge them without a driver");
  assert.match(broken.stderr, /falling back to git's line merge/);
  assert.equal(read("tooling/gates/error-owners.json"), unreadable.replace(`"a": 1`, `"a": 3`).replace(`"b": 2`, `"b": 4`));
});
