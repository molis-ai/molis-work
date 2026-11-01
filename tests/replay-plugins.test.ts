// W4-01 (specs/repository-anti-corruption/slices/w5-02-registry.md §6; docs/system/CONTRACT-CHANGES.md §4 item 7): the plugins in
// the replay corpus load, run, upgrade and run again on this build, and a sample that breaks any of those steps fails the replay.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SANDBOX_PACKAGE_FILES, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { newPublisher, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
type Installation = { install_id: string; plugin_id: string; version: string; state: string; trust: string; publisher: string };
type CliResult = { code: number; out: { installed: boolean | { plugin_id: string; version: string; publisher_key_id: string } } };
type Result = { id: string; ok: boolean; status?: string; error?: string; steps: {
  load: { plugin_id: string; version: string; publisher?: string } | null;
  uninstalled?: { actions: unknown[]; installations: unknown[]; publishers: unknown[] } | null;
  preview?: { result: CliResult; actions: unknown[]; installations: unknown[]; publishers: unknown[] } | null;
  install?: { result: CliResult; record: Installation } | null;
  before?: { initial: unknown; write: unknown } | null; run?: unknown;
  upgrade: { from: string; to: string; preview?: CliResult; result?: CliResult | null; preview_read?: unknown; record?: Installation | null } | null;
  run_after_upgrade?: unknown; restart?: Installation | null; restarted_read?: unknown;
} };
type Report = { results: Result[] };
function replay(...args: string[]) {
  const run = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "scripts/replay-plugins.mjs", "--json", ...args], { cwd: root, encoding: "utf8", timeout: 300_000 });
  return { status: run.status, report: JSON.parse(run.stdout.trim().split("\n").at(-1)!) as Report, stderr: run.stderr };
}

test("RAC-790 every sample of the replay corpus loads, runs, upgrades by upgrade_compatibility and runs again", { timeout: 300_000 }, () => {
  const { status, report, stderr } = replay();
  assert.equal(status, 0, JSON.stringify(report, null, 2) + stderr);
  assert.deepEqual(report.results.map(result => [result.id, result.ok]), [["plugin-sample", true], ["text-stats-packed", true]]);
  for (const result of report.results) assert.ok(result.steps.upgrade && result.steps.upgrade.from === result.steps.load!.version && result.steps.upgrade.to !== result.steps.upgrade.from, result.id);
});

test("RAC-791 a sample that declares badly, offers no such action or answers differently fails the replay", { timeout: 300_000 }, () => {
  const { status, report } = replay("--corpus", "tests/fixtures/replay-plugins/broken-corpus.json");
  assert.equal(status, 1);
  const failed = Object.fromEntries(report.results.map(result => [result.id, result.ok ? "passed" : result.error]));
  assert.match(failed["undeclared-permission"]!, /broken:read/, "the Manifest check refuses an undeclared permission at load");
  assert.equal(report.results.find(result => result.id === "undeclared-permission")!.steps.load, null);
  assert.match(failed["action-not-offered"]!, /is not in the project's action directory/);
  assert.match(failed["different-answer"]!, /expected/);
});

const MECHANICAL_ID = "io.molis.work.replay.mechanical";
const NOTE = "机械 runner note";
/** Handwritten test material, never a model-generated corpus sample. Only the temporary packages are signed. */
function mechanicalList(files: PackageFiles) {
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!);
  contract.operations.find((operation: { id: string }) => operation.id === "notes.add").effects.storage = ["read", "write"];
  contract.operations.find((operation: { id: string }) => operation.id === "notes.list").output = {
    type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["id", "text", "created_at"],
      properties: { id: { type: "string" }, text: { type: "string" }, created_at: { type: "string" } },
    } } },
  };
  contract.operations.find((operation: { id: string }) => operation.id === "notes.list").examples = [{ input: {}, output: { items: [] } }];
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  const ui = JSON.parse(files[SANDBOX_PACKAGE_FILES.interface]!);
  ui.parts = ui.parts.filter((part: { id: string }) => part.id === "title");
  ui.nodes = ui.nodes.filter((node: { id: string }) => node.id === "title");
  files[SANDBOX_PACKAGE_FILES.interface] = JSON.stringify(ui);
  files[SANDBOX_PACKAGE_FILES.entrypoint] = `export const operations = {
    'notes.list': async (_input, sdk) => ({ items: JSON.parse((await sdk.storage.get('notes')) ?? '[]') }),
    'notes.add': async (input, sdk) => { const notes = JSON.parse((await sdk.storage.get('notes')) ?? '[]'); notes.push({ id: String(notes.length + 1), text: input.text, created_at: new Date().toISOString() }); await sdk.storage.set('notes', JSON.stringify(notes)); return true; },
  };\n`;
}

function signedCorpus() {
  const scratch = mkdtempSync(path.join(tmpdir(), "replay-mechanical-test-")), publisher = newPublisher();
  const packageFile = (name: string, version: string, compatible: boolean) => {
    const file = path.join(scratch, name);
    writeFileSync(file, JSON.stringify(signedPackage(publisher, (files: PackageFiles, manifest: PluginManifest) => {
      mechanicalList(files);
      if (compatible) manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
    }, { pluginId: MECHANICAL_ID, version })));
    return file;
  };
  const v1 = packageFile("v1.json", "1.0.0", false), v2 = packageFile("v2.json", "1.0.1", true);
  const incompatible = packageFile("incompatible-v2.json", "1.0.1", false);
  const sample = {
    id: "signed-mechanical-list", source: { kind: "signed-package", path: v1, upgrade_path: v2 },
    action: { operation_id: "notes.list", version: 1, input: {}, initial_expect: { items: [] }, expect_texts: [NOTE] },
    write: { operation_id: "notes.add", version: 1, input: { text: NOTE }, expect: true },
  };
  return { scratch, publisher: publisher.identity, sample, incompatible,
    corpus(samples: unknown[]) { const file = path.join(scratch, "corpus.json"); writeFileSync(file, JSON.stringify({ about: "Mechanical runner tests; not model-generated samples", samples })); return file; },
    close() { rmSync(scratch, { recursive: true, force: true }); },
  };
}

