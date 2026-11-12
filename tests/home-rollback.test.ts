// UPGR-01..04: going back a version (specs/upgrade-continuity/owner-isolation-and-rollback-design.md §5). The installer keeps the program it
// replaced; `home rollback` puts back the stores the newer one upgraded and swaps the program back, or refuses and changes nothing.
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createDesktopUninstallService } from "@molis-ai/molis-work-app-desktop";
import { installMolisWorkHome, MolisWorkWebServiceManager, RuntimeIntegrationService, readRollbackHold, readRollbackPoint, rollbackHome, runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { BASELINE_V2, notesDescriptor, notesOf, present, seedStore, sha256, upgradeTestHome, useDescriptors, V1, versionOf } from "./fixtures/home-upgrade-home.js";

const BASELINE_V1 = { version: 1, schema: V1, upgrades: [] };

function fixtureSource(root: string, version: string, marker = version): string {
  const source = join(root, `source-${version}-${marker}`);
  for (const directory of ["dist/cli", "dist/mcp", "dist/web", "skills/goal-advance", "skills/molis-plugin-dev", "node_modules"]) mkdirSync(join(source, directory), { recursive: true });
  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "fixture-molis-work", version, type: "module" }));
  for (const entry of ["cli/main", "mcp/server", "web/server"]) writeFileSync(join(source, "dist", `${entry}.js`), `console.log(${JSON.stringify(`${entry}:${marker}`)});\n`);
  writeFileSync(join(source, "skills", "goal-advance", "SKILL.md"), "# Fixture Skill\n");
  writeFileSync(join(source, "skills", "molis-plugin-dev", "SKILL.md"), "# Fixture Plugin Dev Skill\n");
  return source;
}

const installation = (home: string) => JSON.parse(readFileSync(join(home, "config", "installation.json"), "utf8")) as { version: string; release_path: string; content_digest: string };
const launcher = (home: string) => readFileSync(join(home, "bin", "molis-work"), "utf8");

/** A Home on 1.0.0 with one store its program left at version 1, then 2.0.0 installed over it. */
async function homeAfterUpdate(t: TestContext) {
  const { area, home } = upgradeTestHome(t);
  const store = seedStore(home, "notes");
  const stop = useDescriptors(t, notesDescriptor("notes", { baseline: BASELINE_V1 }));
  await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixtureSource(area, "1.0.0") });
  runHomeUpgrade(home);
  const before = { bytes: sha256(store), notes: notesOf(store), installation: installation(home), launcher: launcher(home) };
  await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixtureSource(area, "2.0.0") });
  stop();
  useDescriptors(t, notesDescriptor("notes", { baseline: BASELINE_V2 }));
  return { area, home, store, before };
}

test("UPGR-01 an update keeps the program it replaced; with no upgrade since, going back leaves the data as it is", async t => {
  const { area, home, store, before } = await homeAfterUpdate(t);
  assert.ok(present(join(home, "releases", "previous", "rollback.json")));
  assert.ok(present(join(home, "releases", "molis-work-1.0.0")), "a different version's program stays where it is: a running host may still load from it");
  assert.deepEqual(readRollbackPoint(home), { available: true, version: "1.0.0", data: "unchanged", written_since: null });
  const result = await rollbackHome(home);
  assert.deepEqual(result, { version: "1.0.0", data: "unchanged", restored: [], saved_to: null });
  assert.equal(installation(home).version, "1.0.0");
  assert.equal(installation(home).content_digest, before.installation.content_digest);
  assert.equal(launcher(home), before.launcher, "the launchers run the kept program again");
  assert.equal(sha256(store), before.bytes);
  assert.equal(present(join(home, "releases", "previous")), false, "the point it went back to is used up");
  assert.deepEqual(readRollbackPoint(home), { available: false, reason: "no_previous" });
  assert.equal(readRollbackHold(home)?.held_version, "1.0.0");
  assert.equal(readRollbackHold(home)?.rolled_back_from.version, "2.0.0", "the desktop does not install the version it came back from on its own");
  const again = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixtureSource(area, "2.0.0") });
  assert.ok(again.removed_paths.includes(join(home, "config", "rollback-hold.json")), "putting the newer one back on purpose lifts the hold");
  assert.equal(readRollbackHold(home), undefined);
  assert.equal(readRollbackPoint(home).available, true, "and keeps 1.0.0 to go back to again");
});

test("UPGR-02 a store the newer version upgraded goes back to its bytes from before, and the next program scans it again", async t => {
  const { home, store, before } = await homeAfterUpdate(t);
  runHomeUpgrade(home);
  assert.equal(versionOf(store), 2);
  const point = readRollbackPoint(home);
  assert.equal(point.available && point.data, "restore");
  const result = await rollbackHome(home);
  assert.deepEqual(result.restored, ["notes/notes.db"]);
  assert.equal(sha256(store), before.bytes, "byte for byte what the kept program left");
  assert.deepEqual(notesOf(store), before.notes);
  assert.equal(present(join(home, "upgrade", "state.json")), false, "no stamp: the program that opens next checks every store");
  assert.equal(installation(home).version, "1.0.0");
});

