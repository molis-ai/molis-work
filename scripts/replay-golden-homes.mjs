#!/usr/bin/env node
// Replay the golden Homes (specs/upgrade-continuity/golden-replay-design.md §4, UPG2-01, UPG2-03, UPG2-05, UPG2-06): each one restored into a
// temporary Home, opened by this build, checked, written to and restarted. Run it on the built workspace (`pnpm build`).
//
//   node scripts/replay-golden-homes.mjs [--latest N | --all] [--dir <directory>] [--json] [--debug]
//
// The default is the latest 3. Exit 1 if any golden fails. A failure says which golden, where, which step and which code, and never what the data
// was (UPG2-03); `--debug` adds the error's own message on stderr, for the person fixing it locally. A step this machine cannot run is no failure and
// no pass either: the result lists it under `not_run` and the line says so (the installed plugin, outside macOS).
//
// "Upgrade to current" has no call of its own: the Host brings a Home up to date when it starts (U1 design §3, §4), and until U1 lands every
// library has to already be at this build's version, which opening it enforces. So the first step below is the upgrade, today and after U1.
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const debug = args.includes("--debug"), json = args.includes("--json");
const directory = path.resolve(option("--dir") ?? path.join(root, "tests/fixtures/golden-homes"));

const { goldenFailure } = await import("./golden/failure.mjs");
const { createTemporaryHome, GOLDEN_TEST_KEY, readManifest, restoreGolden } = await import("./golden/layout.mjs");
const { enterHome, goldenActions, loadGoldenWrites, openGoldenHost, refuseNetwork, refusedNetwork, scriptModel } = await import("./golden/session.mjs");
const local = await import("@molis-ai/molis-work-app-local-host");
const { countSqliteRows, openBaselineHomeSqlite } = await import("@molis-ai/molis-work-storage");
const { SYNC_STORE_BASELINE } = await import("@molis-ai/molis-work-module-sync-replication");
const { readEveryParameterlessAction, unavailableInFixture } = await import(new URL("../tests/fixtures/parameterless-reads.ts", import.meta.url).href);
const { expectAnswer, installedPluginSession } = await import("./replay-plugins/signed-session.mjs");
const { thirdPartySample } = await import("./golden/populate.mjs");
const { replayHomeLibrarySample } = await import("./golden/home-library-sample.mjs");
const { assertVersionedFilesRead } = await import("./golden/versioned-files.mjs");
const { assertRecordedVersions } = await import("./golden/formats.mjs");
const storage = await import("@molis-ai/molis-work-storage");
const { relativePathPattern, versionsNewestLast } = await import("./golden/versions.mjs");

/** A golden Home has neither a managed workspace nor a model a read could reach. The table of the shared read, and nothing wider. */
const UNAVAILABLE = unavailableInFixture;
const KNOWLEDGE_CATCH_UP_MILLISECONDS = 30_000;
/**
 * The plugin sandbox exists only on macOS, so elsewhere the installed sample fails at activation and is not offered, which every other step takes in
 * its stride. This is not a pass: `ok` says only that what ran passed, and a run that left this out says so in its result, for the job that adds it.
 */
const THIRD_PARTY_NOT_RUN = "not-run";

