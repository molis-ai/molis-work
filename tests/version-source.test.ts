import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { computeVersions, generateVersions, isTestFile, readSourceFiles, readVersionInputs, SOURCE_ROOTS, versionSource } from "../scripts/generate-versions.mjs";
import { applyExceptions, checkExceptions, manifestFindings, markdownFindings, registeredFactProblems, sourceDeclarationFindings, strayMarkerFindings, versionDeclarationProblems } from "../scripts/gates/version-declarations.mjs";

// N34-VS-01 to 04 (specs/post-anticorruption-roadmap/reference/batches/02.md): tooling/versions.json is the one hand-edited
// source. The real tree is checked as it is, and each way of bypassing the source is checked on the smallest input that shows it.
const repository = fileURLToPath(new URL("..", import.meta.url));
const generator = fileURLToPath(new URL("../scripts/generate-versions.mjs", import.meta.url));
const scratch: string[] = [];
after(() => { for (const directory of scratch) rmSync(directory, { recursive: true, force: true }); });

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "version-source-"));
  scratch.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}
const source = (versions: Record<string, string | number>, carriers: object[] = [], extra: object = {}) => JSON.stringify({ versions, carriers, ...extra });
const generate = (root: string, mode: "--write" | "--check") => spawnSync(process.execPath, [generator, "--root", root, mode], { encoding: "utf8" });
const findings = (file: string, text: string, versions: Record<string, string | number> = {}): string[] =>
  sourceDeclarationFindings(file, text, versions).map((finding: { text: string }) => finding.text);
const FILE = "packages/example/src/store.ts";

// ---- N34-VS-01: one hand-edited source, and declaration and consumer agree ------------------------------------------------
test("N34-VS-01 every marker and carrier in the real tree names an entry, and every entry is used", () => {
  const real = versionSource(repository);
  const { outputs, problems, used } = computeVersions(real, readVersionInputs(repository, real));
  assert.deepEqual(problems, []);
  assert.deepEqual([...outputs.keys()], [], "the tree is what the source says");
  assert.equal(used.size, Object.keys(real.versions).length);
});

test("N34-VS-01 the real tree has no declaration bypassing the source, and the registered actions and scenes equal their entries", () => {
  assert.deepEqual(versionDeclarationProblems(repository), []);
});

test("N34-VS-01 a registered row and its entry have to agree, in both directions", () => {
  const actions = "# comment\ncapability_id\tversion\tprovider\ngoals.create\t1\tgoals\nfeed.content.read\t1\tfeed\n";
  const hostActions = "sdk.artifacts.plugin-install-abc.read\t1\tsdk\nscenes.enable:home.dock\t1\tsystem\n";
  const hostScenes = "home.dock\t1\tsystem.home\n";
  const versions = { "action.goals.create": 1, "protocol.workflow-content.read": 1, "action-family.sdk.artifacts.read": 1, "scene.home.dock": 1 };
  const check = (changed: Record<string, number>, entries: object[] = []) => registeredFactProblems({ ...versions, ...changed }, { actions, hostActions, hostScenes }, entries);
  assert.deepEqual(check({}), []);
  assert.deepEqual(check({ "action.goals.create": 2 }), ["tooling/gates/actions/actions.tsv: goals.create@1 but action.goals.create is 2"]);
  assert.deepEqual(check({ "protocol.workflow-content.read": 2 }), ["tooling/gates/actions/actions.tsv: feed.content.read@1 but protocol.workflow-content.read is 2"]);
  assert.deepEqual(check({ "action-family.sdk.artifacts.read": 3 }), ["tooling/gates/actions/host-actions.tsv: sdk.artifacts.plugin-install-abc.read@1 but action-family.sdk.artifacts.read is 3"]);
  assert.deepEqual(check({ "scene.home.dock": 4 }), [
    "tooling/gates/actions/host-actions.tsv: scenes.enable:home.dock@1 but scene.home.dock is 4",
    "tooling/gates/actions/host-scenes.tsv: home.dock@1 but scene.home.dock is 4",
  ]);
  assert.deepEqual(check({ "action.todo.items.list": 1 }), ["tooling/versions.json: action.todo.items.list has no registered row in tooling/gates/actions/"]);
  assert.deepEqual(check({ "action.todo.items.list": 1 }, [{ entry: "action.todo.items.list", reason: "registered elsewhere" }]), []);
  assert.deepEqual(registeredFactProblems({}, { actions: "goals.create\t1\tgoals\n" }), ["tooling/gates/actions/actions.tsv: goals.create@1 has no action.goals.create entry"]);
  assert.deepEqual(check({}, [{ entry: "action.goals.create", reason: "stale" }]), ["tooling/gates/version-exceptions.json: entry action.goals.create excepts nothing any more"]);
  assert.deepEqual(check({}, [{ row: "gone.row", reason: "stale" }]), ["tooling/gates/version-exceptions.json: row gone.row excepts nothing any more"]);
});

