import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { computeVersions, generateVersions, readVersionInputs } from "../scripts/generate-versions.mjs";
import { CODE_FILE, walkFiles } from "../scripts/script-paths.mjs";
import { isTestFile, readSourceFiles, SOURCE_ROOTS, versionSource } from "../scripts/version-source.mjs";
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
  // an entry moves, this fails instead of the page asking for a version that no longer exists. What they can reach comes from the
  // table: every action of the plugin (`"files." + operation`) and every `.state` (`plugin + ".state"`), so a new action needs no edit here.
  const { versions } = versionSource(repository);
  const actions = Object.keys(versions).filter(key => key.startsWith("action.")).map(key => key.slice("action.".length));
  for (const [file, plugin, seen] of [
    ["plugins/native/files/src/browser/request.ts", "files", ["files.capture", "files.state", "text-stats.state", "diff.state"]],
    ["plugins/native/git/src/browser/request.ts", "git", ["git.conflict", "git.state", "diff.state"]],
  ] as const) {
    const sent = Number(/capability_id: capability, version: (\d+) \}/.exec(readFileSync(path.join(repository, file), "utf8"))?.[1]);
    const reached = actions.filter(id => id.startsWith(`${plugin}.`) || id.endsWith(".state"));
    for (const id of seen) assert.ok(reached.includes(id), `${id}: the table no longer has it, or the derivation lost it`);
    assert.deepEqual(reached.filter(id => versions[`action.${id}`] !== sent), [], file);
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
  const precise = { name: "version", values: { "1": 1 } };
  assert.deepEqual(checkExceptions([{ file: "a.ts", ...precise, reason: "太短" }]), ["tooling/gates/version-exceptions.json: a.ts needs a reason of at least 20 characters"]);
  assert.deepEqual(checkExceptions([{ file: "a.ts", ...precise }]), ["tooling/gates/version-exceptions.json: a.ts needs a reason of at least 20 characters"]);
  assert.deepEqual(checkExceptions([{ reason: "这一条既没有写文件也没有写条目，也没有写行，只有理由。" }]), ["tooling/gates/version-exceptions.json: an exception names no file, entry or row"]);
  assert.deepEqual(checkExceptions([{ file: "a.ts", ...precise, reason: "这是一条写得足够长、说明了为什么不算自有版本的理由。" }]), []);

  const finding = { file: "a.ts", line: 1, name: "version", value: "1", text: "unmanaged" }, other = { ...finding, name: "format" };
  const byName = { file: "a.ts", ...precise, reason: "r" }, stale = { file: "b.ts", ...precise, reason: "r" };
  assert.deepEqual(applyExceptions([finding, other], [byName]), { remaining: [other], stale: [], changed: [] });
  assert.deepEqual(applyExceptions([finding], [byName, stale]), { remaining: [], stale: [stale], changed: [] });

  const root = tree({
    "tooling/versions.json": source({}), "apps/a/src/a.ts": "export const a = { version: 1 };\n",
    "tooling/gates/version-exceptions.json": JSON.stringify([{ file: "apps/a/src/a.ts", ...precise, reason: "短" }, { file: "apps/a/src/gone.ts", ...precise, reason: "一条已经没有任何东西需要它的旧例外，应该被删掉。" }]),
  });
  const problems = versionDeclarationProblems(root);
  assert.ok(problems.includes("tooling/gates/version-exceptions.json: apps/a/src/a.ts needs a reason of at least 20 characters"), problems.join("\n"));
  assert.ok(problems.includes("tooling/gates/version-exceptions.json: apps/a/src/gone.ts#version excepts nothing any more"), problems.join("\n"));
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

// ---- VG: the review of 2026-11-07 (batch 02). Each of these passed the gate before it was tightened -------------------------
test("VG-01 a version compared through a quoted key is reported like the dotted spelling", () => {
  const cases: Array<[string, string]> = [
    ["if (x['version'] !== 2) y();", "unmanaged current version version = 2"],
    ['if (x["schema_version"] === 3) y();', "unmanaged current version schema_version = 3"],
    ["if (2 !== x['format']) y();", "unmanaged current version format = 2"],
    ["if (x[version] !== 2) y();", "unmanaged current version version = 2"],
    ["if (x!.version !== 2) y();", "unmanaged current version version = 2"],
  ];
  for (const [text, expected] of cases) assert.deepEqual(findings(FILE, text), [expected], text);
  assert.deepEqual(findings(FILE, "if (x['title'] !== 2) y();"), []);
});

