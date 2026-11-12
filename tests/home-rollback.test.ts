// UPGR-01..05, UPGR-08, UPGR-09: going back a version (specs/upgrade-continuity/owner-isolation-and-rollback-design.md §5). The installer keeps the program it
// replaced; `home rollback` puts back the stores the newer one upgraded and swaps the program back, or refuses and changes nothing.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderUpdateSettings } from "@molis-ai/molis-work-app-workbench";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { createDesktopUninstallService } from "@molis-ai/molis-work-app-desktop";
import { installMolisWorkHome, MolisWorkWebServiceManager, RuntimeIntegrationService, readRollbackHold, rollbackHrefFor, readRollbackPoint, rollbackHome, runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
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
  const newer = useDescriptors(t, notesDescriptor("notes", { baseline: BASELINE_V2 }));
  return { area, home, store, before, newer };
}

test("UPGR-01 an update keeps the program it replaced; with no upgrade since, going back leaves the data as it is", async t => {
  const { area, home, store, before } = await homeAfterUpdate(t);
  assert.ok(present(join(home, "releases", "previous", "rollback.json")));
  assert.ok(present(join(home, "releases", "molis-work-1.0.0")), "a different version's program stays where it is: a running host may still load from it");
  const record = readFileSync(join(home, "releases", "previous", "rollback.json"), "utf8");
  assert.equal((await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixtureSource(area, "2.0.0") })).status, "unchanged");
  assert.equal(readFileSync(join(home, "releases", "previous", "rollback.json"), "utf8"), record, "the same program again keeps the point as it was");
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

test("UPGR-03 a store the newer version upgraded goes back to its bytes from before, and the next program scans it again", async t => {
  const { home, store, before, newer } = await homeAfterUpdate(t);
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
  newer();
  useDescriptors(t, notesDescriptor("notes", { baseline: BASELINE_V1 }));
  const reopened = runHomeUpgrade(home);
  assert.ok(reopened.units.every(unit => unit.state !== "failed" && unit.state !== "too_new"), JSON.stringify(reopened.units));
  assert.equal(versionOf(store), 1, "the kept program reads every store it left");
  assert.ok(present(join(home, "upgrade", "state.json")), "and stamps the Home at its own versions");
});