function selectedGoldens() {
  let names;
  try { names = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const ordered = versionsNewestLast(names);
  return args.includes("--all") ? ordered : ordered.slice(-Number(option("--latest") ?? 3));
}

/** One whole Home of the golden, its projects in the Home's own paths. */
const homesOf = (manifest, home) => manifest.homes.map(item => {
  const at = path.join(home, item.path);
  return { path: item.path, at, account: item.space.kind === "personal", projects: Object.values(item.projects).map(project => ({ project_id: project.project_id, database_path: path.join(at, project.database) })) };
});

/**
 * The tables an owner's upgrade steps say they delete or merge, from the version the golden recorded on: they may lose rows or go (§4 step 5,
 * the declaration beside the step). Read from the descriptors the upgrade itself runs, so a step that does not declare it fails here.
 */
function declaredReductions(entry) {
  const relative = entry.path.replace(/^spaces\/[^/]+\//u, "");
  const descriptor = local.homeUpgradeDescriptors().find(item => "baseline" in item && relativePathPattern(item.pattern).test(relative));
  return new Set((descriptor?.baseline.upgrades ?? []).filter(step => step.from >= entry.schema_version).flatMap(step => step.reduces_rows ?? []));
}

/**
 * Every recorded table of every library still has at least its recorded rows (§4 step 5), less what the Files retirement's adoption declared it
 * drops (`adoptAsMaintenance`), library by library and table by table. Only numbers leave this function.
 */
function assertRowsKept(manifest, home, retired = new Map()) {
  for (const entry of manifest.stores) {
    const db = new DatabaseSync(path.join(home, entry.path), { readOnly: true });
    let now;
    try { now = countSqliteRows(db); } finally { db.close(); }
    const reduced = declaredReductions(entry), dropped = retired.get(entry.path) ?? {};
    for (const [table, recorded] of Object.entries(entry.tables)) {
      if (reduced.has(table)) continue;
      if (now[table] === undefined) throw goldenFailure("golden.table_missing", `${entry.path}#${table}`);
      if (now[table] < recorded - (dropped[table] ?? 0)) throw goldenFailure("golden.rows_decreased", `${entry.path}#${table}`);
    }
  }
}

/** Start a Host on each Home and close it, opening no project: the Home's own upgrade runs as it starts (U1 design §4). */
async function startEveryHost(homes) {
  for (const item of homes) await (await openGoldenHost(item.at, { web: !item.account })).close();
}

const FILES_PLUGIN_ID = "io.molis.work.files", FILES_CATALOG_ID = "files";

/**
 * The Files retirement (batch 06; the user's decisions of 2026-11-12): a project library in the layout before it is refused when
 * a Host opens it, until the adoption program runs in a maintenance window the person authorizes (sync settings' step 3,
 * specs/batch-06-shared-tools/current-version-adoption.md). The replay stands in for that window: after each Home's own upgrade (`startEveryHost`,
 * the step `upgrade`), the product's adoption of each project library the Home lists that still has something to adopt, and its
 * Home step, before any Host opens a project. A library with nothing to adopt is left alone, so a current golden goes through no adoption and
 * the sync library is still opened by the structure check alone (UPG2-06). What only Files held may go, counted in
 * the restored golden before anything ran and nothing wider: the event cursors Files subscribed with, Files' membership in the catalog, and the
 * default bindings whose source was Files, which the materials source takes over only once the person agrees again.
 */
function filesOnlyRows(homes, home) {
  const retired = new Map();
  const count = (file, table, sql, ...values) => {
    const db = new DatabaseSync(path.join(home, file), { readOnly: true });
    let n;
    try { n = Number(db.prepare(sql).get(...values).n); } finally { db.close(); }
    if (n) retired.set(file, { ...retired.get(file), [table]: (retired.get(file)?.[table] ?? 0) + n });
  };
  const libraries = homes.map(item => {
    const at = realpathSync(item.at), files = local.projectDatabases(at, storage.readStorageSpace(at) ?? undefined).map(relative => path.relative(home, path.join(item.at, relative)));
    for (const file of files) {
      count(file, "plugin_port_bindings", "SELECT COUNT(*) AS n FROM plugin_port_bindings WHERE source_plugin_id = ? AND origin = 'default'", FILES_PLUGIN_ID);
      count(file, "plugin_event_cursors", "SELECT COUNT(*) AS n FROM plugin_event_cursors WHERE subscriber_plugin_id = ?", FILES_PLUGIN_ID);
    }
    const catalog = path.relative(home, path.join(item.at, "projects", "catalog.db"));
    if (existsSync(path.join(home, catalog))) for (const table of ["project_plugins", "project_portable_plugins"]) count(catalog, table, `SELECT COUNT(*) AS n FROM ${table} WHERE plugin_id = ?`, FILES_CATALOG_ID);
    return { item, files };
  });
  return { retired, libraries };
}

async function adoptAsMaintenance({ retired, libraries }, home) {
  for (const { item, files } of libraries) {
    const where = item.path || "root";
    const waiting = files.filter(file => { const found = local.inspectProjectAdoption(path.join(home, file)); return found.layout !== "current" || local.adoptionPending(found); });
    if (!waiting.length) continue;
    const backups = mkdtempSync(path.join(tmpdir(), "golden-adoption-")), owner = storage.acquireStorageOwner(path.join(item.at, "agent-runtime"));
    try {
      for (const file of waiting) {
        const projectId = path.basename(path.dirname(file));
        if (local.adoptProjectDatabase({ home: item.at, owner, projectId, backupDirectory: backups }).state === "refused") throw goldenFailure("golden.adoption_refused", `${where}/${projectId}`);
      }
      const consents = local.retireFilesConsents({ home: item.at, owner, at: new Date().toISOString() });
      if (consents.waiting.length) throw goldenFailure("golden.adoption_waiting", `${where}/${consents.waiting[0].project_id}`);
    } finally { owner.release(); rmSync(backups, { recursive: true, force: true }); }
  }
  return retired;
}

/** The offline snapshot runs the owners' checks over every registered library: version, every table against the baseline, triggers word for word (§4 step 3). */
async function assertStructure(homes) {
  for (const item of homes) {
    enterHome(item.at);
    const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "golden-structure-")));
    try { await local.createHomeSnapshot({ homeDirectory: item.at, destination: path.join(scratch, "snapshot") }); }
    finally { rmSync(scratch, { recursive: true, force: true }); }
    // The snapshot leaves the sync library out and only a signed-in sync service opens it, so here its owner's baseline checks it.
    if (existsSync(path.join(item.at, "sync/sync.db"))) openBaselineHomeSqlite(item.at, "sync", SYNC_STORE_BASELINE).close();
  }
}