test("VG-02 the other spellings of a current version are reported", () => {
  const cases: Array<[string, string]> = [
    ["const schemaVersion=2;", "unmanaged current version schemaVersion = 2"],
    ["let version = 2;", "unmanaged current version version = 2"],
    ["const { version = 2 } = x;", "unmanaged current version version = 2"],
    ["class A { static SCHEMA_VERSION = 2 }", "unmanaged current version SCHEMA_VERSION = 2"],
    ["class A { version = 2 }", "unmanaged current version version = 2"],
    ["export const a = { SCHEMA_VERSION: 2 };", "unmanaged current version SCHEMA_VERSION = 2"],
    ["switch(x.version){case 2:}", "unmanaged current version version = 2"],
    ["switch(x['schema_version']){case 3: y();}", "unmanaged current version schema_version = 3"],
    ["export const a = {schema_version:{enum:[2]}};", "unmanaged current version schema_version = 2"],
    ["export const a = {schema_version:{const:2}};", "unmanaged current version schema_version = 2"],
    ["export const a = {schema_version:z.literal(2)};", "unmanaged current version schema_version = 2"],
    ["export const a = { version: ok ? 2 : y };", "unmanaged current version version = 2"],
    ["export const a = { version: x ?? 2 };", "unmanaged current version version = 2"],
    ["export interface A { version: 2 | string }", "unmanaged current version version = 2"],
    ['if (x.version === "1.2.3") y();', 'unmanaged current version version = "1.2.3"'],
    ["x.version = 2;", "unmanaged current version version = 2"],
    ["x.version ??= 2;", "unmanaged current version version = 2"],
    ["x.version ||= 2;", "unmanaged current version version = 2"],
    ['export const a = { ["version"]: 2 };', "unmanaged current version version = 2"],
    ["enum A { version = 2 }", "unmanaged current version version = 2"],
    ["const { version: v = 2 } = x;", "unmanaged current version version = 2"],
    ["if (schemaVersion !== 2) y();", "unmanaged current version schemaVersion = 2"],
    ["db.exec('PRAGMA user_version = 3');", "unmanaged current version PRAGMA user_version = 3"],
    ["db.exec(`CREATE TABLE a (b); PRAGMA main.user_version=3;`);", "unmanaged current version PRAGMA user_version = 3"],
    ["db.exec(`PRAGMA user_version(3)`);", "unmanaged current version PRAGMA user_version = 3"],
    ["db.pragma('user_version = 3');", "unmanaged current version PRAGMA user_version = 3"],
  ];
  for (const [text, expected] of cases) assert.deepEqual(findings(FILE, text), [expected], text);
  for (const text of [
    "const schemaVersion = /* @version format.a */ 2;",
    "class A { static SCHEMA_VERSION = /* @version format.a */ 2 }",
    "switch (x.version) { case /* @version format.a */ 2: y(); }",
    "switch (x.kind) { case 2: y(); }",
    "export const a = { schema_version: { enum: [/* @version format.a */ 2] } };",
    "export const a = { title: { enum: [2] } };",
    "export const a = { version: ok ? /* @version format.a */ 2 : /* @version format.b */ 3 };",
    "export const a = { version: (record.version ?? 0) + 1 };",
    "x.title = 2;",
    "export const a = { [version]: 2 };", // a computed key is not named version
    "x.version += 2;",
    "x.version = next;",
    "db.exec(`PRAGMA user_version = ${VERSION}`);",
    "db.exec('PRAGMA user_version = /* @version database.a */ 3');",
    "db.pragma('user_version', { simple: true });",
    "db.exec('PRAGMA user_version');",
    "db.exec('PRAGMA user_version = 0');",
  ]) assert.deepEqual(findings(FILE, text), [], text);
});

test("VG-03 a version in a name is reported whatever the name starts with: there is no list of prefixes to forget", () => {
  const cases: Array<[string, string]> = [
    ["'discovery.pulse.v2'", "discovery.pulse.v2"],
    ["'research.lens/2'", "research.lens/2"],
    ["'molis-work-x/2'", "molis-work-x/2"],
    ["'goals.create@2'", "goals.create@2"],
    ["'brandnew.thing.v3'", "brandnew.thing.v3"],
    ['"molis-work-secretstore-v1"', "molis-work-secretstore-v1"],
    ["'brandnew/thing/v3'", "brandnew/thing/v3"],
    ["'brandnew-thing-v3'", "brandnew-thing-v3"],
    ["'brandnew_thing_v3'", "brandnew_thing_v3"],
    ["'brandnew-v3.token'", "brandnew-v3.token"],
    ["`brandnew.thing.v3`", "brandnew.thing.v3"],
  ];
  for (const [literal, name] of cases) assert.deepEqual(findings(FILE, `export const a = ${literal};`), [`unmanaged current version ${name} = ${literal}`], literal);
  assert.deepEqual(findings(FILE, 'export const a = "#!/bin/sh\\n# molis-work-home-launcher-v2";'), ["unmanaged current version molis-work-home-launcher-v2 inside a string"]);
  assert.deepEqual(findings(FILE, "const a = `const kind='discovery.pulse.v1';`;"), ["unmanaged current version discovery.pulse.v1 inside a string"]);
  for (const text of [
    'export const a = /* @version type.a "brandnew.thing.v{version}" */ "brandnew.thing.v3";',
    "const a = `const kind=/* @version type.a \"discovery.pulse.v{version}\" */ 'discovery.pulse.v1';`;",
    'export const a = "https://api.example.com/v1";',
    'export const a = "https://api.example.com/v2/items";',
    'export const a = "utf-8";',
    'export const a = "gpt-image-1.5";',
    'export const a = "coding.server.note-2000";',
    'export const a = "@molis-ai/molis-work-contracts";',
    "const a = `const size=bytes/1024;`;", // division in a script's text, not a version
    'export const a = "v1";',
    'export const a = "name.v0";', // 0 is "none yet"
  ]) assert.deepEqual(findings(FILE, text), [], text);
  const carrier = { file: FILE, key: "checker.a", pattern: "(molis\\.a@)\\d+(?=[^\\d]|$)()" };
  const noted = "export const a = `run molis.a@1 first`;";
  assert.deepEqual(sourceDeclarationFindings(FILE, noted, {}, [carrier]), [], "a carrier already moves this one");
  assert.equal(sourceDeclarationFindings(FILE, noted, {}, []).length, 1);
});