// ---- N34-VS-02: one entry moves its consumers and nothing else --------------------------------------------------------------
function move(key: string, value: string | number) {
  const real = versionSource(repository), files = readVersionInputs(repository, real);
  const { outputs, problems } = computeVersions({ ...real, versions: { ...real.versions, [key]: value } }, files);
  assert.deepEqual(problems, []);
  return { real, files, outputs };
}

test("N34-VS-02 an action entry moves exactly the files that consume it, and only that number", () => {
  const { files, outputs } = move("action.goals.create", 7);
  const consumers = [...files].filter(([, text]) => text.includes("@version action.goals.create ")).map(([file]) => file).sort();
  assert.ok(consumers.includes("plugins/native/goals/src/contract/goal-entry-actions.ts"), consumers.join());
  assert.ok(consumers.includes("plugins/native/feed/src/item-actions.ts"), "Feed's reference to Goals follows the entry");
  assert.deepEqual([...outputs.keys()].sort(), consumers);
  for (const [file, output] of outputs) {
    assert.ok(output.includes("/* @version action.goals.create */ 7"), file);
    assert.equal(output.replaceAll("/* @version action.goals.create */ 7", "/* @version action.goals.create */ 1"), files.get(file), `${file}: nothing else changed`);
  }
});

test("N34-VS-02 the product entry moves every carrier and marked Manifest, and no other number", () => {
  const { real, files, outputs } = move("product.release", "9.9.9");
  const changed = [...outputs.keys()];
  for (const file of ["package.json", "apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/src-tauri/Cargo.toml", "apps/desktop/src-tauri/Cargo.lock",
    "apps/local-host/src/product-version.ts", "plugins/native/goals/src/manifest.ts"]) assert.ok(changed.includes(file), file);
  const current = real.versions["product.release"] as string;
  for (const [file, output] of outputs) {
    assert.equal(output.replaceAll("9.9.9", current), files.get(file), `${file}: only the product version changed`);
  }
  assert.match(outputs.get("apps/desktop/src-tauri/Cargo.lock")!, /name = "molis-work-desktop"\nversion = "9\.9\.9"/);
  assert.equal(JSON.parse(outputs.get("package.json")!).version, "9.9.9");
});

test("N34-VS-02 a method carrier moves that method's frontmatter and leaves its body alone", () => {
  const { files, outputs } = move("method.goals.domain-app-product", 3);
  const file = "plugins/native/goals/methods/domains/domain-app-product.md";
  assert.deepEqual([...outputs.keys()], [file]);
  assert.equal(outputs.get(file)!.replace(/^version: 3$/m, "version: 1"), files.get(file));
});

test("N34-VS-02 a key stays with its own pattern: a string that carries a version follows it", () => {
  const { outputs } = move("contract.io.molis.work.platform.kernel", 4);
  const output = outputs.get("packages/contracts/src/platform/kernel.ts")!;
  assert.ok(output.includes('"io.molis.work.platform.kernel.v4"'));
  assert.ok(output.includes("/* @version contract.io.molis.work.platform.kernel */ 4"));
});

