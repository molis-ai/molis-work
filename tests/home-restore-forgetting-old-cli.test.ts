import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { createHomeSnapshot, homeStores, MolisWorkLocalHost, recoverHomeRestore, restoreHomeSnapshot } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { restoreFixture } from "./fixtures/home-restore.js";
import { homeBusinessTree, homeStorageTree } from "./fixtures/home-storage-files.js";

// Supply a separately built pre-change checkout; a missing historical binary is unverified, never a current-build substitute.
const oldRoot = process.env.MOLIS_MEMORY_OLD_ROOT;
const oldCli = oldRoot ? join(oldRoot, "dist/cli/main.js") : "";
const oldOptions = { skip: oldRoot ? false : "MOLIS_MEMORY_OLD_ROOT must identify the independently built old application", timeout: 60_000 };
function preserved(home: string) {
  return Object.fromEntries(Object.entries(homeBusinessTree(home)).map(([path, value]) => [path, {
    ...value, ino: fs.lstatSync(join(home, path)).ino,
  }]));
}
const exactTree = (directory: string) => Object.fromEntries(Object.entries(homeStorageTree(directory)).map(([path, value]) =>
  [path, { ...value, ino: fs.lstatSync(join(directory, path)).ino }]));
const originals = (directory: string) => fs.readdirSync(directory).filter(name => name.startsWith(".molis-home-restore-")).sort();

/** Observe the ledger version only on a private complete committed DB/WAL copy, never by opening the source. */
function assertLedgerTwo(home: string, directory: string) {
  const privateRoot = fs.mkdtempSync(join(directory, "ledger-observation-")), copy = join(privateRoot, "memory.db");
  for (const suffix of ["", "-wal", "-journal"]) {
    const source = join(home, "memory", "memory.db") + suffix;
    if (fs.existsSync(source)) fs.copyFileSync(source, copy + suffix);
  }
  const database = new DatabaseSync(copy, { readOnly: true });
  try { assert.equal(database.prepare("PRAGMA user_version").get()!.user_version, 2); }
  finally { database.close(); }
}

