// S-person-settings-private (specs/unified-partition-plugins §11, UPP-15, batch 106): settings that follow the person stay with the person on
// this machine and the plugin's own background; only a preference may follow them to their other devices, and never a secret, a connection
// or a path on this machine.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPersonSettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { personSettingsInstallations } from "@molis-ai/molis-work-app-local-host";
import { partitionDeclarationProblems, type PartitionDeclarationFields } from "@molis-ai/molis-work-plugin-sdk";
import { assertPersonSettingsCaller, openPersonSettings, personSettingsConfigReplica } from "@molis-ai/molis-work-service-person-settings";

const INSTALL = "images-install", PLUGIN = "io.molis.work.images";
const owner = { install_id: INSTALL, plugin_id: PLUGIN };
const declarations: PluginPersonSettingsDeclaration = { keys: [
  { key: "default_service", kind: "preference", portable: true },
  { key: "last_folder", kind: "local_path" },
  { key: "api_key", kind: "secret_ref" },
  { key: "connection", kind: "connection_ref" },
] };

async function withSettings(run: (settings: ReturnType<typeof openPersonSettings>, home: string) => void | Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "molis-work-person-settings-"));
  const settings = openPersonSettings(home);
  try { await run(settings, home); } finally { settings.close(); await rm(home, { recursive: true, force: true }); }
}

const caller = (fields: Partial<ActionCallContext>) => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", actor_kind: "user", permissions: [], project_id: null, ...fields }) as ActionCallContext;
const person = caller({});
const forbidden = { code: "actions.forbidden" };

test("UPP-15 S-person-settings-private only the person on this machine and the plugin's own background reach its person settings", async () => {
  const hostPlugin = { plugin_id: PLUGIN, install_id: INSTALL, actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null };
  assert.doesNotThrow(() => assertPersonSettingsCaller(person, INSTALL), "the person on this machine");
  assert.doesNotThrow(() => assertPersonSettingsCaller(caller({ audience: "plugin", actor_kind: "runtime", plugin_install_id: INSTALL }), INSTALL), "its own background (runtime)");
  assert.doesNotThrow(() => assertPersonSettingsCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "plugin", plugin_install_id: INSTALL, permissions: [], project_id: null } as ActionCallContext, INSTALL),
    "its own activation job (no actor_kind, no host_plugin)");
  const denied: ReadonlyArray<readonly [string, Partial<ActionCallContext>]> = [
    ["a project Agent", { actor_id: "agent:runtime-1", audience: "agent", actor_kind: "runtime", project_id: "project-a" }],
    ["the personal assistant", { audience: "agent", actor_kind: "runtime", audit_actor_id: "assistant:work-1" }],
    ["an MCP client", { audience: "mcp", actor_kind: "runtime" }],
    ["a workflow", { audience: "workflow", actor_kind: "runtime" }],
    ["another plugin", { audience: "plugin", actor_kind: "runtime", plugin_install_id: "other-install" }],
    ["another member (non-local person)", { actor_id: "member:teammate-1" }],
    ["another member's plugin background", { actor_id: "member:teammate-1", audience: "plugin", actor_kind: "runtime", plugin_install_id: INSTALL }],
    ["a person call carrying calling_plugin_id", { calling_plugin_id: "io.molis.work.other" }],
    ["a plugin dependency action call (actor_kind user + host_plugin)", { audience: "plugin", actor_kind: "user", host_plugin: hostPlugin as never, plugin_install_id: INSTALL }],
    ["a plugin call carrying host_plugin", { audience: "plugin", actor_kind: "runtime", host_plugin: hostPlugin as never, plugin_install_id: INSTALL }],
    ["a plugin call carrying calling_plugin_id", { audience: "plugin", actor_kind: "runtime", calling_plugin_id: PLUGIN, plugin_install_id: INSTALL }],
    ["the person's call handed on by a plugin", { delegated_by: "other-install" }],
    ["its own background handed another plugin's call", { audience: "plugin", actor_kind: "runtime", plugin_install_id: INSTALL, delegated_by: "other-install" }],
    ["a runtime under the person's name", { actor_kind: "runtime" }],
  ];
  for (const [label, fields] of denied) assert.throws(() => assertPersonSettingsCaller(caller(fields), INSTALL), forbidden, label);
  await withSettings(settings => {
    settings.set(person, owner, declarations, "default_service", { provider: "fal" });
    for (const [label, fields] of denied) {
      const ctx = caller(fields);
      assert.throws(() => settings.get(ctx, INSTALL, declarations, "default_service"), forbidden, `get: ${label}`);
      assert.throws(() => settings.list(ctx, INSTALL), forbidden, `list: ${label}`);
      assert.throws(() => settings.set(ctx, owner, declarations, "default_service", { provider: "x" }), forbidden, `set: ${label}`);
      assert.throws(() => settings.remove(ctx, INSTALL, declarations, "default_service"), forbidden, `remove: ${label}`);
    }
    const ownBg = caller({ audience: "plugin", actor_kind: "runtime", plugin_install_id: INSTALL });
    assert.deepEqual(settings.get(ownBg, INSTALL, declarations, "default_service")?.value, { provider: "fal" });
  });
});