test("N34-VS-02 the one version Files and Git embedded pages send equals every action they can reach", () => {
  // These two build the id from the route, so one literal stands for all of them (tooling/gates/version-exceptions.json). When
  // an entry moves, this fails instead of the page asking for a version that no longer exists.
  const { versions } = versionSource(repository);
  const reached: Array<[string, string[]]> = [
    ["plugins/native/files/src/browser/request.ts", ["files.capture", "files.directory", "files.open", "files.state", "text-stats.state", "diff.state"]],
    ["plugins/native/git/src/browser/request.ts", ["git.conflict", "git.operations", "git.pr-support", "git.prepare-index", "git.prepare-operation", "git.results", "git.save-result", "git.select-diff", "git.state", "git.summary", "diff.state"]],
  ];
  for (const [file, actions] of reached) {
    const sent = Number(/capability_id: capability, version: (\d+) \}/.exec(readFileSync(path.join(repository, file), "utf8"))?.[1]);
    assert.deepEqual(actions.filter(id => versions[`action.${id}`] !== sent), [], file);
  }
});

// ---- N34-VS-03: reproducible, and every way around it says so ---------------------------------------------------------------
test("N34-VS-03 regenerating changes nothing, in the real tree and a scratch one", () => {
  const check = generate(repository, "--check");
  assert.equal(check.status, 0, `${check.stdout}${check.stderr}`);
  const root = tree({
    "tooling/versions.json": source({ "format.a": 2 }, [{ file: "apps/a/data.json", key: "format.a", pattern: '("a":)\\d+()' }]),
    "apps/a/src/a.ts": "export const A_VERSION = /* @version format.a */ 1;\n",
    "apps/a/data.json": '{"a":1,"b":1}\n',
  });
  assert.equal(generate(root, "--check").status, 1);
  assert.equal(generate(root, "--write").status, 0);
  const once = [readFileSync(path.join(root, "apps/a/src/a.ts"), "utf8"), readFileSync(path.join(root, "apps/a/data.json"), "utf8")];
  assert.deepEqual(once, ["export const A_VERSION = /* @version format.a */ 2;\n", '{"a":2,"b":1}\n']);
  assert.equal(generate(root, "--check").status, 0);
  assert.equal(generate(root, "--write").status, 0);
  assert.deepEqual([readFileSync(path.join(root, "apps/a/src/a.ts"), "utf8"), readFileSync(path.join(root, "apps/a/data.json"), "utf8")], once);
});

test("N34-VS-03 a stale output is named by --check and by the build's own check", () => {
  const root = tree({ "tooling/versions.json": source({ "format.a": 2 }), "apps/a/src/a.ts": "const v = /* @version format.a */ 1;\n" });
  const result = generate(root, "--check");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Stale version outputs \(run pnpm versions:generate\):\napps\/a\/src\/a\.ts/);
  assert.deepEqual(generateVersions({ root }), ["apps/a/src/a.ts"]);
  assert.equal(readFileSync(path.join(root, "apps/a/src/a.ts"), "utf8"), "const v = /* @version format.a */ 1;\n", "checking writes nothing");
});

test("N34-VS-03 what the source cannot vouch for is refused by name", () => {
  const code = (text: string) => new Map([["apps/a/src/a.ts", text]]);
  const problems = (versions: Record<string, string | number>, text: string, carriers: object[] = [], extra: object = {}) =>
    computeVersions({ versions, carriers, ...extra }, code(text)).problems;
  assert.deepEqual(problems({}, "/* @version missing.key */ 1"), ["apps/a/src/a.ts: unknown version key missing.key"]);
  assert.deepEqual(problems({ "format.unused": 1 }, ""), ["tooling/versions.json: nothing uses format.unused"]);
  assert.deepEqual(problems({ "format.a": 1 }, "/* @version format.a */ value"), ["apps/a/src/a.ts: a @version marker is not directly before a literal", "tooling/versions.json: nothing uses format.a"]);
  assert.deepEqual(problems({ "format.a": 1 }, "", [{ file: "apps/a/src/a.ts", key: "format.a", pattern: "(nothing)\\d+()" }]), ["apps/a/src/a.ts: carrier for format.a matches nothing"]);
  assert.deepEqual(problems({ "format.a": 1 }, "x1y", [{ file: "apps/a/src/a.ts", key: "format.a", pattern: "x\\d+y" }]), ["apps/a/src/a.ts: carrier for format.a needs exactly a prefix and a suffix capture"]);
  assert.deepEqual(problems({ "format.a": 1 }, "", [{ file: "apps/a/gone.json", key: "format.a", pattern: "(a)\\d+()" }]), ["apps/a/gone.json: carrier file is missing"]);
  assert.deepEqual(problems({}, "", [], { owners: {} }), ["tooling/versions.json: unknown field owners"]);
  assert.deepEqual(problems({ "bad key": 1 }, "/* @version format.a */ 1", [], {}).slice(0, 1), ["tooling/versions.json: invalid key bad key"]);
  assert.deepEqual(problems({ "format.a": -1 }, "/* @version format.a */ 1"), ["tooling/versions.json: format.a is not a version"]);
});

