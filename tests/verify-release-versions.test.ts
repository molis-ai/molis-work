import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import { declarationFindings } from "../scripts/gates/version-declarations.mjs";

// docs/releases/POLICY.md: one product version and central tooling/versions.json authority.
// The script is run against this repository (it must pass), and each rule is mutation-verified on a small scratch
// tree: one violation makes it fail and name the place, the unmutated tree passes.
const script = fileURLToPath(new URL("../scripts/verify-release-versions.mjs", import.meta.url));
const repository = fileURLToPath(new URL("..", import.meta.url));
const scratch: string[] = [];
let root = "";

// Scratch files whose literals these release rules break one at a time; the declaration rules have their own file (tests/version-source.test.ts).
// An exception names the literals it lets through, so the list is written from the fixture as it stands when the script runs.
let scratchFiles = new Set<string>();
const scratchLiterals = (...files: string[]) => { for (const file of files) scratchFiles.add(file); };
const writeScratchExceptions = () => {
  const counts = new Map<string, Record<string, number>>();
  const findings: Array<{ file: string; name: string; value: string }> = existsSync(path.join(root, "tooling/versions.json")) ? declarationFindings(root) : [];
  for (const { file, name, value } of findings) {
    if (!scratchFiles.has(file)) continue;
    const id = JSON.stringify([file, name]), values = counts.get(id) ?? {};
    values[value] = (values[value] ?? 0) + 1;
    counts.set(id, values);
  }
  put("tooling/gates/version-exceptions.json", JSON.stringify([...counts].map(([id, values]) => {
    const [file, name] = JSON.parse(id);
    return { file, name, values, reason: "scratch fixture for the release rules, not a declaration" };
  })));
};
const run = (...args: string[]) => {
  writeScratchExceptions();
  const result = spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
// Explicit fixture authorities keep the real read-only --root contract, including rejection of missing sources.
const ownVersion = (file: string, key: string, value: string | number, pattern?: string) => {
  const source = JSON.parse(readFileSync(path.join(root, "tooling/versions.json"), "utf8"));
  source.versions[key] = value;
  if (pattern && !source.carriers.some((carrier: { file: string; pattern: string }) => carrier.file === file && carrier.pattern === pattern)) source.carriers.push({ file, key, pattern });
  put("tooling/versions.json", JSON.stringify(source));
};
const edit = (file: string, from: string, to: string) => {
  const text = readFileSync(path.join(root, file), "utf8");
  assert.ok(text.includes(from), `${file} does not contain ${from}`);
  writeFileSync(path.join(root, file), text.replace(from, to));
};
const rmSyncFile = (file: string) => rmSync(path.join(root, file), { force: true });
const failsWith = (result: { code: number | null; out: string }, ...fragments: string[]) => {
  assert.equal(result.code, 1, result.out);
  for (const fragment of fragments) assert.ok(result.out.includes(fragment), `${fragment}\n--\n${result.out}`);
};

const VERSION = "1.2.3";

// A scratch repository that satisfies every rule; the tests break one thing at a time.
const buildFixture = () => {
  put("tooling/versions.json", JSON.stringify({ versions: {}, carriers: [] }));
  put("package.json", JSON.stringify({ name: "root", version: VERSION }));
  ownVersion("package.json", "product.release", VERSION, '("version":")[^"]+(")');
  ownVersion("apps/local-host/src/product-version.ts", "product.release", VERSION, '(PRODUCT_VERSION = ")[^"]+(")');
  ownVersion("apps/desktop/src-tauri/tauri.conf.json", "product.release", VERSION, '("version":")[^"]+(")');
  ownVersion("apps/desktop/src-tauri/Cargo.toml", "product.release", VERSION, '(\\[package\\]\\nname = "molis-work-desktop"\\nversion = ")[^"]+(")');
  ownVersion("apps/desktop/src-tauri/Cargo.lock", "product.release", VERSION, '(name = "molis-work-desktop"\\nversion = ")[^"]+(")');
  // These fixtures keep their versions in carriers so the rules below can break one literal at a time.
  scratchFiles = new Set(["apps/local-host/src/product-version.ts"]);
  for (const snapshot of ["actions", "host-actions", "scenes", "host-scenes"]) put(`tooling/gates/actions/${snapshot}.tsv`, "");
  put("pnpm-workspace.yaml", "# comment\npackages:\n  - 'apps/*'\n  - 'server'\n\noverrides:\n  x: 1\n");
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "0.0.0", private: true }));
  put("server/package.json", JSON.stringify({ name: "server", version: "0.0.0", private: true }));
  put("apps/desktop/src-tauri/tauri.conf.json", JSON.stringify({ productName: "Molis Work", version: VERSION }));
  put("apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "molis-work-desktop"\nversion = "${VERSION}"\n\n[dependencies]\nserde = { version = "1" }\n\n[dependencies.other]\nversion = "7"\n`);
  put("apps/desktop/src-tauri/Cargo.lock", `[[package]]\nname = "other"\nversion = "7.0.0"\n\n[[package]]\nname = "molis-work-desktop"\nversion = "${VERSION}"\ndependencies = [\n "other",\n]\n`);
  put("apps/local-host/src/product-version.ts", `export const PRODUCT_VERSION = "${VERSION}";\n`);
  put(`docs/releases/v${VERSION}.md`, "# notes\n");
  put("docs/releases/CHANGELOG.md", `# Changelog\n\n## [Unreleased]\n\n## [${VERSION}] - 2026-01-01\n\n## [1.2.2] - 2025-12-01\n`);
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "molis-release-versions-"));
  scratch.push(root);
  buildFixture();
});
after(() => { for (const directory of scratch) rmSync(directory, { recursive: true, force: true }); });