test("VG-04 a version written into a template is seen; one taken from a marked value is not a finding", () => {
  const cases: Array<[string, string]> = [
    ["`molis.work-executor.${name}.input.v1`", "molis.work-executor.X.input.v1"],
    ["`connector.driver.${id}.v1`", "connector.driver.X.v1"],
    ["`${id}.v2`", "X.v2"],
    ["`activity_${id}_v1`", "activity_X_v1"],
    ["`cas-v1.${token}`", "cas-v1.X"],
    ["`data/${id}/operation/v1`", "data/X/operation/v1"],
    ["`${id}@2`", "X@2"],
    ["`research.${id}/2`", "research.X/2"],
    ["`a.b.v${2}`", "a.b.v2"],
  ];
  for (const [literal, name] of cases) assert.deepEqual(findings(FILE, `export const a = ${literal};`), [`unmanaged current version ${name} = ${literal}`], literal);
  for (const text of [
    "export const a = `a.b.v${VERSION}`;",
    "export const a = `a.b.v${/* @version format.a */ 2}`;",
    "export const a = `${id}@${version}`;",
    "export const a = `${base}/v1/models?limit=1000`;",
    "export const a = `https://api.example.com/v1/items/${id}`;",
    "export const a = `${index + 1}/${count}`;",
  ]) assert.deepEqual(findings(FILE, text), [], text);
});

test("VG-05 a registered snapshot that cannot be read fails instead of skipping the comparison", () => {
  const snapshots = ["actions", "host-actions", "scenes", "host-scenes"].map(name => `tooling/gates/actions/${name}.tsv`);
  const whole = Object.fromEntries(snapshots.map(file => [file, ""]));
  const problems = (root: string) => versionDeclarationProblems(root).filter((problem: string) => problem.includes("tooling/gates/actions/"));
  assert.deepEqual(problems(tree({ "tooling/versions.json": source({}), ...whole })), []);
  for (const gone of snapshots) {
    const { [gone]: _, ...rest } = whole;
    assert.deepEqual(problems(tree({ "tooling/versions.json": source({}), ...rest })), [`${gone}: cannot read it, so the registered actions and scenes were not compared`], gone);
  }
});

test("VG-06 the test boundary is the package, not a word in the path: src/tests ships", () => {
  for (const file of ["packages/a/src/tests/shipped.ts", "plugins/native/a/src/test/b.ts", "apps/a/src/test.ts", "apps/a/public/tests/b.js", "apps/a/cloudflare/tests/b.ts", "server/src/tests/b.ts"]) assert.equal(isTestFile(file), false, file);
  for (const file of ["packages/a/tests/b.ts", "server/tests/b.ts", "plugins/official-integrations/a/test/b.ts", "packages/a/src/b.test.ts", "packages/a/src/b.spec.tsx", "tooling/plugin-cli/tests/b.ts", "tests/b.ts"]) assert.equal(isTestFile(file), true, file);
  const root = tree({ "tooling/versions.json": source({}), "packages/a/src/tests/shipped.ts": "export const a = {version:7};\n", "packages/a/tests/real.ts": "export const a = {version:7};\n" });
  const problems = versionDeclarationProblems(root);
  assert.ok(problems.includes("packages/a/src/tests/shipped.ts:1: unmanaged current version version = 7"), problems.join("\n"));
  assert.ok(!problems.some((problem: string) => problem.startsWith("packages/a/tests/")), problems.join("\n"));
});

const generated = (versions: Record<string, string | number>, text: string, carriers: object[] = []) => computeVersions({ versions, carriers }, new Map([["apps/a/src/a.ts", text]]));

test("VG-07 a marker quoted in a comment is not a use, and is not rewritten", () => {
  const onlyInComment = generated({ "format.a": 2 }, "// const a = /* @version format.a */ 1;\n");
  assert.deepEqual(onlyInComment.problems, ["tooling/versions.json: nothing uses format.a"]);
  assert.deepEqual([...onlyInComment.outputs.keys()], []);
  const spaced = generated({ "format.a": 2 }, "const a = 1; // see /* @version format.a */ 1\n");
  assert.deepEqual(spaced.problems, ["tooling/versions.json: nothing uses format.a"]);
  // Not a comment: the // is in a string on the same line, and a marker in a script's text moves with the entry.
  const url = generated({ "format.a": 2 }, "const a = 'http://x', v = /* @version format.a */ 1;\n");
  assert.deepEqual(url.problems, []);
  assert.equal(url.outputs.get("apps/a/src/a.ts"), "const a = 'http://x', v = /* @version format.a */ 2;\n");
  const script = generated({ "format.a": 2 }, "const a = `const v = /* @version format.a */ 1;`;\n");
  assert.deepEqual(script.problems, []);
  assert.equal(script.outputs.get("apps/a/src/a.ts"), "const a = `const v = /* @version format.a */ 2;`;\n");
  assert.deepEqual(findings(FILE, "export const a = { version: // /* @version format.a */\n  1 };"), ["unmanaged current version version = 1"], "the gate reads the same way");
  const root = tree({
    "tooling/versions.json": source({ "database.a": 1 }),
    "plugins/native/one/src/a.ts": "export const A_VERSION = /* @version database.a */ 1;\n",
    "plugins/native/two/src/a.ts": "// was /* @version database.a */ 1\n",
  });
  assert.ok(!versionDeclarationProblems(root).some((problem: string) => problem.includes("plugins/native/two")), "a comment is not a second user either");
});

