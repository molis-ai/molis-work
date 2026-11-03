// W5-15-01 W5-15-02 W5-15-03: the maturity vocabulary (production/experimental/slice/absent) is the only vocabulary the
// SSOT 包成熟度 column and the workspace registry may carry; the retired migration-era words are not accepted anywhere.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PACKAGE_MATURITY, WORKSPACE_PACKAGES, maturityWordError } from "../scripts/workspace-packages.mjs";

const ssot = fs.readFileSync(fileURLToPath(new URL("../docs/SSOT-MATRIX.md", import.meta.url)), "utf8");

test("W5-15-01 the SSOT §2 state table names exactly production, experimental, slice, absent", () => {
  assert.deepEqual(PACKAGE_MATURITY, ["production", "experimental", "slice"]);
  const section = ssot.slice(ssot.indexOf("## 2. 状态词"), ssot.indexOf("## 3. Apps"));
  const words = [...section.matchAll(/^\| `([a-z-]+)` \|/gmu)].map((match) => match[1]);
  assert.deepEqual(words, ["production", "experimental", "slice", "absent"], "the state table is the four-word vocabulary");
  // The retired words may only survive in the retirement note, never as a state table row.
  for (const word of ["legacy-mixed", "contract-only", "partial", "implemented", "retired"]) {
    assert.ok(!words.includes(word), `${word} is retired`);
    assert.ok(!section.includes(`| \`${word}\` |`), `${word} is not a table row`);
  }
});

test("W5-15-03 the registry rejects any maturity word outside the vocabulary, with the package path", () => {
  for (const word of ["production", "experimental", "slice"]) {
    assert.equal(maturityWordError("apps/desktop", word), undefined, word);
  }
  for (const retired of ["absent", "partial", "contract-only", "implemented", undefined, ""]) {
    assert.match(String(maturityWordError("apps/desktop", retired)),
      /^apps\/desktop: package maturity must be one of production\/experimental\/slice, got /u);
  }
  // S11 moved the two production Modules (Goals and Governance) into their plugin; FI-5 merged four production packages (the Feed, Sources
  // and Signals Modules, the listener host) into the Feed plugin. PG-077 removes the Artifact plugin shell; its existing platform
  // Module remains production. Re-measured distribution, 2026-10-30.
  const counts = {};
  for (const item of WORKSPACE_PACKAGES) {
    assert.ok(PACKAGE_MATURITY.includes(item.maturity), `${item.path}: ${item.maturity}`);
    counts[item.maturity] = (counts[item.maturity] ?? 0) + 1;
  }
  assert.deepEqual(counts, { production: 47, experimental: 2, slice: 14 });
  assert.deepEqual(WORKSPACE_PACKAGES.filter(item => item.path === "modules/artifacts").map(item => item.maturity), ["production"]);
  assert.equal(WORKSPACE_PACKAGES.some(item => item.path === "plugins/native/artifacts"), false, "only the retired shell disappears");
});

const manifestOf = (packagePath: string) =>
  JSON.parse(fs.readFileSync(new URL(`../${packagePath}/package.json`, import.meta.url), "utf8")) as {
    name: string;
    "molis-work"?: Record<string, unknown>;
  };
const readmeOf = (packagePath: string) =>
  fs.readFileSync(new URL(`../${packagePath}/README.md`, import.meta.url), "utf8");
const sourceOf = (packagePath: string) =>
  fs.readFileSync(new URL(`../${packagePath}/src/index.ts`, import.meta.url), "utf8");

/** The keys a built-in plugin may declare in its own "molis-work" block (W5-15); the registry derives the rest. */
const PLUGIN_BLOCK_KEYS = ["maturity", "capabilities", "registration", "extraWorkspaceDependencies", "extraDependencies"];

test("W5-15-04 W5-15-05 a built-in plugin declares a narrow block; every other package declares none, and the registry derives the rest", () => {
  for (const item of WORKSPACE_PACKAGES) {
    const manifest = manifestOf(item.path);
    const block = manifest["molis-work"];
    if (item.path.startsWith("plugins/native/")) {
      assert.deepEqual(typeof block, "object", `${item.path}: built-in plugins declare their own block`);
      for (const key of Object.keys(block ?? {})) assert.ok(PLUGIN_BLOCK_KEYS.includes(key), `${item.path}: ${key} has a single writer elsewhere`);
      assert.ok(PACKAGE_MATURITY.includes(String(block?.maturity)), `${item.path}: ${String(block?.maturity)}`);
      assert.equal(block?.registration, "./registration", `${item.path}: registration`);
      assert.equal(item.contract, "@molis-ai/molis-work-contracts/platform/plugin", `${item.path}: plugin contract is fixed by the layer`);
    } else {
      assert.equal(block, undefined, `${item.path}: scripts/workspace-packages.mjs is the only writer of its metadata`);
    }
    // The name comes from its own package.json, the kind from the path; neither is copied into a second file.
    assert.equal(item.name, manifest.name, item.path);
    const expectedKind = item.path === "server" ? "module"
      : item.path.startsWith("apps/") ? "app"
      : item.path.startsWith("packages/") ? "foundation"
      : item.path.startsWith("modules/") ? "module"
      : item.path.startsWith("horizontal/") ? "horizontal"
      : item.path.startsWith("plugins/native/") ? "native-plugin"
      : item.path.startsWith("plugins/official-integrations/") ? "integration-plugin" : "tooling";
    assert.equal(item.kind, expectedKind, `${item.path}: layer from the path`);
  }
});