test("this repository: the version sources agree", () => {
  const result = spawnSync(process.execPath, [script, "--root", repository], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const version = (JSON.parse(readFileSync(path.join(repository, "package.json"), "utf8")) as { version: string }).version;
  assert.equal(result.stdout.split("\n")[0], `Molis Work release version sources agree: ${version}`);
});

test("a consistent scratch tree passes, and the tag may be v<version>", () => {
  const plain = run();
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, new RegExp(`release version sources agree: ${VERSION}`));
  assert.match(plain.out, /2 workspace packages are private 0\.0\.0/);
  assert.equal(run("--tag", `v${VERSION}`).code, 0);
  assert.equal(run(`--tag=v${VERSION}`).code, 0);
});

test("every place that carries the product version must equal it", () => {
  const carriers: Array<[string, string, string]> = [
    ["apps/desktop/src-tauri/tauri.conf.json", `"version":"${VERSION}"`, '"version":"9.9.9"'],
    ["apps/desktop/src-tauri/Cargo.toml", `version = "${VERSION}"`, 'version = "9.9.9"'],
    ["apps/desktop/src-tauri/Cargo.lock", `name = "molis-work-desktop"\nversion = "${VERSION}"`, 'name = "molis-work-desktop"\nversion = "9.9.9"'],
    ["apps/local-host/src/product-version.ts", `PRODUCT_VERSION = "${VERSION}"`, 'PRODUCT_VERSION = "9.9.9"'],
  ];
  for (const [file, from, to] of carriers) {
    buildFixture();
    edit(file, from, to);
    failsWith(run(), `${file}: differs from tooling/versions.json`);
  }
});