/** Open a Host on each Home, ask each project for its directory, close. This is where a library at another version is refused or upgraded. */
async function openEveryProject(homes) {
  for (const item of homes) {
    const session = await openGoldenHost(item.at, { web: !item.account });
    try {
      for (const project of item.projects) await goldenActions(session, project, "replay").call("goals.list");
    } finally { await session.close(); }
  }
}

function readsFailed(where, broken) {
  const [first] = broken;
  if (debug) for (const item of broken) process.stderr.write(`${where} ${item.action} ${item.code} ${item.message}\n`);
  throw goldenFailure(first.code, `${where}/${first.action}`);
}

/**
 * This waits on a known defect, BL-knowledge-restore-partial-catalog; delete it when that is fixed. A golden holds no search index (the snapshot
 * leaves it out as rebuildable), and knowledge cards are reconciled against that index: the first listing drops a card whose piece is not indexed
 * yet, and the card comes back when the index has caught up. A row count after this wait proves only that the number came back: what an upgrade
 * lost is caught by the count taken before any read ("rows-after-upgrade"), and a rebuilt card's model-written content is not seen by any count.
 */
async function letKnowledgeCardsCatchUp(manifest, session, item) {
  const file = path.join(item.path, "knowledge/knowledge.db");
  const recorded = manifest.stores.find(entry => entry.path === file)?.tables.knowledge_cards ?? 0;
  const count = () => {
    const db = new DatabaseSync(path.join(item.at, "knowledge/knowledge.db"), { readOnly: true });
    try { return countSqliteRows(db).knowledge_cards ?? 0; } finally { db.close(); }
  };
  for (const deadline = Date.now() + KNOWLEDGE_CATCH_UP_MILLISECONDS; count() < recorded && Date.now() < deadline;) {
    for (const project of item.projects) await goldenActions(session, project, "replay").call("knowledge.list");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/** The root Home's versioned files through their owners (§4 step 3). */
async function readVersionedFiles(manifest, source, [root]) {
  const session = await openGoldenHost(root.at);
  try { return await assertVersionedFilesRead(manifest, source, goldenActions(session, root.projects[0], "replay")); } finally { await session.close(); }
}

/** Every parameterless read, in every project of every Home; Home-scoped reads once per Home (§4 step 4). */
async function readEverything(manifest, homes) {
  let count = 0;
  for (const item of homes) {
    const session = await openGoldenHost(item.at, { web: !item.account });
    try {
      let homeScope = true;
      for (const project of item.projects) {
        const { broken, read } = await readEveryParameterlessAction(session.host, project.database_path, project.project_id, { homeScope, unavailable: UNAVAILABLE,
          // An account Home's web surface wants a signed-in session; that this read is refused without the settings door is still asserted.
          projectReachThroughSettings: async () => { if (!item.account) await session.http(`/projects/${encodeURIComponent(project.project_id)}/api/settings/plugin-project-reach/list`, { body: {} }); } });
        if (broken.length) readsFailed(`${item.path || "root"}/${project.project_id}`, broken);
        count += read.size; homeScope = false;
      }
      await letKnowledgeCardsCatchUp(manifest, session, item);
    } finally { await session.close(); }
  }
  return count;
}

/** Each owner's minimal write on each Home, read back through the same owner (§4 step 6). */
async function writeEverything(homes) {
  const writes = await loadGoldenWrites();
  let count = 0;
  for (const item of homes) {
    const session = await openGoldenHost(item.at, { web: !item.account });
    try {
      const actions = goldenActions(session, item.projects[0], "replay");
      for (const write of writes) {
        if (item.account && write.webSurface) continue;
        try { await write.run(actions); count++; } catch (error) { error.where = `${item.path || "root"}/write/${write.owner}`; throw error; }
      }
    } finally { await session.close(); }
  }
  return count;
}

/** The installed sample still loads, still answers, takes a write, upgrades in place and keeps its value (§4 step 7). Only macOS can run it at all. */
async function replayThirdParty(manifest, homes) {
  if (!manifest.third_party) return "absent";
  if (process.platform !== "darwin") return THIRD_PARTY_NOT_RUN;
  const sample = thirdPartySample();
  if (sample.id !== manifest.third_party) throw goldenFailure("golden.third_party_sample_changed", manifest.third_party);
  const item = homes[0], project = item.projects[0];
  const session = await openGoldenHost(item.at);
  try {
    const plugin = installedPluginSession(() => session.host, { home: item.at, ref: local.molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }), projectId: project.project_id, pluginId: sample.pluginId, publisher: sample.publisher });
    const { install_id } = await plugin.installed(sample.version);
    expectAnswer(sample.action, await plugin.invoke(sample.action));
    expectAnswer(sample.write, await plugin.invoke(sample.write));
    const kept = await plugin.invoke(sample.action);
    expectAnswer({ ...sample.action, expect_texts: [...sample.action.expect_texts, ...sample.action.expect_texts] }, kept);
    const upgraded = await session.cli(sample.upgradeFile, project.project_id, "--confirm");
    if (upgraded.code !== 0) throw goldenFailure("golden.third_party_upgrade_failed", sample.id);
    await plugin.installed(sample.upgradeVersion, install_id);
    if (!isDeepStrictEqual(await plugin.invoke(sample.action), kept)) throw goldenFailure("golden.third_party_value_changed", sample.id);
    return "replayed";
  } finally { await session.close(); }
}