test("VG-08 what the source cannot vouch for is refused: a template without {version} or with *, a number that is not plain, a repeated key", () => {
  const problems = (versions: Record<string, string | number>, text: string) => generated(versions, text).problems;
  assert.deepEqual(problems({ "format.a": 1 }, '/* @version format.a "fixed" */ "fixed"'), ["apps/a/src/a.ts: the template of format.a has no {version}"]);
  assert.deepEqual(problems({ "format.a": 1 }, '/* @version format.a "a*{version}" */ "a*1"'), ["apps/a/src/a.ts: the template of format.a contains *, which can end the comment it sits in"]);
  // A marked literal in exponent or separated form would read as its first digit.
  for (const literal of ["1e3", "1_000", "0x1", "1n", "1.5.2"]) assert.deepEqual(problems({ "format.a": 1 }, `/* @version format.a */ ${literal}`), ["apps/a/src/a.ts: a @version marker is not directly before a literal", "tooling/versions.json: nothing uses format.a"], literal);
  // A marker with * and a malformed one must not cancel each other out in the count.
  assert.ok(problems({ "format.a": 1 }, '/* @version format.a "a*{version}" */ "a*1"; /* @version */ 2').length > 0);

  const raw = (text: string) => generate(tree({ "tooling/versions.json": text, "apps/a/src/a.ts": "const a = /* @version format.a */ 1000;\n" }), "--check");
  assert.equal(raw('{"versions":{"format.a":1000},"carriers":[]}').status, 0);
  for (const [text, message] of [
    ['{"versions":{"format.a":1e3},"carriers":[]}', /tooling\/versions\.json: 1e3 is not a plain whole number/],
    ['{"versions":{"format.a":1000.0},"carriers":[]}', /tooling\/versions\.json: 1000\.0 is not a plain whole number/],
    ['{"versions":{"format.a":1,"format.a":1000},"carriers":[]}', /tooling\/versions\.json: format\.a appears twice/],
    ['{"versions":{"format.a":1000},"versions":{},"carriers":[]}', /tooling\/versions\.json: versions appears twice/],
  ] as const) {
    const result = raw(text);
    assert.equal(result.status, 1, text);
    assert.match(result.stderr, message, text);
  }
});

test("VG-09 a carrier changes the one line it declares, and that is checked for every carrier", () => {
  const carrier = (file: string, key: string, pattern: string) => ({ file, key, pattern });
  const method = (body: string) => new Map([["plugins/native/a/methods/a.md", body]]);
  const onMethod = (body: string, pattern = "(^version: )\\d+()") => computeVersions({ versions: { "method.a": 2 }, carriers: [carrier("plugins/native/a/methods/a.md", "method.a", pattern)] }, method(body));
  assert.equal(onMethod("---\nversion: 1\n---\nbody\n").outputs.get("plugins/native/a/methods/a.md"), "---\nversion: 2\n---\nbody\n");
  assert.deepEqual(onMethod("---\nversion: 1\n---\nversion: 1\n").problems, ["plugins/native/a/methods/a.md: carrier for method.a matches 2 places; it has to name one"]);
  assert.deepEqual(onMethod("---\nname: a\n---\nversion: 1\n").problems, ["plugins/native/a/methods/a.md: carrier for method.a matches the body, not the frontmatter"]);
  const code = (text: string, pattern: string) => computeVersions({ versions: { "format.a": 2 }, carriers: [carrier("apps/a/data.json", "format.a", pattern)] }, new Map([["apps/a/data.json", text]])).problems;
  assert.deepEqual(code('{"a":1,"b":{"a":1}}', '("a":)\\d+()'), ["apps/a/data.json: carrier for format.a matches 2 places; it has to name one"]);
  assert.deepEqual(code("a: 1\nb: 2\nc;\n", "(a: )[\\s\\S]*?(c;)"), ["apps/a/data.json: carrier for format.a replaces more than one line"]);
  assert.deepEqual(code('{"a":1}', '("a":)\\d+()'), []);

  // The real tree: moving each carrier on its own changes exactly one line of its file, and that line holds the new value.
  const real = versionSource(repository);
  const files = readVersionInputs(repository, real);
  for (const entry of real.carriers as Array<{ file: string; key: string; pattern: string }>) {
    const before = files.get(entry.file) as string;
    const { outputs } = computeVersions({ versions: { [entry.key]: "987654" }, carriers: [entry] }, new Map([[entry.file, before]]));
    const after = (outputs.get(entry.file) as string).split("\n"), lines = before.split("\n");
    assert.equal(after.length, lines.length, entry.file);
    const changed = lines.filter((line, index) => line !== after[index]);
    assert.equal(changed.length, 1, `${entry.file} ${entry.pattern}`);
    assert.ok(after.some(line => line.includes("987654")), entry.file);
  }
});

