import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { projectDeletedHooksFor, homeStores } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { retainedDeclaration, retainedRegistryPath, stripRetainedSnapshotDeclaration } from "./fixtures/home-snapshot-declaration.js";

// SC-4 (specs/repository-anti-corruption/slices/sc-4-sessions-offline.md): the Sessions plugin is gone; what is left is the
// retired `<home>/sessions/` store that only backup and purge still know.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = (path: string) => readFileSync(join(root, path), "utf8");

/** Every product source file (no tests, no builds, no dependencies) under the code roots. */
function productSources(): string[] {
  const out: string[] = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      if (["node_modules", "dist", "tests", "archive", ".git", ".impeccable"].includes(name)) continue;
      const path = join(directory, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else if (/\.(?:ts|mts|mjs)$/u.test(name) && !name.endsWith(".d.ts")) out.push(path);
    }
  };
  for (const top of ["apps", "packages", "modules", "plugins", "horizontal", "server", "installer"]) {
    if (existsSync(join(root, top))) walk(join(root, top));
  }
  return out;
}

test("RAC-210 the Work package and every `sessions` plugin entry are gone", () => {
  assert.equal(existsSync(join(root, "plugins/native/work")), false);
  assert.equal(BUILTIN_PLUGIN_CATALOG.some(entry => entry.id === "sessions"), false);
  const frozen = text("tests/builtin-plugin-assembly-gate.test.ts");
  assert.doesNotMatch(frozen, /["']sessions["']/u, "the frozen assembly list no longer names sessions");
  assert.doesNotMatch(text("apps/local-host/src/project-plugins.ts"), /molis-work-plugin-work["']/u);
  assert.doesNotMatch(text("apps/workbench/src/builtin-plugins.ts"), /plugin-work["']|workRegistration/u);
});

test("RAC-211 the private work context module keeps only Runtime context bindings", () => {
  const files = readdirSync(join(root, "modules/private-work-context/src")).sort();
  assert.deepEqual(files, [
    "binding-errors.ts", "context-binding-references.ts", "context-bindings.ts", "index.ts", "project-binding-commands.ts",
    "project-binding-validation.ts", "project-resolution.ts", "project-setup.ts", "project-suggestions.ts", "runtime-binding-records.ts", "runtime-context-module.ts",
  ]);
  const contract = text("packages/contracts/src/modules/private-work-context.ts");
  assert.doesNotMatch(contract, /WorkSession|sessionErrors|PrivateWorkContextApplicationApi/u);
  assert.equal(existsSync(join(root, "packages/contracts/src/modules/session-messages.ts")), false);
});

test("RAC-212 runtime business code never opens the retired store; only its exact literal offline declaration is allowed", () => {
  const opener = /sessions\.db|session_meta|content\.key|["']sessions["']\s*,\s*["'](?:sessions\.db|content)["']/u;
  const source = (path: string) => stripRetainedSnapshotDeclaration(path, text(path));
  const offenders = productSources().map(path => relative(root, path)).filter(path => opener.test(source(path)));
  assert.deepEqual(offenders, []);
  const mentions = productSources().map(path => relative(root, path))
    .filter(path => /join\([^)]*["']sessions["']/u.test(source(path)) && !path.startsWith("plugins/native/coding/"));
  assert.deepEqual(mentions, [], "the only place that names the directory is the store registry");
});

test("RAC-213 backup and purge still know sessions/; deleting a project has no sessions owner", () => {
  const store = homeStores().get("sessions");
  assert.ok(store, "the retired store stays registered, so backup and uninstall --purge-user-data keep covering it");
  assert.equal(store.owner, "apps/local-host");
  assert.deepEqual(store.snapshot.retained, retainedDeclaration.snapshot.retained, "RAC-104-S-01: the real registry supplies only strict version-7 metadata and the original key dependency");
  assert.ok(homeStores().paths("/home").includes(join("/home", "sessions")));
  assert.ok(!projectDeletedHooksFor(join(root, ".nonexistent-home")).owners().some(owner => owner.id === "sessions"));
});

test("RAC-212 RAC-104-S-01: the declaration detector rejects runtime openers and executable declaration expressions", () => {
  const source = text(retainedRegistryPath), opener = /sessions\.db|session_meta|content\.key/u;
  assert.doesNotMatch(stripRetainedSnapshotDeclaration(retainedRegistryPath, source), opener);
  const added = source + '\nnew Database(join(home, "sessions", "sessions.db"));\n';
  assert.match(stripRetainedSnapshotDeclaration(retainedRegistryPath, added), opener, "a business opener elsewhere in the same file is never removed");
  assert.match(stripRetainedSnapshotDeclaration("apps/local-host/src/another-reader.ts", added), opener, "no other file can use the declaration exemption");
  assert.throws(() => stripRetainedSnapshotDeclaration(retainedRegistryPath, source.replace('file: "sessions.db"', 'file: open("sessions.db")')), /literal/u);
  assert.throws(() => stripRetainedSnapshotDeclaration(retainedRegistryPath, source.replace('version: 7', 'version: (() => 7)()')), /literal/u);
  assert.throws(() => stripRetainedSnapshotDeclaration(retainedRegistryPath, source.replace('table: "session_meta"', 'table: "session_messages"')), /Expected values/u);
});

test("RAC-214 the home has no 说一句 (home talk)", () => {
  const talk = /home\.talk|home-talk|HOME_TALK|data-home-open-talk|data-home-talk/u;
  const offenders = productSources().map(path => relative(root, path)).filter(path => talk.test(text(path)));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(text("tooling/gates/actions/host-actions.tsv"), /^home\.talk\./mu);
});

test("RAC-215 the Sessions routes are gone while workspace settings and Goal terminals keep their routes", () => {
  const routes = JSON.parse(text("tests/fixtures/web-route-table.snapshot.json")) as Record<string, { status: number }>;
  assert.equal(routes["GET <project>/api/sessions"]?.status, 404);
  assert.equal(routes["GET <project>/sessions (page)"]?.status, 302, "the old page address redirects to 'missing'");
  assert.deepEqual(Object.keys(routes).filter(key => /\/api\/session-|workspaces\/[^ ]+\/sessions/u.test(key)), []);
  assert.ok(routes["GET <project>/api/panels"], "Goal terminal panels keep their route");
  assert.ok(routes["GET <project>/workspaces (page)"], "workspace pages keep answering (as a missing redirect, they have no management page)");
});

test("RAC-216 the action snapshot has no sessions.* and no home.talk rows", () => {
  const actions = text("tooling/gates/actions/actions.tsv");
  assert.doesNotMatch(actions, /^sessions\./mu);
  assert.doesNotMatch(actions, /io\.molis\.work\.sessions/u);
});

test("RAC-217 no name list in the workbench or the design system carries sessions", () => {
  const listed = /["']sessions["']/u;
  const offenders = productSources().map(path => relative(root, path))
    .filter(path => (path.startsWith("apps/workbench/src/") || path.startsWith("packages/design-system/src/")) && listed.test(text(path)));
  assert.deepEqual(offenders, []);
});

test("RAC-219 the product documents say Sessions is offline and the redo is BL-177", () => {
  for (const path of ["PRODUCT.md", "docs/SSOT-MATRIX.md", "docs/system/HOME-DATA.md", "docs/system/GLOSSARY.md", "docs/product-operations/产品介绍.md", "docs/product-operations/功能全景.md"]) {
    const document = text(path);
    assert.match(document, /BL-177/u, `${path} points at the redo`);
    assert.match(document, /下线|作废/u, `${path} says Sessions is offline`);
  }
});