test("N34-VS-03 a failed generation writes nothing, not even the files that were fine", () => {
  const stale = "const v = /* @version format.a */ 1;\n", broken = "const w = /* @version missing.key */ 1;\n";
  const root = tree({ "tooling/versions.json": source({ "format.a": 2 }), "apps/a/src/a.ts": stale, "apps/a/src/b.ts": broken });
  assert.throws(() => generateVersions({ root, write: true }), /apps\/a\/src\/b\.ts: unknown version key missing\.key/);
  assert.equal(readFileSync(path.join(root, "apps/a/src/a.ts"), "utf8"), stale);
  assert.equal(readFileSync(path.join(root, "apps/a/src/b.ts"), "utf8"), broken);
});

test("N34-VS-03 each spelling of a current version without a marker is reported", () => {
  const cases: Array<[string, string]> = [
    ["export const a = { version: 1 };", "unmanaged current version version = 1"],
    ["export const a = (capability_id: string) => ({ capability_id, version: 1 });", "unmanaged current version version = 1"],
    ["export const a = { version: 1 as const };", "unmanaged current version version = 1"],
    ["export const a = { scene_version: 1 };", "unmanaged current version scene_version = 1"],
    ["export const a = { schema_version: 3 };", "unmanaged current version schema_version = 3"],
    ["export const a = { schemaVersion: 3 };", "unmanaged current version schemaVersion = 3"],
    ["export const a = { format: 2 };", "unmanaged current version format = 2"],
    ["export const a = { schema: 2 };", "unmanaged current version schema = 2"],
    ["export const a = { v: 1 };", "unmanaged current version v = 1"],
    ["export const a = { protocol: 1 };", "unmanaged current version protocol = 1"],
    ['export const a = { version: "1.2.3" };', 'unmanaged current version version = "1.2.3"'],
    ['export const a = { version: "1" };', 'unmanaged current version version = "1"'],
    ['export const a = { schema: "reading-v1" };', 'unmanaged current version schema = "reading-v1"'],
    ["export interface A { version: 1 }", "unmanaged current version version = 1"],
    ["if (x.version !== 2) throw 0;", "unmanaged current version version = 2"],
    ["if (x.schema_version === 3) y();", "unmanaged current version schema_version = 3"],
    ["if (2 !== x.format) y();", "unmanaged current version format = 2"],
    ["export const STORE_VERSION = 1;", "unmanaged current version STORE_VERSION = 1"],
    ['export const CATALOG_VERSION = "actions/1";', 'unmanaged current version CATALOG_VERSION = "actions/1"'],
    ["export function a(version = 1) { return version; }", "unmanaged current version version = 1"],
    ["export const a = (contractVersion = 2) => contractVersion;", "unmanaged current version contractVersion = 2"],
    ['export const a = "io.molis.work.platform.kernel.v1";', 'unmanaged current version io.molis.work.platform.kernel.v1 = "io.molis.work.platform.kernel.v1"'],
    ['export const a = "connector.host.v2";', 'unmanaged current version connector.host.v2 = "connector.host.v2"'],
    ['export const a = "molis.reminders/3";', 'unmanaged current version molis.reminders/3 = "molis.reminders/3"'],
  ];
  for (const [text, expected] of cases) assert.deepEqual(findings(FILE, text), [expected], text);
});

