import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { AssistantStore, DEMO_PROJECT_ID, LocalProjectDatabase, readMcpToolPreference, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { charactersManifest } from "@molis-ai/molis-work-plugin-characters";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { diffManifest } from "@molis-ai/molis-work-plugin-diff";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { gitManifest } from "@molis-ai/molis-work-plugin-git";
import { shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
import { textStatsManifest } from "@molis-ai/molis-work-plugin-text-stats";
import { WORKFLOWS_STORE_BASELINE } from "@molis-ai/molis-work-plugin-workflows";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { applySqliteBaseline, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MAPPING, PLUGINS, installIdentity, rewriteActionKeys, rewriteReferences, run } from "./fixtures/provider-identity-maintenance.mjs";

// The rehearsal of the W3-06 C maintenance (docs/releases/CHECKLIST.md 4.3, "维护七"): a Home laid out the way the product writes it,
// holding references to the seven built-in Runtime plugins by the id of their installation. Delete this file with
// tests/fixtures/provider-identity-maintenance.mjs once the real Home has been done.

const script = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "provider-identity-maintenance.mjs");
const oldId = (pluginId: string) => [...MAPPING].find(([, id]) => id === pluginId)![0] as string;
const [CODING, FILES, GIT, DIFF, SHELF, CHARACTERS] = ["coding", "files", "git", "diff", "shelf", "characters"].map(name => oldId(`io.molis.work.${name}`));
const ref = (capability: string, provider: string) => ({ capability_id: capability, version: 1, provider_id: provider });
const key = (capability: string, provider: string) => JSON.stringify([capability, 1, provider]);
/** The kind directory the Coding session index lives in (`molis-agent-index-` and 24 hex digits of the app id's hash). */
const INDEX_KIND = "molis-agent-index-0123456789abcdef01234567";
/** The record Prologue's NodeStorage writes for a body it encrypts with agent-runtime/storage.key: { version, updatedAtMs, metadata, tombstoned, secure }. */
function sealedRecord(storageKey: Buffer, body: unknown): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", storageKey, iv);
  const sealed = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(body))), cipher.final()]);
  return JSON.stringify({ version: 1, updatedAtMs: 1, metadata: { schema: 1 }, tombstoned: false,
    secure: { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), body: sealed.toString("base64") } });
}

function filesUnder(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesUnder(join(directory, entry.name), relative) : entry.isSymbolicLink() ? [] : [relative];
  }).sort();
}
/** A digest of every file that is data (not a -wal or -shm side file): what a read-only command must leave as it was. */
function digest(directory: string): string {
  const hash = createHash("sha256");
  for (const relative of filesUnder(directory).filter(file => !/-(?:wal|shm)$/u.test(file))) hash.update(relative).update(readFileSync(join(directory, relative)));
  return hash.digest("hex");
}