/** The signed sample that holds a library of its own. Only the root Home has it, and only macOS can run it at all. */
async function replayHomeLibrary(manifest, [item]) {
  if (!manifest.home_library) return "absent";
  if (process.platform !== "darwin") return THIRD_PARTY_NOT_RUN;
  const session = await openGoldenHost(item.at);
  try {
    // The install entry takes a project this Host has open, though the package is the Home's.
    await goldenActions(session, item.projects[0], "replay").call("goals.list");
    return await replayHomeLibrarySample(session, item.projects[0], manifest.home_library);
  } finally { await session.close(); }
}

async function replayGolden(name) {
  const source = path.join(directory, name), restored = createTemporaryHome("golden-replay-");
  // UPG2-05: the restart is a step of its own. What ran is kept here, so a result cannot say `ok` for a replay whose second structure check
  // and second read never happened; the failure path below still returns the step, position and code only (UPG2-03).
  const steps = { restarts: [] };
  let step = "restore";
  try {
    const manifest = readManifest(source);
    if (manifest.test_key.value !== GOLDEN_TEST_KEY) throw goldenFailure("golden.test_key_changed", "manifest.json");
    enterHome(restored.home);
    restoreGolden(source, manifest, restored.home);
    // The gates take a golden's versions from its manifest; before anything upgrades them, they are read from what was restored.
    step = "recorded-versions"; assertRecordedVersions(storage, manifest, restored.home);
    const homes = homesOf(manifest, restored.home), filesOnly = filesOnlyRows(homes, restored.home);
    step = "upgrade"; await startEveryHost(homes);
    step = "adoption"; const retired = await adoptAsMaintenance(filesOnly, restored.home);
    step = "upgrade"; await openEveryProject(homes);
    step = "rows-after-upgrade"; assertRowsKept(manifest, restored.home, retired);
    step = "structure"; await assertStructure(homes);
    step = "versioned-files"; steps.versioned_files = await readVersionedFiles(manifest, source, homes);
    step = "read"; steps.reads = await readEverything(manifest, homes);
    step = "rows"; assertRowsKept(manifest, restored.home, retired);
    step = "write"; steps.writes = await writeEverything(homes);
    step = "third-party"; steps.third_party = await replayThirdParty(manifest, homes);
    step = "home-library"; steps.home_library = await replayHomeLibrary(manifest, homes);
    step = "restart-structure"; await assertStructure(homes); steps.restarts.push(step);
    step = "restart-read"; steps.restart_reads = await readEverything(manifest, homes); steps.restarts.push(step);
    if (refusedNetwork().length) { step = "network"; throw goldenFailure("golden.network_refused", refusedNetwork()[0]); }
    return { golden: name, ok: true, steps, not_run: [["third-party", steps.third_party], ["home-library", steps.home_library]].filter(([, result]) => result === THIRD_PARTY_NOT_RUN).map(([what]) => what) };
  } catch (error) {
    if (debug) process.stderr.write(`${error?.stack ?? error}\n`);
    return { golden: name, ok: false, step, where: error?.where ?? "-", code: typeof error?.code === "string" ? error.code : "golden.unexpected_error" };
  } finally { restored.remove(); }
}

refuseNetwork();
scriptModel();
const results = [];
const said = result => result === THIRD_PARTY_NOT_RUN ? `not run on ${process.platform}, not a pass` : result;
for (const name of selectedGoldens()) results.push(await replayGolden(name));
if (json) writeFileSync(1, `${JSON.stringify({ results })}\n`);
else if (!results.length) writeFileSync(1, "no golden Homes to replay\n");
else for (const item of results) writeFileSync(1, item.ok ? `ok   ${item.golden} (${item.steps.reads} reads, ${item.steps.writes} writes, third-party: ${said(item.steps.third_party)}, home library: ${said(item.steps.home_library)})\n` : `FAIL ${item.golden} ${item.step} ${item.where} ${item.code}\n`);
// The Host's background work has no reason to outlive a finished replay.
process.exit(results.every(item => item.ok) ? 0 : 1);