test("UPP-15 S-person-settings-private the SDK refuses a secret, a connection or a path marked portable; the table refuses it too", async () => {
  // Read the way a Manifest file is read, so a key marked portable against the contract reaches the checks.
  const manifest = (keys: readonly object[]): PartitionDeclarationFields => JSON.parse(JSON.stringify({ plugin_id: PLUGIN, person_settings: { keys } }));
  assert.deepEqual(partitionDeclarationProblems(manifest(declarations.keys)), []);
  for (const kind of ["secret_ref", "connection_ref", "local_path"]) {
    const problems = partitionDeclarationProblems(manifest([{ key: "x", kind, portable: true }]));
    assert.equal(problems.length, 1, kind);
    assert.match(problems[0]!, /不能标 portable/u, kind);
  }
  await withSettings(settings => {
    const forged = JSON.parse(JSON.stringify({ keys: [{ key: "api_key", kind: "secret_ref", portable: true }] })) as PluginPersonSettingsDeclaration;
    assert.throws(() => settings.set(person, owner, forged, "api_key", "secret-value"), { code: "actions.input_invalid" }, "store refuses non-preference portable before SQLite");
    assert.throws(() => settings.db.prepare("INSERT INTO person_settings VALUES (?, ?, 'k', 'secret_ref', 1, '\"x\"', 1, ?)").run("i", "p", new Date().toISOString()),
      /CHECK constraint failed/u, "a portable secret cannot be stored");
  });
});

test("UPP-15 person settings are kept per installation and key, with a revision that refuses a stale write", async () => withSettings(settings => {
  assert.equal(settings.get(person, INSTALL, declarations, "default_service"), null);
  const first = settings.set(person, owner, declarations, "default_service", { provider: "fal" });
  assert.equal(first.revision, 1);
  assert.equal(first.portable, true);
  assert.throws(() => settings.set(person, owner, declarations, "default_service", { provider: "other" }, { expected_revision: 0 }), { code: "actions.conflict" });
  assert.equal(settings.set(person, owner, declarations, "default_service", { provider: "other" }, { expected_revision: 1 }).revision, 2);
  assert.throws(() => settings.set(person, owner, declarations, "undeclared", 1), { code: "actions.input_invalid" }, "only a declared key");
  assert.throws(() => settings.set(person, owner, declarations, "default_service", { folder: "/Users/someone/Pictures" }), { code: "actions.input_invalid" },
    "a portable value that names a path on this machine is refused before it is kept");
  settings.set(person, owner, declarations, "last_folder", "/Users/someone/Pictures");
  assert.equal(settings.list(person, INSTALL).length, 2);
  assert.equal(settings.remove(person, INSTALL, declarations, "last_folder"), true);
  assert.equal(settings.list(person, INSTALL).length, 1);
  assert.equal(settings.clearInstall(INSTALL), 1, "an uninstall that takes its data takes its settings");
}));

test("UPP-15 S-person-settings-private two installations of one plugin id keep separate settings and sync isolates by install_id", async () => withSettings(settings => {
  const installA = "images-install-a", installB = "images-install-b";
  settings.set(person, { install_id: installA, plugin_id: PLUGIN }, declarations, "default_service", { provider: "alpha" });
  settings.set(person, { install_id: installB, plugin_id: PLUGIN }, declarations, "default_service", { provider: "beta" });
  assert.deepEqual(settings.get(person, installA, declarations, "default_service")?.value, { provider: "alpha" });
  assert.deepEqual(settings.get(person, installB, declarations, "default_service")?.value, { provider: "beta" });

  // Replica bound to installB reads only installB's row and deletes only installB's row.
  const replicaB = personSettingsConfigReplica(settings.db, "space-1", () => {}, pluginId => pluginId === PLUGIN ? { install_id: installB, declarations } : null);
  const outgoing = replicaB.next();
  assert.ok(outgoing?.value);
  assert.deepEqual((outgoing.value as { data: { value: unknown } }).data.value, { provider: "beta" }, "uploads installB's value, never installA's");
  replicaB.acknowledge(outgoing.key, outgoing.operationId, 1);
  replicaB.receive({ ...outgoing, value: null, base: 1, revision: 2, operationId: "remote-delete" });
  assert.equal(settings.get(person, installB, declarations, "default_service"), null, "installB's setting removed by remote delete");
  assert.deepEqual(settings.get(person, installA, declarations, "default_service")?.value, { provider: "alpha" }, "installA's setting untouched");

  // personSettingsInstallations ignores uninstalled entries and refuses ambiguous multi-publisher installations.
  const manifest = { plugin_id: PLUGIN, person_settings: declarations };
  assert.equal(personSettingsInstallations(() => [{ install_id: installA, state: "uninstalled", manifest }])(PLUGIN), null);
  assert.equal(personSettingsInstallations(() => [{ install_id: installA, state: "enabled", manifest }, { install_id: installB, state: "enabled", manifest }])(PLUGIN), null);
  assert.equal(personSettingsInstallations(() => [{ install_id: installA, state: "uninstalled", manifest }, { install_id: installB, state: "enabled", manifest }])(PLUGIN)?.install_id, installB);
}));