function unsupported(result: Result) {
  assert.equal(result.ok, false);
  assert.equal(result.status, "unsupported");
  assert.match(result.error!, /macOS sandbox/);
  assert.ok(Object.values(result.steps).every(step => step === null), JSON.stringify(result));
}

test("RAC-790 W4-01 signed-package replay uses CLI preview/pin, one write, the same installation's v2 upgrade and a resident Host restart", { timeout: 300_000 }, () => {
  const fixture = signedCorpus();
  try {
    const original = JSON.parse(readFileSync(path.join(root, "tests/fixtures/replay-plugins/corpus.json"), "utf8")).samples;
    for (const sample of original) if (sample.source.kind === "directory") sample.source.path = path.resolve(root, "tests/fixtures/replay-plugins", sample.source.path);
    const { status, report, stderr } = replay("--corpus", fixture.corpus([...original, fixture.sample]));
    assert.deepEqual(report.results.slice(0, 2).map(result => [result.id, result.ok]), [["plugin-sample", true], ["text-stats-packed", true]]);
    const result = report.results[2]!;
    assert.equal(status, process.platform === "darwin" ? 0 : 1, JSON.stringify(report, null, 2) + stderr);
    if (process.platform !== "darwin") { unsupported(result); return; }
    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    const steps = result.steps;
    assert.deepEqual(steps.uninstalled, { actions: [], installations: [], publishers: [] });
    assert.equal(steps.preview!.result.code, 0);
    assert.equal(steps.preview!.result.out.installed, false);
    assert.deepEqual([steps.preview!.actions, steps.preview!.installations, steps.preview!.publishers], [[], [], []]);
    assert.equal(steps.install!.result.code, 0);
    assert.deepEqual(steps.install!.result.out.installed, { plugin_id: MECHANICAL_ID, version: "1.0.0", publisher_key_id: fixture.publisher });
    assert.deepEqual(steps.before, { initial: { items: [] }, write: true });
    const rows = (steps.run as { items: Array<{ id: string; text: string; created_at: string }> }).items;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.text, NOTE);
    assert.ok(rows[0]!.id && Number.isFinite(Date.parse(rows[0]!.created_at)));
    assert.deepEqual([steps.upgrade!.from, steps.upgrade!.to], ["1.0.0", "1.0.1"]);
    const installed = steps.install!.record;
    assert.deepEqual(installed, { install_id: installed.install_id, plugin_id: MECHANICAL_ID, version: "1.0.0", state: "running", trust: "pinned", publisher: fixture.publisher });
    assert.ok(installed.install_id);
    assert.deepEqual(steps.upgrade!.record, { ...installed, version: "1.0.1" });
    assert.deepEqual(steps.upgrade!.preview_read, steps.run);
    assert.equal(steps.upgrade!.result!.code, 0);
    assert.deepEqual(steps.restart, steps.upgrade!.record);
    assert.deepEqual(steps.run_after_upgrade, steps.run);
    assert.deepEqual(steps.restarted_read, steps.run, "one persistent record, with the same id/time; no second add during upgrade or restart");
  } finally { fixture.close(); }
});

test("RAC-791 W4-01 a signed incompatible upgrade or wrong fixed oracle fails the package replay and leaves later steps unrun", { timeout: 300_000 }, () => {
  const fixture = signedCorpus();
  try {
    const { status, report } = replay("--corpus", fixture.corpus([
      { ...fixture.sample, id: "incompatible-package", source: { ...fixture.sample.source, upgrade_path: fixture.incompatible } },
      { ...fixture.sample, id: "wrong-package-oracle", action: { ...fixture.sample.action, expect_texts: ["wrong fixed value"] } },
    ]));
    assert.equal(status, 1);
    assert.deepEqual(report.results.map(result => result.ok), [false, false]);
    if (process.platform !== "darwin") { report.results.forEach(unsupported); return; }
    const [badPackage, badOracle] = report.results;
    assert.match(badPackage!.error!, /plugin\.upgrade_required|upgrade_compatibility/);
    assert.match(badOracle!.error!, /expected.*wrong fixed value/);
    assert.equal(badPackage!.steps.upgrade!.preview!.code, 0);
    assert.equal(badPackage!.steps.upgrade!.result!.code, 1, "the resident Host refused the real upgrade confirmation");
    assert.deepEqual(badPackage!.steps.upgrade!.record, badPackage!.steps.install!.record, "the refused package left the original installation running");
    assert.equal(badOracle!.steps.upgrade, null);
    for (const result of report.results) {
      assert.ok(result.steps.install && result.steps.run, JSON.stringify(result));
      assert.equal(result.steps.run_after_upgrade, null);
      assert.equal(result.steps.restart, null);
      assert.equal(result.steps.restarted_read, null);
    }
  } finally { fixture.close(); }
});