test("N34-VS-03 what is not a current version stays quiet", () => {
  for (const text of [
    "export const a = { version: /* @version format.a */ 1 };",
    "export const a = { version: 0, artifact_version: 0 };", // 0 is "none yet"
    "export const a = (record: { version: number }) => ({ version: record.version });",
    "if (x.version < 1) throw 0;", // a bound on a revision, not a claim about the current one
    'export const a = { format: "json", schema: "text", version: "latest" };',
    "export const a = { revision: 3, title: 1 };",
    "export const VERSION = /^\\d+$/;",
    "export const NEXT_VERSION = current + 1;",
    'export const a = "molis-work-secretstore-v1";',
    "// export const a = { version: 1 };",
  ]) assert.deepEqual(findings(FILE, text), [], text);
});

test("N34-VS-03 a known action referenced by position needs its marker", () => {
  const versions = { "action.todo.organize.get": 1 };
  assert.deepEqual(findings(FILE, 'await shipped(actions, "todo.organize.get", 1, TODO);', versions), ["unmanaged reference todo.organize.get@1"]);
  assert.deepEqual(findings(FILE, 'await shipped(actions, "todo.organize.get", /* @version action.todo.organize.get */ 1, TODO);', versions), []);
  assert.deepEqual(findings(FILE, 'pad("not.an.action", 1);', versions), []);
});

test("N34-VS-03 a marker beside an id has to be that id's key", () => {
  const wrong: Array<[string, string]> = [
    ['({ capability_id: "goals.create", version: /* @version action.goals.list */ 1 });', 'wrong version key action.goals.list beside capability_id "goals.create"'],
    ['({ prompt_id: "assistant-base", version: /* @version prompt.assistant-work */ 1 });', 'wrong version key prompt.assistant-work beside prompt_id "assistant-base"'],
    ['({ role_id: "planner", version: /* @version role.reviewer */ 1 });', 'wrong version key role.reviewer beside role_id "planner"'],
    ['({ scene_id: "home.dock", version: /* @version scene.inbox.next */ 1 });', 'wrong version key scene.inbox.next beside scene_id "home.dock"'],
    ['({ capability_id: "goals.create", version: /* @version format.a */ 1 });', 'wrong version key format.a beside capability_id "goals.create"'],
    ['define("items.list", /* @version action.todo.items.get */ 1, "列出待办");', 'wrong version key action.todo.items.get beside id "items.list"'],
  ];
  for (const [text, expected] of wrong) assert.deepEqual(findings(FILE, text), [expected], text);
  for (const text of [
    '({ capability_id: "goals.create", version: /* @version action.goals.create */ 1 });',
    '({ capability_id: "items.list", version: /* @version action.todo.items.list */ 1 });', // a factory prefixes its plugin's name
    '({ capability_id: "read", version: /* @version action-family.sdk.artifacts.read */ 1 });',
    '({ prompt_id: "copilot", version: /* @version prompt.alchemist.copilot */ 1 });',
    '({ capability_id: dynamicId(), version: /* @version action-family.connector.mcp-resource */ 1 });',
    'define("items.list", /* @version action.todo.items.list */ 1, "列出待办");',
    'define("read", /* @version action-family.sdk.artifacts.read */ 1);',
  ]) assert.deepEqual(findings(FILE, text), [], text);
});

test("N34-VS-03 a hand-written copy of the removed generated file is an ordinary bypass", () => {
  assert.deepEqual(findings("plugins/native/a/src/versions.generated.ts", "export const V_FORMAT_A_VERSION = 1;"), ["unmanaged current version V_FORMAT_A_VERSION = 1"]);
});

test("N34-VS-03 only real tests and fixtures are out of scope: src/fixtures ships, so it is scanned", () => {
  for (const file of ["tests/a.test.ts", "plugins/native/a/tests/fixtures/b.ts", "apps/a/test/b.ts", "apps/a/fixtures/b.mjs", "apps/a/b.test.mjs", "apps/a/test.mjs"]) assert.equal(isTestFile(file), true, file);
  for (const file of ["plugins/native/a/src/fixtures/b.ts", "plugins/native/a/src/deep/fixtures/b.ts", "plugins/native/a/src/testing.ts", "apps/sync-worker/testing.mjs"]) assert.equal(isTestFile(file), false, file);
  const root = tree({
    "tooling/versions.json": source({}),
    "plugins/native/a/src/fixtures/b.ts": "export const b = { version: 1 };\n",
    "plugins/native/a/tests/fixtures/c.ts": "export const c = { version: 1 };\n",
  });
  const problems = versionDeclarationProblems(root);
  assert.ok(problems.includes("plugins/native/a/src/fixtures/b.ts:1: unmanaged current version version = 1"), problems.join("\n"));
  assert.ok(!problems.some((problem: string) => problem.includes("tests/fixtures")), problems.join("\n"));
});