test("UPGR-01 a same-version rebuild takes the old one's directory name: the old program moves into previous and back", async t => {
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

test("UPGR-02 going back refuses and changes nothing when it would leave data the kept program cannot read", async t => {
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

test("UPGR-02 an upgrade still in progress, or nothing kept, is refused with its own reason", async t => {
  const { home } = await homeAfterUpdate(t);
  runHomeUpgrade(home);
  const file = join(home, "upgrade", "ledger.json"), ledger = JSON.parse(readFileSync(file, "utf8")) as { units: { state: string }[] };
  writeFileSync(file, JSON.stringify({ ...ledger, units: ledger.units.map(unit => ({ ...unit, state: "applying" })) }), { mode: 0o600 });
  assert.deepEqual(readRollbackPoint(home), { available: false, reason: "upgrade_unfinished" });
  const { area, home: fresh } = upgradeTestHome(t);
  await installMolisWorkHome({ homeDirectory: fresh, sourceDirectory: fixtureSource(area, "1.0.0") });
  assert.deepEqual(readRollbackPoint(fresh), { available: false, reason: "no_previous" }, "a first install has nothing to go back to");
});

test("UPGR-04 a copy that cannot be saved first stops the whole thing before anything moves", { timeout: 60_000 }, async t => {
  const { area, home, store } = await homeAfterUpdate(t);
  const taken = join(area, "already-there");
  mkdirSync(taken);
  const bytes = sha256(store), installed = readFileSync(join(home, "config", "installation.json"), "utf8"), bin = launcher(home);
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url)),
    "home", "rollback", "--confirm", "--save-current", taken, "--home", home, "--json"], { env: { ...process.env, MOLIS_WORK_TEST: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.notEqual(code, 0, stderr);
  assert.equal(sha256(store), bytes);
  assert.equal(readFileSync(join(home, "config", "installation.json"), "utf8"), installed);
  assert.equal(launcher(home), bin);
  assert.ok(present(join(home, "releases", "previous", "rollback.json")), "the point is still there to go back to");
  assert.equal(readRollbackHold(home), undefined);
  assert.deepEqual(readdirSync(taken), [], "and nothing was written where the copy was to go");
});

test("UPGR-04 a store that cannot be put back part-way leaves the program as it was, and going back again finishes it", async t => {
  const { area, home } = upgradeTestHome(t);
  const files = ["alpha", "beta"].map(name => seedStore(home, name));
  const v1 = useDescriptors(t, ...["alpha", "beta"].map(name => notesDescriptor(name, { baseline: BASELINE_V1 })));
  await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixtureSource(area, "1.0.0") });
  runHomeUpgrade(home);
  const before = files.map(sha256);
  await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixtureSource(area, "2.0.0") });
  v1();
  useDescriptors(t, ...["alpha", "beta"].map(name => notesDescriptor(name)));
  runHomeUpgrade(home);
  assert.deepEqual(files.map(versionOf), [2, 2]);
  const locked = dirname(files[1]!);
  chmodSync(locked, 0o500);
  try {
    await assert.rejects(rollbackHome(home));
    assert.equal(installation(home).version, "2.0.0", "no program swap until every store is back");
    assert.ok(present(join(home, "releases", "previous", "rollback.json")));
    assert.equal(readRollbackHold(home), undefined);
    assert.equal(versionOf(files[1]!), 2, "the store that could not be put back is whole, at the newer version");
  } finally { chmodSync(locked, 0o700); }
  const point = readRollbackPoint(home);
  assert.equal(point.available && point.data, "restore", "the point still says what going back would do");
  const result = await rollbackHome(home);
  assert.deepEqual([...result.restored].sort(), ["alpha/alpha.db", "beta/beta.db"]);
  assert.deepEqual(files.map(sha256), before);
  assert.equal(installation(home).version, "1.0.0");
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

test("UPGR-02 a kept point with a forged path out of the Home is no point at all", async t => {
  const { area, home } = await homeAfterUpdate(t);
  const record = join(home, "releases", "previous", "rollback.json"), value = JSON.parse(readFileSync(record, "utf8")) as Record<string, unknown>;
  mkdirSync(join(area, "elsewhere"));
  symlinkSync(join(area, "elsewhere"), join(home, "releases", "outside"));
  for (const release_path of ["../outside", join(area, "elsewhere"), join("releases", "outside")]) {
    writeFileSync(record, JSON.stringify({ ...value, release_path }));
    assert.deepEqual(readRollbackPoint(home), { available: false, reason: "no_previous" }, release_path);
  }
});

test("UPGR-09 uninstall takes the kept point and the hold with the program, and stops on a point it cannot read", async t => {
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

function withWorkbenchText(t: TestContext, locale: "zh" | "en" = "zh") {
  const file = new URL(`../apps/workbench/resources/locales/${locale}.json`, import.meta.url);
  const pack = parseLocalePack(readFileSync(file, "utf8"), { file: file.pathname });
  assert.ok(pack.ok);
  t.after(installTextForTest({ locale, packs: [pack.value] }));
}

test("UPGR-08 a failed upgrade's card leads to 设置 › 更新 only while there is a version to go back to", async t => {
  const { home } = await homeAfterUpdate(t);
  assert.equal(rollbackHrefFor(home, "upgrade_failed"), "/settings/update");
  for (const reason of ["store_too_new", "upgrade_no_space", "snapshot_invalid", "unreadable"] as const) assert.equal(rollbackHrefFor(home, reason), null, reason);
  await rollbackHome(home);
  assert.equal(rollbackHrefFor(home, "upgrade_failed"), null, "after going back there is no version before that one");
});

test("UPGR-08 设置 › 更新 offers going back in the desktop app, the command in a browser, and says why when it cannot", t => {
  withWorkbenchText(t);
  const page = (update: Parameters<typeof renderUpdateSettings>[0]["update"], desktop: boolean) =>
    renderUpdateSettings({ diagnostics: { version: "2.0.0" }, update } as Parameters<typeof renderUpdateSettings>[0], desktop).replace(/<script>[\s\S]*<\/script>/u, "");
  const restore = { point: { available: true, version: "1.0.0", data: "restore", written_since: "2026-11-10T08:00:00.000Z" }, held: null } as const;
  const desktop = page(restore, true);
  assert.match(desktop, /data-rollback-open/u);
  assert.match(desktop, /data-rollback-dialog/u);
  assert.match(desktop, /type="checkbox" checked data-rollback-save/u, "saving a copy first is on by default (11-04)");
  assert.match(desktop, /2\.0\.0 → 1\.0\.0/u);
  assert.match(desktop, /之后写的内容会回到那时的样子/u, "putting stores back says what is lost");
  assert.doesNotMatch(page({ ...restore, point: { ...restore.point, data: "unchanged", written_since: null } }, true), /之后写的内容/u);
  const browser = page(restore, false);
  assert.doesNotMatch(browser, /data-rollback-open|data-rollback-dialog/u, "a browser cannot stop the local service");
  assert.match(browser, /molis-work home rollback --confirm/u);
  for (const [reason, words] of [["no_previous", /还没换过版本/u], ["snapshot_missing", /又升级过数据/u], ["upgrade_unfinished", /没做完的升级/u]] as const) {
    const refused = page({ point: { available: false, reason }, held: null }, true);
    assert.match(refused, words, reason);
    assert.doesNotMatch(refused, /data-rollback-open/u, reason);
  }
  const held = page({ point: { available: false, reason: "no_previous" }, held: { held_version: "1.0.0", rolled_back_from: "2.0.0" } }, true);
  assert.match(held, /已回到 1\.0\.0/u);
  assert.match(held, /data-rollback-lift/u);
  assert.doesNotMatch(held, /还没换过版本/u, "after going back the page says where it is, not that there is nowhere to go");
});

test("UPGR-08 the Host serves 设置 › 更新 from the Home's own files, and lifting the hold deletes only that file", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const page = await f.request("/settings/update", { headers: { accept: "text/html" } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /data-update-settings/u);
  assert.match(html, /还没换过版本/u, "a Home that never changed versions says so, with no button");
  const hold = join(f.home, "config", "rollback-hold.json");
  mkdirSync(join(f.home, "config"), { recursive: true });
  writeFileSync(hold, JSON.stringify({ schema_version: 1, held_version: "1.0.0", held_digest: "x", rolled_back_from: { version: "2.0.0", content_digest: "y" }, at: new Date().toISOString() }));
  assert.match(await (await f.request("/settings/update", { headers: { accept: "text/html" } })).text(), /已回到 1\.0\.0/u);
  const lifted = await f.request("/api/update/hold/lift", { method: "POST", body: {} });
  assert.equal(lifted.status, 200);
  assert.deepEqual(await lifted.json(), { lifted: true });
  assert.equal(present(hold), false);
});