test("UPGR-02 a same-version rebuild takes the old one's directory name: the old program moves into previous and back", async t => {
  const { area, home } = upgradeTestHome(t);
  useDescriptors(t, notesDescriptor("notes", { baseline: BASELINE_V1 }));
  await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixtureSource(area, "1.0.0", "first") });
  const first = installation(home), entry = join(home, "releases", "molis-work-1.0.0", "dist", "cli", "main.js");
  assert.match(readFileSync(entry, "utf8"), /first/u);
  await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixtureSource(area, "1.0.0", "second") });
  assert.match(readFileSync(entry, "utf8"), /second/u);
  assert.ok(present(join(home, "releases", "previous", "release", "dist", "cli", "main.js")));
  await rollbackHome(home);
  assert.match(readFileSync(entry, "utf8"), /first/u, "the kept program is back under its own name");
  assert.equal(installation(home).content_digest, first.content_digest);
  assert.deepEqual(readdirSync(join(home, "releases")).sort(), ["molis-work-1.0.0"], "nothing parked or staged is left behind");
});

test("UPGR-03 going back refuses and changes nothing when it would leave data the kept program cannot read", async t => {
  const { home, store } = await homeAfterUpdate(t);
  runHomeUpgrade(home);
  // A second round since: the record now starts from the newer program's stamp, not the one the kept program left.
  const ledger = JSON.parse(readFileSync(join(home, "upgrade", "ledger.json"), "utf8")) as { from: string | null };
  writeFileSync(join(home, "upgrade", "ledger.json"), JSON.stringify({ ...ledger, from: "f".repeat(64) }), { mode: 0o600 });
  const bytes = sha256(store), installed = readFileSync(join(home, "config", "installation.json"), "utf8");
  assert.deepEqual(readRollbackPoint(home), { available: false, reason: "snapshot_missing" });
  await assert.rejects(rollbackHome(home), (error: { code?: string; details?: { reason?: string } }) =>
    error.code === "installer.rollback.unavailable" && error.details?.reason === "snapshot_missing");
  assert.equal(sha256(store), bytes);
  assert.equal(readFileSync(join(home, "config", "installation.json"), "utf8"), installed);
  assert.ok(present(join(home, "releases", "previous")), "the point stays for whoever looks again");
});

test("UPGR-03 an upgrade still in progress, or nothing kept, is refused with its own reason", async t => {
  const { home } = await homeAfterUpdate(t);
  runHomeUpgrade(home);
  const file = join(home, "upgrade", "ledger.json"), ledger = JSON.parse(readFileSync(file, "utf8")) as { units: { state: string }[] };
  writeFileSync(file, JSON.stringify({ ...ledger, units: ledger.units.map(unit => ({ ...unit, state: "applying" })) }), { mode: 0o600 });
  assert.deepEqual(readRollbackPoint(home), { available: false, reason: "upgrade_unfinished" });
  const { area, home: fresh } = upgradeTestHome(t);
  await installMolisWorkHome({ homeDirectory: fresh, sourceDirectory: fixtureSource(area, "1.0.0") });
  assert.deepEqual(readRollbackPoint(fresh), { available: false, reason: "no_previous" }, "a first install has nothing to go back to");
});

test("UPGR-04 going back runs only offline: a running Host holds the Home and nothing moves", async t => {
  const { home, store } = await homeAfterUpdate(t);
  runHomeUpgrade(home);
  const owner = acquireStorageOwner(join(home, "agent-runtime"));
  t.after(() => owner.release());
  const bytes = sha256(store);
  await assert.rejects(rollbackHome(home), { code: "storage.owner.busy" });
  assert.equal(sha256(store), bytes);
  assert.equal(installation(home).version, "2.0.0");
});

test("UPGR-04 a kept point with a forged path out of the Home is no point at all", async t => {
  const { area, home } = await homeAfterUpdate(t);
  const record = join(home, "releases", "previous", "rollback.json"), value = JSON.parse(readFileSync(record, "utf8")) as Record<string, unknown>;
  mkdirSync(join(area, "elsewhere"));
  symlinkSync(join(area, "elsewhere"), join(home, "releases", "outside"));
  for (const release_path of ["../outside", join(area, "elsewhere"), join("releases", "outside")]) {
    writeFileSync(record, JSON.stringify({ ...value, release_path }));
    assert.deepEqual(readRollbackPoint(home), { available: false, reason: "no_previous" }, release_path);
  }
});

test("UPGR-04 uninstall takes the kept point and the hold with the program, and stops on a point it cannot read", async t => {
  const { area, home } = await homeAfterUpdate(t);
  const userHome = join(area, "user");
  mkdirSync(userHome);
  const service = () => createDesktopUninstallService({ homeDirectory: home,
    runtimeIntegrationService: new RuntimeIntegrationService({ homeDirectory: home, userHomeDirectory: userHome,
      runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null } }),
    webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: userHome, platform: "linux" }) });
  const hold = join(home, "config", "rollback-hold.json"), previous = join(home, "releases", "previous");
  const kept = await service().prepare();
  assert.equal(kept.status, "ready", JSON.stringify(kept.conflicts));
  assert.ok(kept.changes.some(change => change.target === previous), "the kept program goes with the program");
  await rollbackHome(home);
  const plan = await service().prepare();
  assert.equal(plan.status, "ready", JSON.stringify(plan.conflicts));
  assert.ok(plan.changes.some(change => change.target === hold), "the hold goes with the program");
  writeFileSync(hold, "{}");
  const refused = await service().prepare();
  assert.notEqual(refused.status, "ready", "a hold this build cannot read is no file of its own to delete");
});