test("N34-VS-03 a marker in a language the generator does not read is reported, because it would never move", () => {
  const message = "@version marker in a file the generator does not read: add a carrier in tooling/versions.json";
  assert.deepEqual(strayMarkerFindings("server/src/sync/quota.rs", 'row["version"] == /* @version remote.sync.d1-schema */ 6').map((finding: { text: string }) => finding.text), [message]);
  assert.deepEqual(strayMarkerFindings("server/src/sync/quota.rs", 'row["version"] == 6'), []);
  const root = tree({ "tooling/versions.json": source({}), "server/src/a.rs": "let v = /* @version x.y */ 1;\n", "server/migrations/a.sql": "-- nothing here\n" });
  assert.ok(versionDeclarationProblems(root).includes(`server/src/a.rs:1: ${message}`));
});

test("N34-VS-03 a method's frontmatter version outside the carriers is reported for any plugin, not just Goals", () => {
  const method = "---\nname: x\nversion: 1\n---\nbody\n";
  assert.deepEqual(markdownFindings("plugins/native/other/methods/a.md", method, []).map((finding: { text: string }) => finding.text), ["unmanaged frontmatter version: add a carrier in tooling/versions.json"]);
  assert.deepEqual(markdownFindings("plugins/native/other/methods/a.md", method, [{ file: "plugins/native/other/methods/a.md" }]), []);
  assert.deepEqual(markdownFindings("plugins/native/other/README.md", "# version: 1\nversion: 1\n", []), []);
  const root = tree({ "tooling/versions.json": source({}), "plugins/native/other/methods/a.md": method });
  assert.ok(versionDeclarationProblems(root).includes("plugins/native/other/methods/a.md:1: unmanaged frontmatter version: add a carrier in tooling/versions.json"));
});

test("N34-VS-03 an integration Manifest's fields and capability strings have to be carried", () => {
  const file = "plugins/official-integrations/new/manifest.json";
  const manifest = '{\n  "schema_version": 1,\n  "host_api_version": 1,\n  "version": "1.0.0",\n  "capabilities": ["connector.host.v1"]\n}\n';
  assert.deepEqual(manifestFindings(file, manifest, []).map((finding: { text: string }) => finding.text), [
    "unmanaged Manifest field schema_version", "unmanaged Manifest field host_api_version", "unmanaged Manifest field version", "unmanaged Manifest field connector.host.v1",
  ]);
  const carriers = [['^  "schema_version": ', ","], ['^  "host_api_version": ', ","], ['^  "version": "', '"']].map(([prefix, suffix]) => ({ file, pattern: `(${prefix})[^",]+(${suffix})` }))
    .concat({ file, pattern: '("connector\\.host\\.v?)\\d+("[,\\]\\s])' });
  assert.deepEqual(manifestFindings(file, manifest, carriers), []);
});

test("N34-VS-03 the product version has to come from the source in each place that announces it", () => {
  const root = tree({ "tooling/versions.json": source({ "product.release": "1.0.0" }, [{ file: "package.json", key: "product.release", pattern: '("version":")[^"]+(")' }]), "package.json": '{"version":"1.0.0"}' });
  const problems = versionDeclarationProblems(root);
  for (const file of ["apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/src-tauri/Cargo.toml", "apps/desktop/src-tauri/Cargo.lock", "apps/local-host/src/product-version.ts"]) {
    assert.ok(problems.includes(`${file}: does not take the product version from tooling/versions.json`), `${file}\n${problems.join("\n")}`);
  }
  assert.ok(!problems.some((problem: string) => problem.startsWith("package.json:")), problems.join("\n"));
});

