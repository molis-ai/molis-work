// W4-01 (specs/repository-anti-corruption/slices/w5-02-registry.md §6; docs/system/CONTRACT-CHANGES.md §4 item 7): the plugins in
// the replay corpus load, run, upgrade and run again on this build, and a sample that breaks any of those steps fails the replay.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
type Report = { results: Array<{ id: string; ok: boolean; error?: string; steps: { load: { version: string } | null; upgrade: { from: string; to: string } | null } }> };
function replay(...args: string[]) {
  const run = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "scripts/replay-plugins.mjs", "--json", ...args], { cwd: root, encoding: "utf8", timeout: 300_000 });
  return { status: run.status, report: JSON.parse(run.stdout.trim().split("\n").at(-1)!) as Report, stderr: run.stderr };
}

test("RAC-770 every sample of the replay corpus loads, runs, upgrades by upgrade_compatibility and runs again", { timeout: 300_000 }, () => {
  const { status, report, stderr } = replay();
  assert.equal(status, 0, JSON.stringify(report, null, 2) + stderr);
  assert.deepEqual(report.results.map(result => [result.id, result.ok]), [["plugin-sample", true], ["text-stats-packed", true]]);
  for (const result of report.results) assert.ok(result.steps.upgrade && result.steps.upgrade.from === result.steps.load!.version && result.steps.upgrade.to !== result.steps.upgrade.from, result.id);
});

test("RAC-771 a sample that declares badly, offers no such action or answers differently fails the replay", { timeout: 300_000 }, () => {
  const { status, report } = replay("--corpus", "tests/fixtures/replay-plugins/broken-corpus.json");
  assert.equal(status, 1);
  const failed = Object.fromEntries(report.results.map(result => [result.id, result.ok ? "passed" : result.error]));
  assert.match(failed["undeclared-permission"]!, /broken:read/, "the Manifest check refuses an undeclared permission at load");
  assert.equal(report.results.find(result => result.id === "undeclared-permission")!.steps.load, null);
  assert.match(failed["action-not-offered"]!, /is not in the project's action directory/);
  assert.match(failed["different-answer"]!, /expected/);
});
