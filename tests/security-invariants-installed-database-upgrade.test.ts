import assert from "node:assert/strict";
import { ChildProcess } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { PLUGIN_INSTALL_PERMISSIONS, pluginInstallActions, readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
import { SANDBOX_VALIDATE_UPGRADE, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { newPublisher, PACKAGE_PLUGIN_ID, signedPackage } from "./fixtures/sandbox-package.js";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";

const schema1 = "CREATE TABLE upgrade_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);";
const schema2 = "CREATE TABLE upgrade_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL, format TEXT NOT NULL DEFAULT 'plain');";
const sql = "ALTER TABLE upgrade_notes ADD COLUMN format TEXT NOT NULL DEFAULT 'plain';";
const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
type Scope = "project" | "home";

function packageAt(publisher: ReturnType<typeof newPublisher>, scope: Scope, version: string, options: { allow?: boolean; upgradeSql?: string } = {}) {
  const initial = version === "1.0.0";
  const database = { version: initial ? 1 : 2, schema: initial ? schema1 : schema2,
    ...(initial ? {} : { upgrades: [{ from: 1, sql: options.upgradeSql ?? sql }] }) };
  return signedPackage(publisher, (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const effect = scope === "home" ? "homeDatabase" : "projectDatabase";
    for (const operation of contract.operations) operation.effects = { [effect]: [operation.kind === "query" ? "read" : "write"] };
    if (!initial) contract.operations.unshift({ id: SANDBOX_VALIDATE_UPGRADE, kind: "query", input: { type: "string" }, output: { type: "boolean" },
      effects: {}, errors: [], examples: [{ input: "1.0.0", output: options.allow !== false }] });
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = `export const operations = {
      "notes.list": async (_, sdk) => (await sdk.${effect}.all("SELECT id, text FROM upgrade_notes", [])).map(row => ({...row, id: String(row.id)})),
      "notes.add": async (input, sdk) => { await sdk.${effect}.transaction([{sql: "INSERT INTO upgrade_notes (text) VALUES (?)", parameters: [input.text]}]); return true; },
      ${initial ? "" : `validateUpgrade: async version => version === "1.0.0" && ${options.allow !== false},`}
    };`;
    Object.assign(manifest, sandboxPluginManifest({
      pluginId: PACKAGE_PLUGIN_ID, name: manifest.name, publisher: manifest.publisher, version, presentation: false, contract,
      ...(scope === "home" ? { runtime: { scope: "home" }, homeDatabase: database } : { projectDatabase: database }),
      ...(initial ? {} : { upgradeCompatibility: { migratable_from_versions: ["1.0.0"] } }),
      stateMachines: [{ machine_id: PACKAGE_PLUGIN_ID + ".note", version: 1, states: { active: "connected" }, initial: "active", terminal: ["active"] }],
    }));
  }, { version });
}

function person(project: TestProject) {
  return { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, project_id: project.project_id, permissions: PLUGIN_INSTALL_PERMISSIONS,
    user_action: { source: "management" as const, conversation_ref: "installed-upgrade", message_ref: "confirm" } };
}

async function install(home: TestHome, project: TestProject, bundle: PluginPackageBundle) {
  const client = home.host.actionClient(project.reference);
  const caller = person(project);
  const preview = await client.invoke(caller, pluginInstallActions.preview, { bundle }) as { preview_id: string };
  return client.invoke(caller, pluginInstallActions.confirm, { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
}

function readDatabase(home: TestHome, project: TestProject, scope: Scope, bundle: PluginPackageBundle, query: string) {
  const store = bundle.payload.manifest.databases?.home?.store_name;
  const file = scope === "project" ? project.database_path : join(realpathSync(home.home), store!, store + ".db");
  assert.ok(file);
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare(query).all().map(row => ({ ...row })); }
  finally { db.close(); }
}

async function assertUpgradeCard(home: TestHome, path: string, scope: Scope) {
  const page = await fetch(home.origin + path, { headers: { accept: "text/html" } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(new RegExp(`data-${scope}-plugin-unavailable`).test(html), `expected the ${scope} upgrade card on ${path}`);
  assert.match(html, /data-owner-unavailable="upgrade_failed"/u);
  assert.match(html, /data-copy-value="D-[0-9A-F]{8}"/u);
}

test("SMP-12 UPG-09 signed package reconstruction keeps checked state and SQL declarations", () => {
  const publisher = newPublisher();
  for (const scope of ["home", "project"] as const) {
    const candidate = packageAt(publisher, scope, "1.1.0");
    const parsed = readSandboxPackage(candidate.payload).manifest;
    assert.deepEqual(parsed.databases, candidate.payload.manifest.databases);
    assert.deepEqual(parsed.state_machines, candidate.payload.manifest.state_machines);
    assert.deepEqual(parsed.upgrade_compatibility?.migratable_from_versions, ["1.0.0"]);
  }
});

test("UPG-09 refuses a signed migration validator with write access", () => {
  const publisher = newPublisher(), valid = packageAt(publisher, "project", "1.1.0");
  const bundle = signedPackage(publisher, (files, manifest) => {
    Object.assign(manifest, valid.payload.manifest);
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.push({ id: SANDBOX_VALIDATE_UPGRADE, kind: "query", input: { type: "string" }, output: { type: "boolean" },
      effects: { storage: ["write"] }, errors: [], examples: [] });
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  }, { version: "1.1.0" });
  assert.throws(() => readSandboxPackage(bundle.payload), /validateUpgrade|Queries cannot declare writes/);
});

for (const scope of ["project", "home"] as const) {
  test(`UPG-02 UPG-03 UPG-09 signed ${scope} upgrade moves the installed edition and preserves data across a bounded worker commit`, mac, async t => {
    const home = await openTestHome(t);
    const project = await home.createProject("Upgrade notes");
    const publisher = newPublisher(), initial = packageAt(publisher, scope, "1.0.0");
    await install(home, project, initial);
    const file = scope === "home" ? (() => {
      const name = initial.payload.manifest.databases!.home!.store_name;
      return join(home.home, name, name + ".db");
    })() : project.database_path;
    const writer = new DatabaseSync(file);
    try { writer.exec("INSERT INTO upgrade_notes (text) VALUES ('kept')"); } finally { writer.close(); }

    const refused = packageAt(publisher, scope, "1.1.0", { allow: false });
    await assert.rejects(install(home, project, refused), /旧私有数据校验失败|拒绝迁移/);
    assert.deepEqual(readDatabase(home, project, scope, initial, "SELECT * FROM upgrade_notes"), [{ id: 1, text: "kept" }]);

    const next = packageAt(publisher, scope, "1.2.0");
    assert.deepEqual(await install(home, project, next), {
      plugin_id: PACKAGE_PLUGIN_ID, version: "1.2.0", publisher_key_id: publisher.identity,
    });
    assert.deepEqual(readDatabase(home, project, scope, initial, "SELECT * FROM upgrade_notes"), [{ id: 1, text: "kept", format: "plain" }]);
    const client = home.host.actionClient(project.reference), caller = person(project);
    const offered = (await client.discover(caller)).filter(view => view.provider.plugin_id === PACKAGE_PLUGIN_ID);
    const read = offered.find(view => view.capability_id.endsWith(".notes.list")), add = offered.find(view => view.capability_id.endsWith(".notes.add"));
    assert.ok(read && add);
    assert.equal(offered.some(view => view.capability_id.toLowerCase().includes("validateupgrade")), false);
    assert.notDeepEqual(read.action.permissions, add.action.permissions, "the query and command retain their own effect permissions");
    assert.deepEqual(await client.invoke(caller, { capability_id: read.capability_id, version: read.version, provider_id: read.provider.provider_id }, {}),
      [{ id: "1", text: "kept" }]);
    const runtimedb = new DatabaseSync(scope === "home" ? join(home.home, "plugin-runtime", "plugin-runtime.db") : project.database_path, { readOnly: true });
    try {
      const row = runtimedb.prepare("SELECT json_extract(record_json, '$.version') AS version FROM plugin_runtime_installs WHERE json_extract(record_json, '$.plugin_id') = ?").get(PACKAGE_PLUGIN_ID);
      assert.equal(row?.version, "1.2.0");
    } finally { runtimedb.close(); }
  });
}

test("UPG-04 UPG-06 UPG-09 an interrupted SQL worker leaves the old owned schema and install row", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Interrupted upgrade");
  const publisher = newPublisher(), initial = packageAt(publisher, "project", "1.0.0");
  await install(home, project, initial);
  const prototype = ChildProcess.prototype as ChildProcess & { spawn(options: { args: readonly string[] }): void };
  const spawnChild = prototype.spawn;
  let interrupted = false;
  t.mock.method(prototype, "spawn", function(this: ChildProcess, options: { args: readonly string[] }) {
    const started = Reflect.apply(spawnChild, this, [options]);
    if (!options.args.some(arg => arg.endsWith("/project-statement-worker.js"))) return started;
    const send = this.send;
    t.mock.method(this, "send", function(this: ChildProcess, ...args: Parameters<ChildProcess["send"]>) {
      if ((args[0] as { publishUpgrade?: boolean })?.publishUpgrade) {
        interrupted = true;
        this.kill("SIGKILL");
        return false;
      }
      return Reflect.apply(send, this, args);
    });
    return started;
  });
  await assert.rejects(install(home, project, packageAt(publisher, "project", "1.1.0")), /进程|升级/);
  assert.equal(interrupted, true);
  const table = readDatabase(home, project, "project", initial, "PRAGMA table_info(upgrade_notes)");
  assert.deepEqual(table.map(row => row.name), ["id", "text"]);
  const records = readDatabase(home, project, "project", initial,
    "SELECT json_extract(record_json, '$.version') AS version, json_extract(record_json, '$.state') AS state FROM plugin_runtime_installs WHERE json_extract(record_json, '$.plugin_id') = 'io.molis.work.example.notes'");
  assert.deepEqual(records, [{ version: "1.0.0", state: "disabled" }]);
  await assertUpgradeCard(home, `/projects/${project.project_id}/`, "project");
});

test("UPG-03 UPG-04 a failed Home upgrade is restored byte for byte and leaves another plugin running", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Restore owned bytes");
  const publisher = newPublisher(), initial = packageAt(publisher, "home", "1.0.0");
  await install(home, project, initial);
  const name = initial.payload.manifest.databases!.home!.store_name, file = join(home.home, name, name + ".db");
  const db = new DatabaseSync(file);
  try {
    db.exec("INSERT INTO upgrade_notes (text) VALUES ('held')");
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  } finally { db.close(); }
  const before = readFileSync(file);
  const otherId = "io.molis.work.example.other-notes";
  await install(home, project, signedPackage(newPublisher(), undefined, { pluginId: otherId }));
  await assert.rejects(install(home, project, packageAt(publisher, "home", "1.1.0", {
    upgradeSql: "UPDATE upgrade_notes SET text = 'temporary'",
  })), { code: "plugin.project_database.upgrade_failed" });
  assert.deepEqual(readFileSync(file), before);
  assert.deepEqual(readDatabase(home, project, "home", initial, "SELECT * FROM upgrade_notes"), [{ id: 1, text: "held" }]);
  const other = await home.host.withProject(project.reference, ({ store }) => store.db.prepare(
    "SELECT json_extract(record_json, '$.state') AS state FROM plugin_runtime_installs WHERE json_extract(record_json, '$.plugin_id') = ?").get(otherId));
  assert.deepEqual({ ...(other as { state: string }) }, { state: "running" });
  await assertUpgradeCard(home, `/projects/${project.project_id}/`, "home");
});