test("N34-VS-03 an exception needs a reason of at least 20 characters, and one that excepts nothing is refused", () => {
  assert.deepEqual(checkExceptions([{ file: "a.ts", reason: "太短" }]), ["tooling/gates/version-exceptions.json: a.ts needs a reason of at least 20 characters"]);
  assert.deepEqual(checkExceptions([{ file: "a.ts" }]), ["tooling/gates/version-exceptions.json: a.ts needs a reason of at least 20 characters"]);
  assert.deepEqual(checkExceptions([{ reason: "这一条既没有写文件也没有写条目，也没有写行，只有理由。" }]), ["tooling/gates/version-exceptions.json: an exception names no file, entry or row"]);
  assert.deepEqual(checkExceptions([{ file: "a.ts", reason: "这是一条写得足够长、说明了为什么不算自有版本的理由。" }]), []);

  const finding = { file: "a.ts", line: 1, name: "version", text: "unmanaged" }, other = { ...finding, name: "format" };
  const byName = { file: "a.ts", name: "version", reason: "r" }, wholeFile = { file: "a.ts", reason: "r" }, stale = { file: "b.ts", reason: "r" };
  assert.deepEqual(applyExceptions([finding, other], [byName]), { remaining: [other], stale: [] });
  assert.deepEqual(applyExceptions([finding, other], [wholeFile]), { remaining: [], stale: [] });
  assert.deepEqual(applyExceptions([finding], [byName, stale]), { remaining: [], stale: [stale] });

  const root = tree({
    "tooling/versions.json": source({}), "apps/a/src/a.ts": "export const a = { version: 1 };\n",
    "tooling/gates/version-exceptions.json": JSON.stringify([{ file: "apps/a/src/a.ts", name: "version", reason: "短" }, { file: "apps/a/src/gone.ts", reason: "一条已经没有任何东西需要它的旧例外，应该被删掉。" }]),
  });
  const problems = versionDeclarationProblems(root);
  assert.ok(problems.includes("tooling/gates/version-exceptions.json: apps/a/src/a.ts needs a reason of at least 20 characters"), problems.join("\n"));
  assert.ok(problems.includes("tooling/gates/version-exceptions.json: apps/a/src/gone.ts excepts nothing any more"), problems.join("\n"));
});

test("N34-VS-03 every exception in the real list has a reason that says something", () => {
  const entries = JSON.parse(readFileSync(path.join(repository, "tooling/gates/version-exceptions.json"), "utf8")) as Array<{ reason: string }>;
  assert.deepEqual(checkExceptions(entries), []);
  assert.ok(entries.length > 0);
});

// ---- N34-VS-04: literals travel inside each package; no shared table --------------------------------------------------------
test("N34-VS-04 product code does not read the version table, and the generated constants are gone", () => {
  const files = readSourceFiles(repository);
  // Comments may name the source (product-version.ts says where its literal comes from); only code that reaches for it counts.
  const reachesForTable = (text: string) => /versions\.json|versions\.generated/.test(text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, ""));
  assert.deepEqual([...files].filter(([, text]) => reachesForTable(text)).map(([file]) => file), []);
  assert.ok(!("owners" in versionSource(repository)));
  const generated: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(path.join(repository, directory), { withFileTypes: true })) {
      if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== "dist") walk(`${directory}/${entry.name}`); }
      else if (entry.name === "versions.generated.ts") generated.push(`${directory}/${entry.name}`);
    }
  };
  for (const root of SOURCE_ROOTS) if (existsSync(path.join(repository, root))) walk(root);
  assert.deepEqual(generated, []);
});

test("N34-VS-04 the public packages export no repository-wide version table", () => {
  for (const name of ["packages/contracts/package.json", "packages/plugin-sdk/package.json"]) {
    const manifest = JSON.parse(readFileSync(path.join(repository, name), "utf8")) as { exports?: Record<string, unknown> };
    assert.deepEqual(Object.keys(manifest.exports ?? {}).filter(subpath => /version/i.test(subpath)), [], name);
  }
  const snapshots: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(directory, entry.name));
      else snapshots.push(readFileSync(path.join(directory, entry.name), "utf8"));
    }
  };
  walk(path.join(repository, "tooling/gates/api"));
  const api = snapshots.join("\n");
  assert.doesNotMatch(api, /\bV_[A-Z0-9_]+\b/);
  assert.doesNotMatch(api, /action\.goals\.create|product\.release|versionSource/);
});