test("VG-10 a gate run from a path with a space, Chinese or a symlink still runs: it cannot exit 0 without looking", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "version-source-entry-"));
  scratch.push(directory);
  const checkout = path.join(directory, "路径 with space");
  mkdirSync(checkout);
  cpSync(path.join(repository, "scripts"), path.join(checkout, "scripts"), { recursive: true });
  symlinkSync(path.join(repository, "node_modules"), path.join(checkout, "node_modules"));
  const bad = tree({ "tooling/versions.json": source({ "format.a": 2 }), "apps/a/src/a.ts": "export const a = { version: /* @version format.a */ 1 };\nexport const b = { version: 5 };\n" });
  const run = (...args: string[]) => spawnSync(process.execPath, args, { encoding: "utf8" });

  const gate = run(path.join(checkout, "scripts/gates/version-declarations.mjs"), bad);
  assert.equal(gate.status, 1, gate.stdout);
  assert.match(gate.stderr, /unmanaged current version version = 5/);
  const moved = run(path.join(checkout, "scripts/generate-versions.mjs"), "--root", bad, "--check");
  assert.equal(moved.status, 1, moved.stdout);
  assert.match(moved.stderr, /Stale version outputs/);

  for (const [link, target, args] of [
    ["gate.mjs", path.join(repository, "scripts/gates/version-declarations.mjs"), [bad]],
    ["generate.mjs", generator, ["--root", bad, "--check"]],
  ] as const) {
    symlinkSync(target, path.join(directory, link));
    const result = run(path.join(directory, link), ...args);
    assert.equal(result.status, 1, `${link}: ${result.stdout}`);
  }
  assert.equal(run(path.join(checkout, "scripts/gates/backlog-rows.mjs"), "--nonsense").status, 2);
  assert.notEqual(run(path.join(checkout, "scripts/check-package-boundaries.mjs")).status, 0, "a checkout with no packages cannot pass");
  // The other half: a clean run says so, so nothing on the screen means it did not run.
  const clean = run(path.join(repository, "scripts/gates/version-declarations.mjs"), repository);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /^No version declaration bypasses tooling\/versions\.json: \d+ code files checked\.$/m);
});

const usedBy = (versions: Record<string, number>, files: Record<string, string>, carriers: object[] = []) =>
  versionDeclarationProblems(tree({ "tooling/versions.json": source(versions, carriers), ...files })).filter((problem: string) => /is shared|does not say|another plugin/.test(problem));

test("VG-11 one package's entry cannot be borrowed by another", () => {
  const pages = "export const PAGES_DB = { version: /* @version database.pages_database */ 1 };\n";
  const borrowed = usedBy({ "database.pages_database": 1 }, { "plugins/native/pages/src/db.ts": pages, "plugins/native/todo/src/db.ts": "export const TODO_SECOND = /* @version database.pages_database */ 1;\n" });
  assert.ok(borrowed.some((problem: string) => problem.startsWith("plugins/native/todo/src/db.ts:1: database.pages_database is shared")), borrowed.join("\n"));
  for (const [key, other] of [
    ["method.a", "plugins/native/b/src/a.ts"], ["prompt.a", "apps/a/src/a.ts"], ["role.a", "modules/a/src/a.ts"], ["plugin.a", "packages/a/src/a.ts"],
    ["policy.a", "server/src/a.ts"], ["sync.collection.a", "horizontal/a/src/a.ts"], ["contract.a", "tooling/plugin-cli/src/a.ts"], ["scene.a", "plugins/official-integrations/a/src/a.ts"],
  ]) {
    const problems = usedBy({ [key]: 1 }, { "plugins/native/owner/src/a.ts": `export const a = { version: /* @version ${key} */ 1 };\n`, [other]: `export const a = { version: /* @version ${key} */ 1 };\n` });
    assert.ok(problems.some((problem: string) => problem.startsWith(`${other}:1: ${key} is shared`)), `${key}\n${problems.join("\n")}`);
  }
  assert.deepEqual(usedBy({ "database.a": 1 }, { "plugins/native/a/src/a.ts": "export const A_VERSION = /* @version database.a */ 1;\nexport const B = { version: /* @version database.a */ 1 };\n", "plugins/native/a/src/b.ts": "export const C_VERSION = /* @version database.a */ 1;\n" }), [], "files of one package");
  const carried = usedBy({ "database.a": 1 }, { "plugins/native/a/src/a.ts": "export const A_VERSION = /* @version database.a */ 1;\n", "apps/b/data.json": '{"a":1}' }, [{ file: "apps/b/data.json", key: "database.a", pattern: '("a":)\\d+()' }]);
  assert.ok(carried.some((problem: string) => problem.startsWith("apps/b/data.json:1: database.a is shared")), carried.join("\n"));

  // The entries that really are public contracts pass with any two users, without a list of them here or in the gate.
  for (const key of [
    "format.sandbox.agent-prompt", "format.sandbox.agent-method", "format.sandbox.contract", "type.character.definition", "type.search-intent", "artifact.io.molis.work.document",
    "artifact.io.molis.work.pages.document", "format.project.portable", "format.plugin.build-lock", "format.builder.build-manifest", "format.plugin.package", "format.sync.round",
    "type.coding.changeset", "type.coding.report", "type.molis.behavior-recommendation", "format.memory.export", "format.plugin.presentation", "format.asset.bundle",
    "manifest.schema", "host.api", "sync.protocol", "protocol.workflow-content", "type.molis.workflow.content.list.output", "event.host.connection.changed", "event.io.molis.work.coding.run-updated",
    "event.io.molis.work.git.file-changed", "type.connector.host", "type.listener.host", "type.signals.command", "action.goals.create", "action.shelf.items.admit", "product.release",
  ]) {
    const use = `export const a = { version: /* @version ${key} */ 1 };\n`;
    assert.deepEqual(usedBy({ [key]: 1 }, { "plugins/native/a/src/a.ts": use, "plugins/native/b/src/a.ts": use, "apps/c/src/a.ts": use, "packages/d/src/a.ts": use }), [], key);
  }

  // A public entry still is not a number to borrow for something else.
  const owner = "export const a = { version: /* @version format.sandbox.contract */ 1 };\n";
  const named = usedBy({ "format.sandbox.contract": 1 }, { "packages/contracts/src/a.ts": owner, "plugins/native/todo/src/a.ts": "export const TODO_SECOND = /* @version format.sandbox.contract */ 1;\n" });
  assert.ok(named.some((problem: string) => problem.startsWith("plugins/native/todo/src/a.ts:1: TODO_SECOND does not say")), named.join("\n"));
  for (const name of ["SANDBOX_CONTRACT_VERSION", "CONTRACT_SCHEMA", "contractVersion"]) {
    assert.deepEqual(usedBy({ "format.sandbox.contract": 1 }, { "packages/contracts/src/a.ts": owner, "plugins/native/todo/src/a.ts": `export const ${name} = /* @version format.sandbox.contract */ 1;\n` }), [], name);
  }
  assert.deepEqual(usedBy({ "format.a": 1 }, { "plugins/native/a/src/a.ts": "export const DESKTOP_STATE = /* @version format.a */ 1;\n" }), [], "one package may name its own number as it likes");
  const pagesFormat = "export const a = { version: /* @version format.pages.document */ 1 };\n";
  const reader = usedBy({ "format.pages.document": 1 }, { "plugins/native/pages/src/a.ts": pagesFormat, "plugins/native/todo/src/a.ts": "export const READ_VERSION = /* @version format.pages.document */ 1;\n", "apps/host/src/a.ts": pagesFormat });
  assert.deepEqual(reader.map((problem: string) => problem.split(":")[0]), ["plugins/native/todo/src/a.ts"], reader.join("\n"));
  assert.match(reader[0] as string, /format\.pages\.document belongs to another plugin/);
});