// The Host's code announces the product version in several places (Feed's User-Agent and app version, the search runtime's app
// version, the MCP client version, the Codex transport's client version). They all import PRODUCT_VERSION, so the release check
// reads one line; a literal beside it would be a carrier the check does not know. Scoped to the two source trees that announce the
// Host's identity, so another package's own "1.0.0" is not mistaken for the product version.
test("this repository: the Host's code spells the product version only in product-version.ts", () => {
  const version = (JSON.parse(readFileSync(path.join(repository, "package.json"), "utf8")) as { version: string }).version;
  const quoted = new RegExp(`["'\`]${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);
  const walk = (directory: string): string[] => readdirSync(path.join(repository, directory), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? (entry.name === "node_modules" || entry.name === "dist" ? [] : walk(`${directory}/${entry.name}`))
      : /\.[cm]?[tj]s$/.test(entry.name) ? [`${directory}/${entry.name}`] : []);
  const spelled = ["apps/local-host/src", "horizontal/runtime-host/src"].flatMap(walk)
    .filter(file => file !== "apps/local-host/src/product-version.ts" && quoted.test(readFileSync(path.join(repository, file), "utf8")));
  assert.deepEqual(spelled, [], `these files spell out ${version}; import PRODUCT_VERSION from apps/local-host/src/product-version.ts (or take the version as an option from the Host) so the release check has one line to read`);
});

test("a carrier that cannot be read counts as a mismatch, not as a pass", () => {
  rmSyncFile("apps/desktop/src-tauri/Cargo.toml");
  failsWith(run(), "apps/desktop/src-tauri/Cargo.toml: carrier file is missing");
  buildFixture();
  put("apps/desktop/src-tauri/tauri.conf.json", "{ not json");
  failsWith(run(), "apps/desktop/src-tauri/tauri.conf.json: carrier for product.release matches nothing");
  buildFixture();
  put("package.json", JSON.stringify({ name: "root", version: "one" }));
  failsWith(run(), "package.json: version \"one\" is not MAJOR.MINOR.PATCH");
});

test("a tag other than v<package version> fails", () => {
  failsWith(run("--tag", "v9.9.9"), `tag v9.9.9 is not v${VERSION}`);
  failsWith(run("--tag", VERSION), `tag ${VERSION} is not v${VERSION}`);
});

test("workspace packages are private and stay 0.0.0", () => {
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "1.0.0", private: true }));
  failsWith(run(), "apps/alpha/package.json: workspace packages stay 0.0.0, found 1.0.0");
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "0.0.0" }));
  failsWith(run(), "apps/alpha/package.json: workspace packages are private");
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "0.0.0", private: true }));
  put("apps/beta/package.json", JSON.stringify({ name: "beta", version: "0.0.1", private: true }));
  failsWith(run(), "apps/beta/package.json: workspace packages stay 0.0.0");
});

test("a workspace pattern the check cannot expand is refused, not skipped", () => {
  put("pnpm-workspace.yaml", "packages:\n  - 'apps/**'\n  - 'server'\n");
  failsWith(run(), "pnpm-workspace.yaml: pattern apps/** is not supported by this check");
});

test("the current version needs release notes and a CHANGELOG section, [Unreleased] first", () => {
  rmSyncFile(`docs/releases/v${VERSION}.md`);
  failsWith(run(), `docs/releases/v${VERSION}.md: release notes for ${VERSION} are missing`);
  buildFixture();
  put("docs/releases/CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n## [1.2.2] - 2025-12-01\n");
  failsWith(run(), `no [${VERSION}] section`);
  buildFixture();
  put("docs/releases/CHANGELOG.md", `# Changelog\n\n## [${VERSION}] - 2026-01-01\n\n## [Unreleased]\n`);
  failsWith(run(), "the first section must be [Unreleased], found [1.2.3]");
  buildFixture();
  rmSyncFile("docs/releases/CHANGELOG.md");
  failsWith(run(), "docs/releases/CHANGELOG.md: the file is missing");
});

test("every finding is listed in one run, not only the first", () => {
  edit("apps/desktop/src-tauri/Cargo.toml", `version = "${VERSION}"`, 'version = "9.9.9"');
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "2.0.0", private: true }));
  rmSyncFile(`docs/releases/v${VERSION}.md`);
  failsWith(run(), "Cargo.toml: differs from tooling/versions.json", "workspace packages stay 0.0.0", "release notes");
});