test("UPP-15 S-person-settings-private sync carries only the portable preferences of a plugin installed here, never a path, a secret or another plugin's key", async () => withSettings(settings => {
  settings.set(person, owner, declarations, "default_service", { provider: "fal" });
  settings.set(person, owner, declarations, "last_folder", "/Users/someone/Pictures");
  settings.set(person, owner, declarations, "api_key", { ref: "secret:images/key" });
  const installed = (pluginId: string) => pluginId === PLUGIN ? { install_id: INSTALL, declarations } : null;
  const changed = settings.db.prepare("SELECT DISTINCT key FROM person_settings_replica_changes ORDER BY key").all().map(row => String(row.key));
  assert.deepEqual(changed, [`${PLUGIN}/default_service`], "only the portable key is journaled, keyed by plugin (another device has its own install id)");
  const replica = personSettingsConfigReplica(settings.db, "space-1", () => {}, installed);
  const outgoing = JSON.stringify(replica.next());
  assert.match(outgoing, /default_service/u);
  assert.doesNotMatch(outgoing, /Pictures|secret:|api_key/u, "nothing of this machine or a secret goes out");
  for (const key of [`${PLUGIN}/api_key`, `${PLUGIN}/last_folder`, `${PLUGIN}/connection`, `${PLUGIN}/undeclared`, "com.example.not-installed/default_service"]) {
    assert.throws(() => replica.authorizeKey!(key), forbidden, `an incoming ${key} is refused`);
  }
  assert.doesNotThrow(() => replica.authorizeKey!(`${PLUGIN}/default_service`));
}));

test("UPP-15 S-person-settings-private an incoming portable preference with an unknown field, too large, naming a path or looking like a credential is refused and nothing is kept", async () => withSettings(settings => {
  settings.set(person, owner, declarations, "default_service", { provider: "fal" });
  const installed = (pluginId: string) => pluginId === PLUGIN ? { install_id: INSTALL, declarations } : null;
  const replica = personSettingsConfigReplica(settings.db, "space-1", () => {}, installed);
  const mutation = replica.next();
  assert.ok(mutation?.value);
  const before = JSON.stringify(settings.list(person, INSTALL));
  const cases: Array<[string, (value: Record<string, unknown>) => void]> = [
    ["an unknown field", value => { value.foreign = "unrecognized"; }],
    ["a value past its limit", value => { (value.data as { value: unknown }).value = { provider: "x".repeat(1024 * 1024) }; }],
    ["a path on this machine", value => { (value.data as { value: unknown }).value = { provider: "/private/tmp/only-on-source" }; }],
    ["a value that looks like a credential", value => { (value.data as { value: unknown }).value = { provider: ["token", "dummy-payload-value"].join("=") }; }],
  ];
  for (const [index, [label, change]] of cases.entries()) {
    const value = structuredClone(mutation.value) as Record<string, unknown>;
    change(value);
    assert.throws(() => replica.receive({ ...mutation, value, revision: index + 2, operationId: `invalid-${index}` }), label);
    assert.equal(JSON.stringify(settings.list(person, INSTALL)), before, `${label}: nothing kept`);
    assert.equal(replica.counts().conflicts, 0, `${label}: not even held as a conflict`);
  }
  // The same event with a plain preference is taken: the refusals above are about the value, not the event.
  const plain = structuredClone(mutation.value) as Record<string, unknown>;
  (plain.data as { value: unknown }).value = { provider: "replicate" };
  replica.receive({ ...mutation, value: plain, revision: cases.length + 2, operationId: "plain" });
  assert.equal(replica.counts().conflicts, 1, "a plain preference meeting this device's unsent change is held as a conflict to choose");
}));