test("VG-12 what stays at its first version until the first outside install cannot be bumped in the table (CONTRACT-CHANGES §3)", () => {
  const problems = (versions: Record<string, number | string>) => versionDeclarationProblems(tree({ "tooling/versions.json": source(versions) })).filter((problem: string) => problem.includes("before the first outside install"));
  for (const key of ["action.a.b", "prompt.a", "role.a", "action-family.a", "scene.a", "manifest.schema", "host.api"]) {
    assert.deepEqual(problems({ [key]: 2 }), [`tooling/versions.json: ${key} is 2; before the first outside install it stays 1 (docs/system/CONTRACT-CHANGES.md §3)`], key);
    assert.deepEqual(problems({ [key]: 1 }), [], key);
  }
  assert.deepEqual(problems({ "format.a": 2, "database.a": 2, "type.a": 2, "method.a": 2, "protocol.a": "1.0.0" }), []);
});

test("VG-13 what each script scans is pinned, so sharing the walk did not narrow it", () => {
  const root = tree({
    "tooling/versions.json": source({}),
    "apps/a/src/a.ts": "", "apps/a/src/a.tsx": "", "apps/a/src/a.mts": "", "apps/a/src/a.cts": "", "apps/a/src/a.js": "", "apps/a/src/a.jsx": "", "apps/a/src/a.mjs": "", "apps/a/src/a.cjs": "",
    "apps/a/src/a.css": "", "apps/a/src/a.test.ts": "", "apps/a/tests/a.ts": "", "apps/a/fixtures/a.ts": "",
    "apps/a/tooling/a.mjs": "", "packages/a/src/a.ts": "", "plugins/native/a/src/a.ts": "", "plugins/official-integrations/a/src/a.ts": "", "modules/a/src/a.ts": "", "horizontal/a/src/a.ts": "",
    "server/src/a.ts": "", "server/public/a.js": "", "tooling/plugin-cli/src/a.ts": "", "tooling/gates/a.ts": "", "scripts/a.mjs": "", "tests/a.ts": "", "examples/a/src/a.ts": "",
    // dist and dependencies are never read; target and .build (Rust and Swift output) are, inside src/ or not.
    "apps/a/dist/a.js": "", "apps/a/target/a.js": "", "apps/a/.build/a.js": "", "apps/a/node_modules/b/a.js": "",
    "apps/a/src/dist/a.ts": "", "apps/a/src/target/a.ts": "", "apps/a/src/.build/a.ts": "", "apps/a/src/node_modules/a.ts": "",
  });
  assert.deepEqual([...readSourceFiles(root).keys()].sort(), [
    "apps/a/.build/a.js", "apps/a/src/.build/a.ts", "apps/a/src/a.cjs", "apps/a/src/a.cts", "apps/a/src/a.js", "apps/a/src/a.jsx", "apps/a/src/a.mjs", "apps/a/src/a.mts", "apps/a/src/a.ts", "apps/a/src/a.tsx",
    "apps/a/src/target/a.ts", "apps/a/target/a.js", "apps/a/tooling/a.mjs", "horizontal/a/src/a.ts", "modules/a/src/a.ts", "packages/a/src/a.ts", "plugins/native/a/src/a.ts",
    "plugins/official-integrations/a/src/a.ts", "server/public/a.js", "server/src/a.ts", "tooling/plugin-cli/src/a.ts",
  ]);
  // The declaration gate reads Markdown and the three languages the generator does not, under the same roots and the same test boundary.
  const other = tree({
    "tooling/versions.json": source({}),
    "plugins/native/a/methods/a.md": "---\nversion: 1\n---\n", "plugins/native/a/tests/a.md": "---\nversion: 1\n---\n", "scripts/a.md": "---\nversion: 1\n---\n",
    "server/src/a.rs": "/* @version a */", "server/migrations/a.sql": "-- /* @version a */", "apps/a/a.toml": "# /* @version a */", "apps/a/dist/a.toml": "# /* @version a */", "scripts/a.rs": "/* @version a */",
  });
  const named = versionDeclarationProblems(other).map((problem: string) => problem.split(":")[0]).filter((file: string) => /\.(?:md|rs|sql|toml)$/.test(file) && !file.startsWith("apps/desktop/")).sort();
  assert.deepEqual(named, ["apps/a/a.toml", "plugins/native/a/methods/a.md", "server/migrations/a.sql", "server/src/a.rs"]);

  // Every workspace package sits under a scanned root, and every root is there: a renamed root cannot quietly shrink the scan.
  for (const directory of SOURCE_ROOTS) assert.ok(existsSync(path.join(repository, directory)), directory);
  const packages = /^packages:\n((?:\s+- .*\n)+)/m.exec(readFileSync(path.join(repository, "pnpm-workspace.yaml"), "utf8"))?.[1] ?? "";
  const workspace = packages.split("\n").flatMap(line => /^\s+- '([^']+)'$/.exec(line)?.[1] ?? []);
  assert.ok(workspace.length > 0);
  for (const pattern of workspace) assert.ok(SOURCE_ROOTS.some((directory: string) => pattern === directory || pattern.startsWith(`${directory}/`)), pattern);
});