/** The public install/start path, not a manually inserted registry row or a manufactured WAL library. */
async function installPrivateRegistry(home: string) {
  const id = "io.molis.work.example.crossversion", read = "crossversion:read", write = "crossversion:write";
  let database: PluginDatabase | undefined;
  const definition: PluginDefinition = { manifest: { schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name: "Cross-version fixture", kind: "app",
    publisher: { publisher_id: "example", signature: "crossversion-publisher" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", read, write].map(permission => ({ permission, required: true, reason: "Persist this plugin's private notes" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    databases: { home: { store_name: "crossversion-notes", version: 1, read_permission: read, write_permission: write,
      schema: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" } } },
    async start(context) {
      database = context.services?.database;
      return { kind: "app", views: [] };
    } };
  // Admit this exact test-code object; the public install still uses unsigned trust and the actual installed-library owner.
  // The Host places this fixture in its Home Runtime; this does not admit real external unsigned Home plugins.
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { installed: new Set([definition]) } });
  try {
    const platform = await host.homePlugins!.ready();
    const installed = platform.runtime.install({ definition, deployment: "local", trust: { level: "unsigned" }, grants: ["storage:private", read, write] });
    await platform.runtime.start(installed.install.install_id);
    assert.ok(database);
    await database.transaction(async () => {}, tx => tx.run("INSERT INTO notes (text) VALUES (?)", ["Retained installed private note"]));
    assert.deepEqual(database.all("SELECT text FROM notes").map(row => ({ ...row })), [{ text: "Retained installed private note" }]);
    assert.equal(homeStores(home).get("crossversion-notes")?.owner, id);
  } finally { await host.close(); }
  const registry = new DatabaseSync(join(home, "plugin-libraries", "plugin-libraries.db"), { readOnly: true });
  try {
    assert.deepEqual(registry.prepare("SELECT plugin_id, store_name, version FROM plugin_home_libraries WHERE plugin_id=?").all(id).map(row => ({ ...row })),
      [{ plugin_id: id, store_name: "crossversion-notes", version: 1 }]);
    assert.equal(registry.prepare("PRAGMA journal_mode").get()!.journal_mode, "delete", "the production registry owner retains its actual DELETE mode");
  } finally { registry.close(); }
}
async function child(t: TestContext, args: string[], cwd?: string) {
  const process = spawn(globalThis.process.execPath, args, { env: { ...globalThis.process.env }, ...(cwd ? { cwd } : {}), stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  process.stdout.on("data", data => { output += data; }); process.stderr.on("data", data => { output += data; });
  const end = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    process.once("error", reject); process.once("close", (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => { if (process.exitCode === null && process.signalCode === null) process.kill("SIGKILL"); await end; });
  return { ...await end, output };
}

for (const [phase, fault] of [["prepared", "prepared-kill"], ["publishing", "partial-kill"], ["committed", "committed-kill"]] as const)
test(`MEM-40: old offline recover refuses the new production ${phase} journal before changing files`, oldOptions, async t => {
  const f = await restoreFixture(t);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  fs.writeFileSync(join(f.home, "plugin-files", "original.bin"), "target before restore");
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  try { ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", { ...ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal"), enabled: false }); }
  finally { ledger.close(); }
  const stopped = await child(t, [new URL("./fixtures/home-restore-fault.mjs", import.meta.url).pathname, f.home, f.snapshot, fault]);
  assert.equal(stopped.signal, "SIGKILL", stopped.output);
  const journalFile = join(f.root, ".molis-home-restore.json"), journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
  assert.equal(journal.phase, phase);
  assert.equal(journal.schema_version, 2, "the production indexed Home journal rejects old raw recovery");
  assert.equal(journal.files.some((one: { path: string }) => one.path === "memory-forgetting-v2.json"), true,
    "the new publisher itself records the registered file in every phase");
  const homeBefore = preserved(f.home), originalsBefore = exactTree(journal.originals_directory), archiveBefore = exactTree(f.snapshot);
  const rejected = await child(t, [oldCli, "home", "restore", "--home", f.home, "--recover", "--json"]);
  assert.equal(rejected.code, 1, rejected.output);
  assert.match(rejected.output, /host\.home_restore\.invalid/u);
  assert.deepEqual(preserved(f.home), homeBefore);
  assert.deepEqual(exactTree(journal.originals_directory), originalsBefore);
  assert.deepEqual(exactTree(f.snapshot), archiveBefore);
  assert.equal((await recoverHomeRestore({ homeDirectory: f.home, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status,
    phase === "committed" ? "finished" : "rolled_back");
});

test("MEM-40: old Host, Web, MCP and delayed binding refuse a genuinely initialized new Home without changing business files", oldOptions, async t => {
  const f = await restoreFixture(t);
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  try {
    const prefs = ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal");
    assert.ok(prefs);
    assert.deepEqual(prefs.class_restrictions, [], "the new production initializer, not a fabricated ninth field, wrote these preferences");
    assert.deepEqual(ledger.forgetting.read().decisions, []);
  } finally { ledger.close(); }
  const before = preserved(f.home), beforeOriginals = originals(f.directory);
  assertLedgerTwo(f.home, f.directory);
  const paths = Object.keys(homeBusinessTree(f.home)).sort();
  const probe = `
    import assert from "node:assert/strict";
    import * as host from "@molis-ai/molis-work-app-local-host";
    import * as desktop from "@molis-ai/molis-work-app-desktop";
    const [home, entry] = process.argv.slice(1);
    let unbound;
    try {
      const operations = {
        Host: () => new host.MolisWorkLocalHost({ homeDirectory: home, completeText: null }),
        Web: () => desktop.createDesktopWebHost({ ptyClientFilePath: () => "unused.js" })({ homeDirectory: home }),
        MCP: () => new desktop.MolisWorkServer("runtime", null, { homeDirectory: home,
          runtimeContext: { runtime_id: "codex", stable_work_context_id: "test", host_declares_stable: true } }),
        "delayed-system": () => host.ensureSystemAgentService(unbound, home),
        "delayed-web": () => unbound.ensureWebCatalog(home, desktop.openMolisWorkProjectCatalog),
        "delayed-personal": () => {
          const withCatalog = unbound.configurePersonalPlanning(home, desktop.withMolisWorkProjectCatalog);
          return withCatalog({ homeDirectory: home }, () => undefined);
        },
      };
      if (entry.startsWith("delayed-")) unbound = new host.MolisWorkLocalHost({ completeText: null });
      // Personal planning injects a callback first; its first actual Catalog access is the initialization boundary.
      await assert.rejects(async () => { await operations[entry](); }, { code: "memory.forgetting_invalid" }, entry);
      console.log(JSON.stringify({ entry, outcome: "refused", code: "memory.forgetting_invalid" }));
    } finally { await unbound?.close(); }
  `;
  for (const entry of ["Host", "Web", "MCP", "delayed-system", "delayed-web", "delayed-personal"]) {
    const result = await child(t, ["--input-type=module", "--eval", probe, f.home, entry], oldRoot);
    assert.equal(result.code, 0, `${entry}: ${result.output}`);
    assert.match(result.output, /"outcome":"refused"/u);
    assert.match(result.output, /"code":"memory\.forgetting_invalid"/u);
    assert.deepEqual(preserved(f.home), before, entry);
    assert.deepEqual(Object.keys(homeBusinessTree(f.home)).sort(), paths, entry);
    assertLedgerTwo(f.home, f.directory);
    assert.equal(fs.existsSync(join(f.root, ".molis-home-restore.json")), false);
    assert.deepEqual(originals(f.directory), beforeOriginals);
  }
});

for (const independent of [false, true])
test(`MEM-40: old ${independent ? "independent restore without prior snapshot" : "snapshot then restore"} refuses the current layout with an installed private registry`, oldOptions, async t => {
  const f = await restoreFixture(t);
  await installPrivateRegistry(f.home);
  // Make the old archive with its own initializer and CLI at this canonical target path; never rewrite its manifest or preferences.
  const heldNewHome = join(f.directory, "new-home"), retainedOldHome = join(f.directory, "old-home");
  fs.renameSync(f.home, heldNewHome);
  try {
    const initialized = await child(t, ["--input-type=module", "--eval", `
      import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
      const [home] = process.argv.slice(1);
      await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
    `, f.home], oldRoot);
    assert.equal(initialized.code, 0, initialized.output);
    const captured = await child(t, [oldCli, "home", "snapshot", "--home", f.home, "--to", f.snapshot, "--json"]);
    assert.equal(captured.code, 0, captured.output);
  } finally {
    if (fs.existsSync(f.home)) fs.renameSync(f.home, retainedOldHome);
    fs.renameSync(heldNewHome, f.home);
  }
  const before = preserved(f.home), archiveBefore = exactTree(f.snapshot), beforeOriginals = originals(f.directory);
  const unchanged = () => {
    assert.deepEqual(preserved(f.home), before);
    assert.deepEqual(exactTree(f.snapshot), archiveBefore);
    assertLedgerTwo(f.home, f.directory);
    assert.equal(fs.existsSync(join(f.root, ".molis-home-restore.json")), false);
    assert.deepEqual(originals(f.directory), beforeOriginals, "a refusal must never create an originals area");
  };
  unchanged();
  if (!independent) {
    const rejectedSnapshot = join(f.directory, "old-snapshot");
    const captured = await child(t, [oldCli, "home", "snapshot", "--home", f.home, "--to", rejectedSnapshot, "--json"]);
    assert.equal(captured.code, 1, captured.output);
    assert.match(captured.output, /host\.home_snapshot\.unknown_data/u);
    assert.equal(fs.existsSync(rejectedSnapshot), false);
    unchanged();
  }
  const restored = await child(t, [oldCli, "home", "restore", "--home", f.home, "--from", f.snapshot, "--json"]);
  assert.equal(restored.code, 1, restored.output);
  assert.match(restored.output, /独立遗忘决定缺失、损坏或不是受支持的完整格式/u);
  unchanged();
  const recovered = await child(t, [oldCli, "home", "restore", "--home", f.home, "--recover", "--json"]);
  assert.equal(recovered.code, 0, recovered.output);
  assert.match(recovered.output, /"status":\s*"no_recovery"/u);
  unchanged();
});

test("MEM-40: the current initializer never adopts a legacy-name-only Home", async t => {
  const f = await restoreFixture(t), current = join(f.home, "memory-forgetting-v2.json"), legacy = join(f.home, "memory-forgetting.json");
  fs.renameSync(current, legacy); // A new closed synthetic fixture only; no retained old Home is converted.
  const before = preserved(f.home), beforeOriginals = originals(f.directory);
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null }), { code: "memory.forgetting_invalid" });
  assert.equal(fs.existsSync(current), false);
  assert.deepEqual(preserved(f.home), before); assertLedgerTwo(f.home, f.directory);
  assert.equal(fs.existsSync(join(f.root, ".molis-home-restore.json")), false);
  assert.deepEqual(originals(f.directory), beforeOriginals);
});

test("MEM-40: the existing snapshot and restore inventory refuses mixed current and legacy names without changing either", async t => {
  const f = await restoreFixture(t);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  fs.copyFileSync(join(f.home, "memory-forgetting-v2.json"), join(f.home, "memory-forgetting.json"));
  const before = preserved(f.home), archiveBefore = exactTree(f.snapshot), beforeOriginals = originals(f.directory), rejected = join(f.directory, "mixed-snapshot");
  const unchanged = () => {
    assert.deepEqual(preserved(f.home), before); assert.deepEqual(exactTree(f.snapshot), archiveBefore);
    assertLedgerTwo(f.home, f.directory);
    assert.equal(fs.existsSync(join(f.root, ".molis-home-restore.json")), false);
    assert.deepEqual(originals(f.directory), beforeOriginals);
  };
  await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: rejected }), { code: "host.home_snapshot.unknown_data" });
  assert.equal(fs.existsSync(rejected), false); unchanged();
  await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }),
    { code: "host.home_snapshot.unknown_data" });
  unchanged();
});