test("an unusable command line exits 2, not 0 or 1", () => {
  for (const args of [["--unknown"], ["--tag"], ["--root"], ["--tag", "--root", root]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, `${args.join(" ")}\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /usage: verify-release-versions\.mjs/);
  }
});

// REL-03: native Manifest versions are checked before any build or tag publication.
test("a bundled plugin with a different or nonliteral version refuses release; integrations remain independent", () => {
  edit("pnpm-workspace.yaml", "  - 'server'", "  - 'server'\n  - 'plugins/native/*'\n  - 'plugins/official-integrations/*'");
  ownVersion("plugins/native/alpha/src/manifest.ts", "manifest.schema", 1, '(schema_version: )\\d+()');
  scratchLiterals("plugins/native/alpha/src/manifest.ts", "plugins/official-integrations/alpha/src/manifest.ts");
  put("plugins/native/alpha/package.json", JSON.stringify({ name: "native-alpha", version: "0.0.0", private: true }));
  put("plugins/native/alpha/src/manifest.ts", `export const manifest = { schema_version: 1, version: '${VERSION}' };`);
  put("plugins/official-integrations/alpha/package.json", JSON.stringify({ name: "integration-alpha", version: "0.0.0", private: true }));
  put("plugins/official-integrations/alpha/src/manifest.ts", `export const manifest = { version: "9.0.0" };`);
  assert.equal(run().code, 0);
  edit("plugins/native/alpha/src/manifest.ts", VERSION, "1.0.0");
  failsWith(run(), "plugins/native/alpha/src/manifest.ts", "1.0.0", VERSION);
  put("plugins/native/alpha/src/manifest.ts", "export const manifest = { version: dynamicVersion };");
  failsWith(run(), "bundled Manifest version not found");
  rmSyncFile("plugins/native/alpha/src/manifest.ts");
  failsWith(run(), "plugins/native/alpha/src/manifest.ts", "missing");
});

// N34-VS-03: removing the only authority or introducing an unmanaged current declaration cannot pass.
test("the central version source is mandatory and unmanaged current declarations fail", () => {
  rmSyncFile("tooling/versions.json");
  failsWith(run(), "tooling/versions.json");
  buildFixture();
  put("apps/alpha/src/unmanaged.ts", "export const NEW_SCHEMA_VERSION = 1;\n");
  failsWith(run(), "unmanaged current version");
});

// N34-VS-01/02/04: independent fields in one carrier accumulate, and marked code keeps one current data flow.
const generator = fileURLToPath(new URL("../scripts/generate-versions.mjs", import.meta.url));
const generate = (mode: "--write" | "--check") => spawnSync(process.execPath, [generator, "--root", root, mode], { encoding: "utf8" });
test("N34-VS-01/04: several carrier fields preserve legal JSON and unrelated bytes", () => {
  put("apps/alpha/src/carrier.json", '{"outer":1,"inner":2,"revision":7}\n');
  ownVersion("apps/alpha/src/carrier.json", "format.outer", 3, '("outer":)\\d+()');
  ownVersion("apps/alpha/src/carrier.json", "format.inner", 4, '("inner":)\\d+()');
  const result = generate("--write");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.equal(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version, VERSION);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, "apps/alpha/src/carrier.json"), "utf8")), { outer: 3, inner: 4, revision: 7 });
  assert.equal(generate("--check").status, 0);
});

test("N34-VS-02/04: one format entry reaches type, writer and refusal comparison and generation is idempotent", () => {
  put("apps/alpha/src/flow.mjs", [
    "export const FORMAT_VERSION = /* @version format.fixture */ 1;",
    "export const write = () => ({ version: /* @version format.fixture */ 1, revision: 1 });",
    'export function read(input) { if (input.version !== /* @version format.fixture */ 1) throw Error("refused"); return input; }',
  ].join("\n"));
  put("apps/alpha/src/flow.ts", "export interface Format { version: /* @version format.fixture */ 1; revision: number }\n");
  ownVersion("apps/alpha/src/flow.mjs", "format.fixture", 2);
  const stale = generate("--check");
  assert.equal(stale.status, 1);
  const result = generate("--write");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const file = path.join(root, "apps/alpha/src/flow.mjs"), before = readFileSync(file);
  assert.match(readFileSync(path.join(root, "apps/alpha/src/flow.ts"), "utf8"), /version: \/\* @version format.fixture \*\/ 2/);
  const execution = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { pathToFileURL } from "node:url";
    const { write, read, FORMAT_VERSION } = await import(pathToFileURL(${JSON.stringify(file)}).href);
    assert.equal(FORMAT_VERSION, 2);
    assert.deepEqual(read(write()), {version: 2, revision: 1});
    const old = {version: 1, revision: 7};
    assert.throws(() => read(old), /refused/);
    assert.deepEqual(old, {version: 1, revision: 7});
  `], { encoding: "utf8" });
  assert.equal(execution.status, 0, `${execution.stdout}${execution.stderr}`);
  assert.equal(generate("--write").status, 0);
  assert.deepEqual(readFileSync(file), before);
  assert.equal(generate("--check").status, 0);
});

test("N34-VS-03: an unresolved version key is a failure", () => {
  put("apps/alpha/src/key.ts", "export const FORMAT_VERSION = /* @version missing.owner */ 1;\n");
  const result = generate("--check");
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /apps\/alpha\/src\/key\.ts: unknown version key missing\.owner/);
});

// N34-VS-03: a new integration JSON carrier cannot bypass the source checks while reusing already managed keys.
test("N34-VS-03 an unmanaged integration Manifest JSON is refused", () => {
  put("plugins/official-integrations/new/manifest.json", JSON.stringify({ schema_version: 1, host_api_version: 1, version: "1.0.0", capabilities: ["connector.host.v1"] }));
  failsWith(run(), "plugins/official-integrations/new/manifest.json:1: unmanaged Manifest field schema_version");
});

// N34-VS-03: value equality cannot turn a handwritten Manifest release into a managed declaration.
test("N34-VS-03 a handwritten Manifest SemVer is refused even when it equals the central product version", () => {
  put("plugins/native/new/src/manifest.ts", `export const manifest = { plugin_id: "io.molis.work.new", version: "${VERSION}" };\n`);
  failsWith(run(), "plugins/native/new/src/manifest.ts:1: unmanaged current version version = \"1.2.3\"");
});