test("VG-14 CI's gate job runs this file", () => {
  const step = readFileSync(path.join(repository, ".github/workflows/ci.yml"), "utf8").split("\n").find(line => line.includes("tests/doc-reference-gates.test.ts") && line.includes("tests/verify-release-versions.test.ts")) ?? "";
  assert.match(step, /tests\/version-source\.test\.ts/);
});

test("VG-15 an exception names the literals it lets through and how many, so a new one in that file is seen (BL-1067)", () => {
  const usage = "tooling/gates/version-exceptions.json";
  const reason = "这是一条写得足够长、说明了为什么不算自有版本的理由。";
  const problems = (text: string, entries: object[]) => versionDeclarationProblems(tree({ "tooling/versions.json": source({}), "apps/a/src/a.ts": text, [usage]: JSON.stringify(entries) })).filter((problem: string) => problem.includes("apps/a/src/a.ts"));
  const entry = { file: "apps/a/src/a.ts", name: "version", values: { "1": 2 }, reason };
  assert.deepEqual(problems("export const a = { version: 1 };\nexport const b = { version: 1 };\n", [entry]), []);
  assert.deepEqual(problems("export const a = { version: 1 };\nexport const b = { version: 1 };\nexport const c = { version: 1 };\n", [entry]),
    [`${usage}: apps/a/src/a.ts#version lets through {"1":2}, the file has {"1":3}`], "one more of the same literal");
  assert.deepEqual(problems("export const a = { version: 1 };\nexport const b = { version: 2 };\n", [entry]),
    [`${usage}: apps/a/src/a.ts#version lets through {"1":2}, the file has {"1":1,"2":1}`], "the literal changed");
  assert.deepEqual(problems("export const a = { version: 1 };\n", [entry]), [`${usage}: apps/a/src/a.ts#version lets through {"1":2}, the file has {"1":1}`], "one went away");
  assert.deepEqual(problems("export const a = { version: 1 };\nexport const b = { format: 3 };\n", [{ ...entry, values: { "1": 1 } }]),
    ["apps/a/src/a.ts:2: unmanaged current version format = 3"], "another name in the same file");
  assert.deepEqual(problems("export const a = 1;\n", [entry]), [`${usage}: apps/a/src/a.ts#version excepts nothing any more`]);
  const refused = (entries: object[]) => checkExceptions(entries);
  assert.deepEqual(refused([{ file: "apps/a/src/a.ts", reason }]), [`${usage}: apps/a/src/a.ts needs a name and the values it lets through`], "a whole file is not an exception");
  assert.deepEqual(refused([{ file: "apps/a/src/a.ts", name: "version", reason }]), [`${usage}: apps/a/src/a.ts needs a name and the values it lets through`]);
  assert.deepEqual(refused([{ file: "apps/a/src/a.ts", name: "version", values: {}, reason }]), [`${usage}: apps/a/src/a.ts needs a name and the values it lets through`]);
  assert.deepEqual(refused([{ file: "apps/a/src/a.ts", name: "version", values: { "1": 0 }, reason }]), [`${usage}: apps/a/src/a.ts needs a name and the values it lets through`]);
  assert.deepEqual(refused([entry]), []);
  const real = JSON.parse(readFileSync(path.join(repository, usage), "utf8")) as Array<{ file?: string }>;
  assert.deepEqual(refused(real), [], "the real list is all of this kind");
});

test("VG-16 a version in a UI contribution id gets told to drop it", () => {
  const hint = "a UI contribution id needs no version in its name, drop it";
  assert.deepEqual(findings(FILE, 'export const TODO_UI_CONTRIBUTION_ID = "io.molis.work.native.todo.ui.v1";'), [`unmanaged current version io.molis.work.native.todo.ui.v1 = "io.molis.work.native.todo.ui.v1": ${hint}`]);
  assert.deepEqual(findings(FILE, 'export const a = { contribution_id: "a.b.ui.v1" };'), [`unmanaged current version a.b.ui.v1 = "a.b.ui.v1": ${hint}`]);
  assert.deepEqual(findings(FILE, 'export const TODO_UI_CONTRIBUTION_ID = "io.molis.work.native.todo.ui";'), []);
});