/** A Home written by the product's own code where that is public, and by SQL on the product's own baseline elsewhere. */
function buildHome(directory: string, options: { collision?: boolean } = {}): { home: string; decoy: string } {
  const home = join(directory, "home"), decoy = join(directory, "real-home");
  mkdirSync(join(home, "config"), { recursive: true });

  // config/mcp-tools.json: per-client grants, written the way the product writes it.
  const grant = (capability: string, provider: string, enabled = true) => ({ client_id: "runtime:a", project_id: capability.startsWith("shelf") ? null : DEMO_PROJECT_ID,
    capability_id: capability, version: 1, provider_id: provider, permissions: ["workspace:read"], enabled });
  const grants = [grant("files.open", FILES), grant("shelf.items.list", SHELF, false), grant("todo.list", "io.molis.work.todo"),
    ...(options.collision ? [grant("files.open", "io.molis.work.files")] : [])];
  writeFileSync(join(home, "config", "mcp-tools.json"), `${JSON.stringify({ version: 2, action_grants: grants }, null, 2)}\n`, { mode: 0o600 });

  // workflows/workflows.db: a workflow and a run, steps pinned to the exact provider.
  const workflows = openHomeSqliteDatabase(home, "workflows");
  applySqliteBaseline(workflows, "workflows", WORKFLOWS_STORE_BASELINE);
  const chain = JSON.stringify({ steps: [{ action: ref("git.state", GIT) }, { action: ref("todo.list", "io.molis.work.todo") }] });
  workflows.prepare("INSERT INTO workflows (workflow_id, project_id, title, chain_json, revision, created_at, updated_at, deleted) VALUES ('w1', 'p1', '流程', ?, 1, 'x', 'x', 0)").run(chain);
  workflows.prepare("INSERT INTO instances (instance_id, workflow_id, project_id, title, status, current, chain_json, steps_json, created_at, updated_at) VALUES ('i1', 'w1', 'p1', '流程', 'running', 0, ?, ?, 'x', 'x')")
    .run(chain, JSON.stringify([{ reference: ref("git.state", GIT), status: "done" }, { reference: ref("diff.compare", DIFF), status: "pending" }]));
  workflows.close();

  // characters/characters.sqlite: a draft that offers two actions of the built-in plugins.
  const characters = openCharacters(home, "web-user");
  const draft = characters.service.create();
  characters.service.update(draft.character_id, 1, { title: "审阅者", instructions: "只读代码", host_tools: null, action_tools: [ref("coding.runs.list", CODING), ref("shelf.items.list", SHELF)] });
  characters.close();

  // projects/p1/molis-work.db: the project database the product creates.
  mkdirSync(join(home, "projects", "p1"), { recursive: true });
  const projectFile = join(home, "projects", "p1", "molis-work.db");
  seedDemoBoard(projectFile);
  const project = new LocalProjectDatabase(projectFile);
  project.db.prepare("INSERT INTO plugin_private_values (install_id, item_key, item_value) VALUES (?, 'actions:s1', ?)").run(CODING, JSON.stringify([ref("files.open", FILES), ref("git.state", GIT)]));
  project.db.prepare("INSERT INTO plugin_private_values (install_id, item_key, item_value) VALUES (?, 'note', ?)").run(SHELF, JSON.stringify({ pinned: ref("files.open", FILES) }));
  project.db.prepare("INSERT INTO plugin_private_values (install_id, item_key, item_value) VALUES ('plugin-install-someone-else', 'actions:s9', ?)").run(JSON.stringify([ref("files.open", FILES)]));
  project.db.prepare("INSERT OR REPLACE INTO plugin_runtime_installs (install_id, record_json) VALUES (?, ?)").run(CODING, JSON.stringify({ install_id: CODING, plugin_id: "io.molis.work.coding" }));
  project.db.prepare("INSERT INTO library_artifacts (artifact_id, project_id, owner_actor_id, producer_plugin_id, producer_binding_signature, created_at) VALUES ('character-a', ?, 'web-user', 'io.molis.work.characters', 'official-characters-binding', 'x')").run(DEMO_PROJECT_ID);
  project.db.prepare(`INSERT INTO library_artifact_versions (artifact_id, version, artifact_type_id, schema_version, producer_plugin_version, content_kind, payload_json, content_digest, size_bytes,
    scope, availability, lifecycle_state, created_by, created_at, origin_json, title, media_type) VALUES ('character-a', 1, 'characters.character', 1, '1', 'inline', ?, 'd', 10,
    'personal', 'available', 'active', 'web-user', 'x', '{}', '审阅者', 'application/json')`).run(JSON.stringify({ title: "审阅者", action_tools: [ref("coding.runs.list", CODING)] }));
  project.close();

  // assistant/assistant.db: what the person switched off, and what is waiting on the Assistant.
  const assistantDb = openHomeSqliteDatabase(home, "assistant");
  const assistant = new AssistantStore(assistantDb);
  assistant.setActionEnabled("web-user", key("coding.runs.start", CODING), false);
  assistant.setActionEnabled("web-user", key("todo.list", "io.molis.work.todo"), false);
  assistant.setConfirmAlways("web-user", key("files.open", FILES), true);
  assistant.addCard({ card_id: "c1", work_id: "w1", revision: 1, run_id: null, title: "t", summary: "s", provider: "Coding", capability_title: "启动", effect: "write", reference: ref("coding.runs.start", CODING),
    input: {}, input_schema: {}, editable: [], missing: [], status: "ready", created_at: "x", updated_at: "x" });
  assistant.saveUndo("web-user", { undo_id: "u1", work_id: "w1", reference: ref("git.prepare-index", GIT), input: {} } as never);
  assistant.saveJob("web-user", { key: "j1", work_id: "w1", status: ref("coding.runs.list", CODING), input: "{}", path: "x", done: [], failed: [], checks: 0 } as never);
  assistantDb.close();

  // search/search.db is derived: it checks itself against the directory.
  const search = openHomeSqliteDatabase(home, "search");
  search.exec("CREATE TABLE entries (provider_id TEXT, source TEXT)");
  search.prepare("INSERT INTO entries VALUES (?, 'x')").run(CODING);
  search.close();

  // The catalog stores absolute paths; run on a copy they point at the real Home, which must never be opened.
  mkdirSync(join(decoy, "projects", "p9"), { recursive: true });
  const decoyFile = join(decoy, "projects", "p9", "molis-work.db");
  const decoyDb = new DatabaseSync(decoyFile);
  decoyDb.exec("CREATE TABLE plugin_private_values (install_id TEXT, item_key TEXT, item_value TEXT)");
  decoyDb.prepare("INSERT INTO plugin_private_values VALUES (?, 'actions:s1', ?)").run(CODING, JSON.stringify([ref("files.open", FILES)]));
  decoyDb.close();
  const catalog = new DatabaseSync(join(home, "projects", "catalog.db"));
  catalog.exec("CREATE TABLE projects (project_id TEXT, database_path TEXT)");
  catalog.prepare("INSERT INTO projects VALUES ('p9', ?)").run(decoyFile);
  catalog.close();
  symlinkSync(join(decoy, "projects", "p9"), join(home, "projects", "linked"), "dir");

  // Files the product keeps outside SQLite. The Coding session index freezes the exact action references of every round in an encrypted body
  // (agent-runtime/records/molis-agent-index-*), which the tool cannot open: it counts those records and says so. A tombstone has no body.
  const storageKey = randomBytes(32);
  mkdirSync(join(home, "agent-runtime", "records", INDEX_KIND), { recursive: true });
  writeFileSync(join(home, "agent-runtime", "storage.key"), storageKey, { mode: 0o600 });
  for (const id of ["s1", "s2"]) {
    writeFileSync(join(home, "agent-runtime", "records", INDEX_KIND, `${id}.json`), sealedRecord(storageKey, { attempts: [{ frozen: { action_tools: [ref("files.open", FILES)] } }] }));
  }
  writeFileSync(join(home, "agent-runtime", "records", INDEX_KIND, "s3.json"), JSON.stringify({ version: 2, updatedAtMs: 1, metadata: {}, tombstoned: true }));
  // A JSON store no rule knows (a designed plugin's contract can name the exact provider it was designed against), and the call log.
  mkdirSync(join(home, "plugin-builder", "p1", "design"), { recursive: true });
  writeFileSync(join(home, "plugin-builder", "p1", "design", "contract.json"), JSON.stringify({ consumes: [ref("files.open", FILES)] }, null, 2));
  mkdirSync(join(home, "logs"), { recursive: true });
  writeFileSync(join(home, "logs", "action-calls.jsonl"), [
    { at: "2026-10-09T10:00:00.000Z", capability_id: "files.open", version: 1, provider_id: FILES, ok: true },
    { at: "2026-10-09T10:01:00.000Z", capability_id: "git.state", version: 1, provider_id: GIT, ok: true },
    { at: "2026-10-10T10:01:00.000Z", capability_id: "git.state", version: 1, provider_id: "io.molis.work.git", ok: true },
  ].map(row => JSON.stringify(row)).join("\n") + "\n");
  // What is never entered or opened: an installed release, the secret store, and a symbolic link to a file outside the Home.
  mkdirSync(join(home, "releases", "molis-work-0.0.0"), { recursive: true });
  writeFileSync(join(home, "releases", "molis-work-0.0.0", "release.json"), JSON.stringify({ note: ref("coding.runs.list", CODING) }));
  writeFileSync(join(home, "releases", "molis-work-0.0.0", "fixture.db"), "this is not a database");
  mkdirSync(join(home, "feed"), { recursive: true });
  writeFileSync(join(home, "feed", "secrets.json"), JSON.stringify({ version: 2, sealed: ref("coding.runs.list", CODING) }), { mode: 0o600 });
  mkdirSync(join(decoy, "config"), { recursive: true });
  writeFileSync(join(decoy, "config", "elsewhere.json"), JSON.stringify(ref("files.open", FILES)));
  symlinkSync(join(decoy, "config", "elsewhere.json"), join(home, "config", "linked.json"), "file");
  return { home, decoy };
}