test("W5-15-06 W5-15-07 W5-15-08 src entries and READMEs no longer carry the retired metadata copies", () => {
  for (const item of WORKSPACE_PACKAGES) {
    const source = sourceOf(item.path);
    for (const retired of ["packageDescriptor", "MolisWorkPackageDescriptor", "migrationGoals", "legacySources"]) {
      assert.ok(!source.includes(retired), `${item.path}/src/index.ts still names ${retired}`);
    }
    const manifest = JSON.stringify(manifestOf(item.path));
    assert.ok(!manifest.includes("migrationGoals"), `${item.path}/package.json still carries migrationGoals`);
    assert.ok(!manifest.includes("legacySources"), `${item.path}/package.json still carries legacySources`);
    const readme = readmeOf(item.path);
    for (const line of ["Status: `", "- Status: `", "Contract entrypoint:", "- Contract entrypoint:", "Migration Goals:", "- Migration Goals:"]) {
      assert.ok(!readme.includes(line), `${item.path}/README.md still carries ${line}`);
    }
  }
});

// RAC-2434: examples/ is not a workspace package — its probe becomes a built-in only in a test's copy of the repository — so W5-15's
// cleanup skipped it. Every directory under examples/ that has a package.json is held to the same vocabulary and block shape; reading
// the directory (not a fixed list) also covers a second example, and a part an example does not have (plugin-sample has no
// src/index.ts) is skipped rather than asserted about.
const EXAMPLE_DIRECTORY = new URL("../examples/", import.meta.url);
const EXAMPLE_PACKAGES = fs.readdirSync(EXAMPLE_DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(new URL(`${entry.name}/package.json`, EXAMPLE_DIRECTORY)))
  .map((entry) => `examples/${entry.name}`);

test("RAC-2434 examples packages carry no retired package metadata, and their built-in block stays narrow", () => {
  assert.ok(EXAMPLE_PACKAGES.length > 0, "examples/ has at least one package to read");
  for (const packagePath of EXAMPLE_PACKAGES) {
    const source = new URL(`../${packagePath}/src/index.ts`, import.meta.url);
    if (fs.existsSync(source)) {
      for (const retired of ["packageDescriptor", "MolisWorkPackageDescriptor", "migrationGoals", "legacySources"]) {
        assert.ok(!fs.readFileSync(source, "utf8").includes(retired), `${packagePath}/src/index.ts still names ${retired}`);
      }
    }
    const manifest = manifestOf(packagePath);
    const serialized = JSON.stringify(manifest);
    for (const retired of ["migrationGoals", "legacySources"]) {
      assert.ok(!serialized.includes(retired), `${packagePath}/package.json still carries ${retired}`);
    }
    const block = manifest["molis-work"];
    if (block !== undefined) {
      for (const key of Object.keys(block)) assert.ok(PLUGIN_BLOCK_KEYS.includes(key), `${packagePath}: ${key} is not a built-in block key`);
      assert.ok(PACKAGE_MATURITY.includes(String(block.maturity)), `${packagePath}: ${String(block.maturity)} is not a maturity word`);
      assert.equal(block.registration, "./registration", `${packagePath}: registration`);
    }
    const readme = new URL(`../${packagePath}/README.md`, import.meta.url);
    if (fs.existsSync(readme)) {
      const text = fs.readFileSync(readme, "utf8");
      for (const line of ["Status: `", "- Status: `", "Contract entrypoint:", "- Contract entrypoint:", "Migration Goals:", "- Migration Goals:"]) {
        assert.ok(!text.includes(line), `${packagePath}/README.md still carries ${line}`);
      }
    }
  }
});

test("W5-15-10 the contract axis keeps its own words: ContractMaturity, not the package vocabulary", () => {
  const contract = fs.readFileSync(new URL("../packages/contracts/src/platform/package.ts", import.meta.url), "utf8");
  assert.match(contract, /export type ContractMaturity = "contract-only" \| "partial" \| "implemented";/u);
  assert.match(contract, /readonly maturity: ContractMaturity;/u);
  assert.ok(!contract.includes("PackageDescriptor"), "the dead package descriptor type is gone");
  assert.ok(!contract.includes("PackageMaturity"), "the retired package maturity type is gone");
  assert.ok(!contract.includes("PackageKind"), "the dead package kind type is gone");
});

test("W5-15-09 capability names have exactly one writer each", () => {
  const byPath = new Map(WORKSPACE_PACKAGES.map((item) => [item.path, item]));
  const capabilities = (packagePath: string) => byPath.get(packagePath)?.capabilities ?? [];
  // The orphan that only lived in workbench's package.json is gone.
  assert.ok(
    !JSON.stringify(manifestOf("apps/workbench")).includes("workbench.goals-proposal-composition.v1"),
    "the workbench orphan capability is deleted",
  );
  // The name that only lived in a deleted descriptor does not sneak back.
  const allCapabilities = JSON.stringify(WORKSPACE_PACKAGES.map((item) => item.capabilities));
  assert.ok(!allCapabilities.includes("workflows.actions.v1"), "the descriptor-only name disappears with the descriptor");
  // Names the plugins already declared in their own block stay there, in one place.
  for (const packagePath of ["plugins/native/schedule", "plugins/native/shelf"]) {
    const block = manifestOf(packagePath)["molis-work"];
    assert.deepEqual(block?.capabilities, capabilities(packagePath), `${packagePath}: the plugin block is the only writer`);
  }
  assert.ok(capabilities("plugins/native/schedule").includes("schedule.actions.v1"));
  assert.ok(capabilities("plugins/native/schedule").includes("schedule.conversation-tasks.v1"));
  assert.ok(capabilities("plugins/native/shelf").includes("shelf.actions.v1"));
  // Modules keep their capability names in the registry; no package block carries them.
  assert.ok(capabilities("modules/characters").includes("characters.actions.v1"));
  assert.equal(manifestOf("modules/characters")["molis-work"], undefined, "modules/characters: the registry is the only writer");
});