test("VG-19 the MCP tool namespace is one literal prefix, and the rest of the name is still read", () => {
  for (const text of ['export const a = "molis_work_v1_context_bind";', 'export const a = "molis_work_v1_";', "export const a = `molis_work_v1_action_${name}`;"]) assert.deepEqual(findings(FILE, text), [], text);
  for (const name of ["molis_work_v2_context_bind", "other_molis_work_v1_context_bind", "molis_work_v1_context_bind_v2", "molis_work_v1_context_bind__v2"]) {
    assert.deepEqual(findings(FILE, `export const a = "${name}";`), [`unmanaged current version ${name} = "${name}"`], name);
  }
});

test("VG-40 a version right after the MCP tool namespace is still read", () => {
  for (const name of ["molis_work_v1_v2_tool", "molis_work_v1_v3", "molis_work_v1_tool.v2"]) {
    assert.deepEqual(findings(FILE, `export const a = "${name}";`), [`unmanaged current version ${name} = "${name}"`], name);
  }
});

test("VG-20 what the exceptions used to hold moves with the table, and no exception is left waiting to be fixed", () => {
  const exceptions: Array<{ name?: string; reason: string }> = JSON.parse(readFileSync(path.join(repository, "tooling/gates/version-exceptions.json"), "utf8"));
  assert.deepEqual(exceptions.filter(entry => /待修/.test(entry.reason)).map(entry => entry.name), []);
  const executor = "packages/contracts/src/platform/work-executors.ts", catalog = "plugins/official-integrations/catalog/src/index.ts";
  const roles = ["state", "session.open", "session.read", "session.update", "run.start", "run.control"];
  const moved: Array<[string, string, string]> = [
    ...roles.flatMap((role): Array<[string, string, string]> => ["input", "output"].map(side => [`type.molis.work-executor.${role}.${side}`, executor, `/* @version type.molis.work-executor.${role}.${side} */ 2`])),
    ["type.connector.driver.catalog", catalog, "/* @version type.connector.driver.catalog */ 2"],
    ["type.signal.adapter.catalog", catalog, "/* @version type.signal.adapter.catalog */ 2"],
    ["type.discovery.pulse", "plugins/native/alchemist/src/client-views.ts", '"discovery.pulse.v{version}" */ "discovery.pulse.v2"'],
    ["type.molis-work-local-payload", "packages/storage/src/adapters/local-payload-protection.ts", '"molis-work-local-payload-v{version}" */ "molis-work-local-payload-v2"'],
    ["type.molis-work-feed-aead", "packages/storage/src/adapters/search-storage.ts", '"molis-work-feed-aead-v{version}" */ "molis-work-feed-aead-v2"'],
  ];
  const real = versionSource(repository);
  const raised = { ...real, versions: { ...real.versions, ...Object.fromEntries(moved.map(([key]) => [key, 2])) } };
  const { outputs, problems } = computeVersions(raised, readVersionInputs(repository, real));
  assert.deepEqual(problems, []);
  for (const [key, file, written] of moved) assert.ok(outputs.get(file)?.includes(written), `${key} does not reach ${file}`);
});

test("VG-22 no script decides it is the one being run any way but isMainScript: the old ways exit 0 from a symlink, having checked nothing", () => {
  const OLD_WAY = /\bresolve\(process\.argv\[1\]\)|pathToFileURL\(process\.argv\[1\]\)|=== *import\.meta\.url|import\.meta\.url *===|import\.meta\.main|require\.main/;
  const scripts = walkFiles(repository, ["scripts"], (file: string) => CODE_FILE.test(file) && file !== "scripts/script-paths.mjs");
  assert.ok(scripts.length > 100, "the walk found the scripts");
  assert.deepEqual(scripts.filter((file: string) => OLD_WAY.test(readFileSync(path.join(repository, file), "utf8"))), []);

  // And each really runs that way: through a symlink in a path with a space and Chinese it refuses a bad argument, or says what it checked.
  // scripts/memory-evaluation/scale.mts is not run here (it starts an evaluation); the scan above is what covers it.
  const directory = mkdtempSync(path.join(tmpdir(), "路径 with space-"));
  scratch.push(directory);
  const linked = (script: string, ...args: string[]) => {
    const link = path.join(directory, script.replaceAll("/", "-"));
    symlinkSync(path.join(repository, "scripts", script), link);
    return spawnSync(process.execPath, [link, ...args], { encoding: "utf8" });
  };
  for (const script of ["build-workspace.mjs", "check-secrets.mjs", "ci-queue-verified.mjs", "ci-test-selection.mjs", "ci-shard-weights.mjs", "machine-slot.mjs", "gates/action-contract-snapshot.mjs", "gates/api-snapshot.mjs",
    "gates/dom-events.mjs", "gates/native-checks.mjs", "gates/package-inventory.mjs", "gates/plugin-styles.mjs", "gates/security-invariants.mjs", "gates/translations.mjs"]) {
    const result = linked(script, "--nonsense");
    assert.equal(result.status, 2, `${script}: ${result.stdout}${result.stderr}`);
  }
  assert.equal(linked("gates/page-assets-measure.mjs").status, 2);
  assert.match(linked("memory-evaluation/report.mts").stderr, /用法：report\.mts/);
  assert.match(linked("generate-plugin-registry.mjs", "--check").stdout, /list every built-in plugin/);
  assert.match(linked("package-owners.mjs").stdout, /^owners ok: /);
  assert.match(linked("workspace-packages.mjs").stdout, /^\{/);
});