const withDirectory = (body: (directory: string) => void | Promise<void>) => async () => {
  const directory = mkdtempSync(join(tmpdir(), "provider-identity-maintenance-"));
  try { await body(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
};
type Row = { file: string; table?: string; column?: string; rows: number; references: number; others: number; reason?: string; records?: number };
const rules = (report: { rewritable: Array<{ rule: string; table?: string; column?: string; rows: number; references: number }> }) =>
  Object.fromEntries(report.rewritable.map(row => [`${row.rule}${row.table ? `:${row.table}.${row.column}` : ""}`, [row.rows, row.references]]));

test("the seven old ids are the ones the Runtime derives for the built-in manifests", () => {
  const manifests = [charactersManifest, shelfManifest, codingManifest, filesManifest, diffManifest, gitManifest, textStatsManifest];
  assert.deepEqual(PLUGINS.map(([pluginId]) => pluginId).sort(), manifests.map(manifest => manifest.plugin_id).sort());
  for (const manifest of manifests) {
    const entry = PLUGINS.find(([pluginId]) => pluginId === manifest.plugin_id)!;
    assert.equal(entry[1], manifest.publisher.signature, `${manifest.plugin_id}: the signature the id is derived from`);
    const definition: PluginDefinition = { manifest, async start() { return { kind: "app", views: [] }; } };
    const installed = new PluginRuntime(new MemoryPluginRuntimeRepository()).install({ definition, deployment: manifest.entrypoints[0]!.deployment, grants: [] }).install;
    assert.equal(installed.install_id, installIdentity(...(entry as [string, string])), `${manifest.plugin_id}: the id the Runtime gave the installation`);
    assert.equal(MAPPING.get(installed.install_id), manifest.plugin_id);
  }
  assert.equal(MAPPING.size, 7);
});

test("the rewrite touches a provider_id with an old id and nothing else; assistant action keys are mapped and kept in the order the product keeps", () => {
  const text = `{"a":{"provider_id": "${FILES}"},"b":"${FILES}","c":{"install_id":"${FILES}"},"d":"sdk.artifacts.${FILES}.read","e":{"provider_id":"io.molis.work.todo"}}`;
  const [next, count] = rewriteReferences(text);
  assert.equal(count, 1);
  assert.equal(next, text.replace(`"provider_id": "${FILES}"`, '"provider_id": "io.molis.work.files"'));
  const sorted = JSON.stringify([key("a.b", "io.molis.work.zzz"), key("coding.x", CODING), key("coding.x", CODING)].sort());
  assert.deepEqual(rewriteActionKeys(sorted, true), [JSON.stringify([key("coding.x", "io.molis.work.coding"), key("a.b", "io.molis.work.zzz")].sort()), 2], "the copies become one and the order is the sorted one");
  assert.deepEqual(rewriteActionKeys("not json", true), ["not json", 0]);
  assert.deepEqual(rewriteActionKeys(JSON.stringify([key("a.b", "io.molis.work.todo")]), true), [JSON.stringify([key("a.b", "io.molis.work.todo")]), 0]);
});

test("list reads a Home and changes nothing; it names what the rewrite would do and what it will not do", withDirectory(directory => {
  const { home, decoy } = buildHome(directory);
  const before = [digest(home), digest(decoy)];
  const outcome = run(["list", "--home", home]);
  assert.deepEqual([digest(home), digest(decoy)], before, "list leaves every file as it was");
  const report = outcome.report!;
  assert.equal(outcome.code, 3, "the report holds records that are only listed");
  assert.deepEqual(report.problems, []);
  assert.deepEqual(rules(report), {
    "mcp-grants": [2, 2],
    "workflow-steps:workflows.chain_json": [1, 1], "workflow-steps:instances.chain_json": [1, 1], "workflow-steps:instances.steps_json": [1, 2],
    "character-drafts:character_drafts.record": [1, 2],
    "coding-selections:plugin_private_values.item_value": [1, 2],
    "assistant-cards:assistant_cards.body": [1, 1], "assistant-undos:assistant_undos.body": [1, 1], "assistant-jobs:assistant_jobs.body": [1, 1],
    "assistant-settings:assistant_settings.value": [2, 2],
  });
  assert.deepEqual(report.fixed.map((row: { artifact_id: string; version: number; references: number }) => [row.artifact_id, row.version, row.references]), [["character-a", 1, 1]],
    "a published Character version is listed and never rewritten");
  assert.deepEqual(report.derived.map((row: { file: string }) => row.file), ["search/search.db"]);
  assert.deepEqual(report.unclassified.map((row: Row) => [row.file, row.table ?? null, row.column ?? null, row.references]),
    [["projects/p1/molis-work.db", "plugin_private_values", "item_value", 2], ["plugin-builder/p1/design/contract.json", null, null, 1]],
    "the references in a place no rule knows are named, in a database (another plugin's value, a copy of the Coding key under another installation) and in a JSON file; "
    + "the installation's own ids (install_id, sdk.artifacts.…) and the catalog's paths are not");
  assert.deepEqual(report.history.map((row: Row) => [row.file, row.rows, row.references]), [["logs/action-calls.jsonl", 2, 2]],
    "the call log is history: its rows keep the id they were written with and are listed, so that nobody has to wonder, but they need no decision");
  assert.deepEqual(report.unread.map((row: Row) => [row.file, row.reason, row.records]), [[`agent-runtime/records/${INDEX_KIND}`, "encrypted body", 2]],
    "the records with an encrypted body are counted per directory and named as not read: what a Coding round froze is in there and is not seen");
}));

test("the report names what the tool cannot see, and what it must not open is not opened", withDirectory(directory => {
  const { home, decoy } = buildHome(directory);
  writeFileSync(join(home, "big.json"), JSON.stringify({ filler: "x".repeat(2000), reference: ref("files.open", FILES) }));
  const before = [digest(home), digest(decoy)];

  const limited = run(["list", "--home", home], { maxTextBytes: 1000 }).report!;
  assert.deepEqual(limited.problems, [], "a fixture that is not a database under releases/, the secret store and a symbolic link are not opened, so they are not a problem");
  assert.deepEqual(limited.unread.map((row: Row) => [row.file, row.reason, row.records]),
    [[`agent-runtime/records/${INDEX_KIND}`, "encrypted body", 2], ["big.json", "larger than 1000 bytes", undefined]],
    "a file over the size limit is named instead of skipped without a word");
  assert.ok(!limited.unclassified.some((row: Row) => row.file === "big.json"));
  assert.ok(!limited.unclassified.some((row: Row) => row.file.startsWith("agent-runtime/")), "the old id inside an encrypted body is not seen, which is what the NOT READ line says");

  const everything = (report: { [list: string]: Row[] }) => ["rewritable", "fixed", "derived", "unclassified", "history", "unread"].flatMap(name => (report[name] ?? []).map(row => row.file));
  for (const never of ["releases/", "feed/secrets.json", "config/linked.json", "agent-runtime/storage.key"]) {
    assert.ok(!everything(limited).some(file => file.startsWith(never)), `${never} is not entered or opened`);
  }
  assert.ok(run(["list", "--home", home]).report!.unclassified.some((row: Row) => row.file === "big.json"), "the same file is read when the limit allows it");
  assert.deepEqual([digest(home), digest(decoy)], before, "list leaves every file as it was, the keys and the symbolic link's target included");
}));

test("an old id in config/mcp-tools.json outside a provider_id field is listed and left, and a Home with nothing but that file can be rewritten", withDirectory(directory => {
  const home = join(directory, "home");
  mkdirSync(join(home, "config"), { recursive: true });
  const file = join(home, "config", "mcp-tools.json");
  const text = `${JSON.stringify({ version: 2, action_grants: [{ client_id: "runtime:a", project_id: null, capability_id: "files.open", version: 1, provider_id: FILES, permissions: [], enabled: true }],
    note: `kept ${CODING}` }, null, 2)}\n`;
  writeFileSync(file, text, { mode: 0o600 });
  const listed = run(["list", "--home", home]);
  assert.equal(listed.code, 3);
  assert.deepEqual(listed.report!.unclassified.map((row: Row) => [row.file, row.references, row.others]), [["config/mcp-tools.json", 0, 1]]);
  const done = run(["rewrite", "--home", home]);
  assert.deepEqual(done.report?.problems, [], done.error);
  assert.equal(readFileSync(file, "utf8"), text.replace(`"provider_id": "${FILES}"`, '"provider_id": "io.molis.work.files"'), "only the provider_id field changed");
  assert.deepEqual(done.report!.unclassified.map((row: Row) => [row.file, row.others]), [["config/mcp-tools.json", 1]]);
  assert.equal(done.code, 3);
}));

test("rewrite moves every rule's references to the plugin id, keeps the rest of each record as it was, and a second run has nothing to do", withDirectory(async directory => {
  const { home, decoy } = buildHome(directory);
  const mcpBefore = readFileSync(join(home, "config", "mcp-tools.json"), "utf8");
  const decoyBefore = digest(decoy);
  const searchBefore = digest(join(home, "search"));
  const notRewritten = ["agent-runtime", "logs", "plugin-builder", "releases", "feed"].map(name => [name, digest(join(home, name))]);
  const outcome = run(["rewrite", "--home", home]);
  assert.deepEqual(outcome.report!.problems, []);
  assert.equal(outcome.report!.remaining, 0);
  assert.equal(outcome.code, 3, "the published version and the stray reference are still listed");
  assert.equal(digest(decoy), decoyBefore, "the path the catalog stores and a symbolic link to it are never followed");
  assert.equal(digest(join(home, "search")), searchBefore, "the derived search index is left to rebuild itself");
  for (const [name, expected] of notRewritten) assert.equal(digest(join(home, name!)), expected, `${name}: listed or never opened, and never rewritten`);
  assert.deepEqual(outcome.report!.unclassified.map((row: Row) => row.file), ["projects/p1/molis-work.db", "plugin-builder/p1/design/contract.json"]);

  // config/mcp-tools.json: the same file with two ids replaced, in the same mode, and the product still reads every grant.
  const mcpAfter = readFileSync(join(home, "config", "mcp-tools.json"), "utf8");
  assert.equal(mcpAfter, mcpBefore.replace(`"provider_id": "${FILES}"`, '"provider_id": "io.molis.work.files"').replace(`"provider_id": "${SHELF}"`, '"provider_id": "io.molis.work.shelf"'));
  assert.equal(statSync(join(home, "config", "mcp-tools.json")).mode & 0o777, 0o600);
  const preference = await readMcpToolPreference(home);
  assert.deepEqual(preference.action_grants.map(grant => [grant.capability_id, grant.provider_id, grant.enabled]),
    [["files.open", "io.molis.work.files", true], ["shelf.items.list", "io.molis.work.shelf", false], ["todo.list", "io.molis.work.todo", true]]);

  const read = (name: string, sql: string) => { const db = new DatabaseSync(join(home, name), { readOnly: true }); try { return db.prepare(sql).all() as Array<Record<string, string>>; } finally { db.close(); } };
  assert.deepEqual(read("workflows/workflows.db", "SELECT chain_json AS v FROM workflows").map(row => JSON.parse(row.v)),
    [{ steps: [{ action: ref("git.state", "io.molis.work.git") }, { action: ref("todo.list", "io.molis.work.todo") }] }]);
  assert.deepEqual(read("workflows/workflows.db", "SELECT steps_json AS v FROM instances").map(row => JSON.parse(row.v)),
    [[{ reference: ref("git.state", "io.molis.work.git"), status: "done" }, { reference: ref("diff.compare", "io.molis.work.diff"), status: "pending" }]]);
  const characters = openCharacters(home, "web-user");
  try { assert.deepEqual(characters.service.list()[0]!.action_tools, [ref("coding.runs.list", "io.molis.work.coding"), ref("shelf.items.list", "io.molis.work.shelf")]); } finally { characters.close(); }
  const project = read("projects/p1/molis-work.db", "SELECT install_id, item_key, item_value FROM plugin_private_values ORDER BY item_key");
  assert.deepEqual(project.map(row => [row.install_id, row.item_key, JSON.parse(row.item_value)]), [
    [CODING, "actions:s1", [ref("files.open", "io.molis.work.files"), ref("git.state", "io.molis.work.git")]],
    ["plugin-install-someone-else", "actions:s9", [ref("files.open", FILES)]],
    [SHELF, "note", { pinned: ref("files.open", FILES) }],
  ]);
  assert.equal(read("projects/p1/molis-work.db", "SELECT record_json AS v FROM plugin_runtime_installs WHERE install_id = '" + CODING + "'")[0]!.v.includes(`"install_id":"${CODING}"`), true, "an installation's own id stays");
  assert.ok(read("projects/p1/molis-work.db", "SELECT payload_json AS v FROM library_artifact_versions")[0]!.v.includes(CODING), "a published Character version is fixed");

  const assistantDb = openHomeSqliteDatabase(home, "assistant");
  const assistant = new AssistantStore(assistantDb);
  try {
    assert.deepEqual([...assistant.disabledActions("web-user")], [key("coding.runs.start", "io.molis.work.coding"), key("todo.list", "io.molis.work.todo")].sort(), "what the person switched off stays switched off");
    assert.deepEqual([...assistant.confirmAlways("web-user")], [key("files.open", "io.molis.work.files")]);
    assert.equal(assistant.cards("w1")[0]!.reference.provider_id, "io.molis.work.coding");
    assert.equal(assistant.undos("web-user", "w1")[0]!.reference.provider_id, "io.molis.work.git");
    assert.equal(assistant.jobs("web-user")[0]!.status.provider_id, "io.molis.work.coding");
  } finally { assistantDb.close(); }

  const afterFirst = digest(home);
  const again = run(["rewrite", "--home", home]);
  assert.deepEqual([again.report!.rewritable, again.report!.problems], [[], []], "the second run has nothing to rewrite");
  assert.equal(digest(home), afterFirst, "and leaves every file as the first run left it");
}));

test("rewrite stops before writing anything when a grant would collide with a record that already holds the plugin id, or a database cannot be read", withDirectory(directory => {
  const { home } = buildHome(directory, { collision: true });
  const before = digest(home);
  const collided = run(["rewrite", "--home", home]);
  assert.equal(collided.code, 1);
  assert.match(collided.report!.problems[0].message, /collide/);
  assert.equal(digest(home), before, "not one file changed, the databases included");

  const { home: other } = buildHome(join(directory, "second"), {});
  mkdirSync(join(other, "junk"));
  writeFileSync(join(other, "junk", "junk.db"), "this is not a database");
  const otherBefore = digest(other);
  const unreadable = run(["rewrite", "--home", other]);
  assert.equal(unreadable.code, 1);
  assert.equal(unreadable.report!.problems[0].file, "junk/junk.db");
  assert.equal(digest(other), otherBefore);
}));

test("the real Home is refused: list never opens it, rewrite needs the approved maintenance window", withDirectory(directory => {
  const fakeHome = join(directory, "user");
  const real = join(fakeHome, ".molis-work");
  mkdirSync(real, { recursive: true });
  const command = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, HOME: fakeHome, MOLIS_WORK_HOME: "" } });
  const list = command("list", "--home", real);
  assert.equal(list.status, 2); assert.match(list.stderr, /real Home: run list on a copy/);
  const rewrite = command("rewrite", "--home", real);
  assert.equal(rewrite.status, 2); assert.match(rewrite.stderr, /needs --maintenance-window/);
  assert.equal(command("rewrite").status, 2, "--home is required");
  // With the approved window the real Home is accepted; this one holds nothing, so there is nothing to do (and nothing is asked of lsof).
  const approved = command("rewrite", "--home", real, "--maintenance-window", "--json");
  assert.equal(approved.status, 0, approved.stderr);
  assert.deepEqual(JSON.parse(approved.stdout).rewritable, []);
  // A copy of it is not the real Home.
  const copy = join(directory, "copy");
  mkdirSync(copy);
  const onCopy = command("list", "--home", copy, "--json");
  assert.equal(onCopy.status, 0, onCopy.stderr);
  assert.deepEqual(JSON.parse(onCopy.stdout).rewritable, []);
}));
