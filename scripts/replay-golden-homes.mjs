#!/usr/bin/env node
// Replay the golden Homes (specs/upgrade-continuity/golden-replay-design.md §4, UPG2-01, UPG2-03, UPG2-05, UPG2-06): each one restored into a
// temporary Home, opened by this build, checked, written to and restarted. Run it on the built workspace (`pnpm build`).
//
//   node scripts/replay-golden-homes.mjs [--latest N | --all] [--dir <directory>] [--json] [--debug]
//
// The default is the latest 3. Exit 1 if any golden fails. A failure says which golden, where, which step and which code, and never what the data
// was (UPG2-03); `--debug` adds the error's own message on stderr, for the person fixing it locally.
//
// "Upgrade to current" has no call of its own: the Host brings a Home up to date when it starts (U1 design §3, §4), and until U1 lands every
// library has to already be at this build's version, which opening it enforces. So the first step below is the upgrade, today and after U1.
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

const { createTemporaryHome, goldenFailure, GOLDEN_TEST_KEY, readManifest, restoreGolden } = await import("./golden/layout.mjs");
const { enterHome, goldenActions, loadGoldenWrites, openGoldenHost, refuseNetwork, refusedNetwork } = await import("./golden/session.mjs");
const local = await import("@molis-ai/molis-work-app-local-host");
const { countSqliteRows } = await import("@molis-ai/molis-work-storage");
const { readEveryParameterlessAction, unavailableInFixture } = await import(new URL("../tests/fixtures/parameterless-reads.ts", import.meta.url).href);
const { expectAnswer, installedPluginSession } = await import("./replay-plugins/signed-session.mjs");
const { thirdPartySample } = await import("./golden/populate.mjs");

/** A golden Home has neither a managed workspace nor a model a read could reach. The table of the shared read, and nothing wider. */
const UNAVAILABLE = unavailableInFixture;
const KNOWLEDGE_CATCH_UP_MILLISECONDS = 30_000;

function versionsNewestLast(names) {
  const parts = name => { const [main, dev] = name.split("-dev."); return [...main.split(".").map(Number), dev === undefined ? Infinity : Number(dev)]; };
  return [...names].sort((a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
}

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

/** Every recorded table of every library still has at least its recorded rows (§4 step 5). Only numbers leave this function. */
function assertRowsKept(manifest, home) {
  for (const entry of manifest.stores) {
    const db = new DatabaseSync(path.join(home, entry.path), { readOnly: true });
    let now;
    try { now = countSqliteRows(db); } finally { db.close(); }
    for (const [table, recorded] of Object.entries(entry.tables)) {
      if (now[table] === undefined) throw goldenFailure("golden.table_missing", `${entry.path}#${table}`);
      if (now[table] < recorded) throw goldenFailure("golden.rows_decreased", `${entry.path}#${table}`);
    }
  }
}

/** The offline snapshot runs the owners' checks over every registered library: version, every table against the baseline, triggers word for word (§4 step 3). */
async function assertStructure(homes) {
  for (const item of homes) {
    enterHome(item.at);
    const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "golden-structure-")));
    try { await local.createHomeSnapshot({ homeDirectory: item.at, destination: path.join(scratch, "snapshot") }); }
    finally { rmSync(scratch, { recursive: true, force: true }); }
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
 * A golden holds no search index (the snapshot leaves it out as rebuildable), and knowledge cards are reconciled against that index: the first
 * listing drops a card whose piece is not indexed yet, and the card comes back when the index has caught up. So the row check of §4 step 5 is
 * only meaningful once it has, and it stays exactly as strict: when the deadline passes the recorded number is simply not there and that check fails.
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
  if (process.platform !== "darwin") return "unsupported";
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

async function replayGolden(name) {
  const source = path.join(directory, name), restored = createTemporaryHome("golden-replay-");
  const steps = {};
  let step = "restore";
  try {
    const manifest = readManifest(source);
    if (manifest.test_key.value !== GOLDEN_TEST_KEY) throw goldenFailure("golden.test_key_changed", "manifest.json");
    enterHome(restored.home);
    restoreGolden(source, manifest, restored.home);
    const homes = homesOf(manifest, restored.home);
    step = "upgrade"; await openEveryProject(homes);
    step = "structure"; await assertStructure(homes);
    step = "read"; steps.reads = await readEverything(manifest, homes);
    step = "rows"; assertRowsKept(manifest, restored.home);
    step = "write"; steps.writes = await writeEverything(homes);
    step = "third-party"; steps.third_party = await replayThirdParty(manifest, homes);
    step = "restart-structure"; await assertStructure(homes);
    step = "restart-read"; await readEverything(manifest, homes);
    if (refusedNetwork().length) { step = "network"; throw goldenFailure("golden.network_refused", refusedNetwork()[0]); }
    return { golden: name, ok: true, steps };
  } catch (error) {
    if (debug) process.stderr.write(`${error?.stack ?? error}\n`);
    return { golden: name, ok: false, step, where: error?.where ?? "-", code: typeof error?.code === "string" ? error.code : "golden.unexpected_error" };
  } finally { restored.remove(); }
}

refuseNetwork();
const results = [];
for (const name of selectedGoldens()) results.push(await replayGolden(name));
if (json) writeFileSync(1, `${JSON.stringify({ results })}\n`);
else if (!results.length) writeFileSync(1, "no golden Homes to replay\n");
else for (const item of results) writeFileSync(1, item.ok ? `ok   ${item.golden} (${item.steps.reads} reads, ${item.steps.writes} writes, third-party: ${item.steps.third_party})\n` : `FAIL ${item.golden} ${item.step} ${item.where} ${item.code}\n`);
// The Host's background work has no reason to outlive a finished replay.
process.exit(results.every(item => item.ok) ? 0 : 1);
