import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";

import { ActionError, bindActionClient, defineErrorCodes, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { SettingLayers, SettingSource, SettingsDeclaration, SettingsWriteInput } from "@molis-ai/molis-work-contracts/platform/settings";
import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  bindSettingsHandlers, defineSettingsActions, type SettingSnapshot, type SettingsOwner, type SettingsOwnerScope,
  type SettingsRequestIdentity, type SettingsWriteReceipt,
} from "@molis-ai/molis-work-plugin-sdk";

const key = "fixture.budget", unavailableKey = "fixture.unavailable";
const ownerErrors = defineErrorCodes("settings_fixture", { setting_conflict: "conflict", setting_invalid: "invalid" });
const caller: ActionCallContext = { actor_id: "person", project_id: "project-a", audience: "user", permissions: [] };
const options = (capability_id: string) => ({ capability_id, version: 1, title: "Fixture settings", description: "Read or write owner settings", permissions: [] });
const read = options("fixture.settings.read"), write = options("fixture.settings.write");
const declaration: SettingsDeclaration = {
  read: { capability_id: read.capability_id, version: read.version },
  write: { capability_id: write.capability_id, version: write.version },
  entries: [
    { key, title: { key: "fixture.settings.budget" }, layers: ["project", "personal"], schema: {
      type: "object", properties: { cap: { type: "integer", minimum: 0 }, enabled: { type: "boolean" } },
      required: ["cap", "enabled"], additionalProperties: false,
    } },
    { key: unavailableKey, title: { key: "fixture.settings.unavailable" }, layers: ["personal"], schema: { type: "boolean" } },
  ],
};
const budget = (cap: number) => ({ cap, enabled: false });

function request(revision: string, request_id: string, change: SettingsWriteInput["change"], layer: SettingsWriteInput["layer"] = "project"): SettingsWriteInput {
  return { key, layer, expected_revision: revision, request_id, change };
}

function temporaryStore(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "settings-owner-")), file = join(directory, "settings.sqlite");
  const connections = new Set<DatabaseSync>();
  t.after(() => { for (const connection of connections) connection.close(); rmSync(directory, { recursive: true, force: true }); });
  return (ownerId = "fixture-install") => {
    const db = new DatabaseSync(file);
    connections.add(db);
    db.exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS fixture_layers (
        owner TEXT, actor TEXT, project TEXT, key TEXT, layer TEXT, value TEXT, revision INTEGER NOT NULL,
        PRIMARY KEY (owner, actor, project, key, layer)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS fixture_receipts (
        owner TEXT, actor TEXT, project TEXT, key TEXT, layer TEXT, request_id TEXT, request TEXT NOT NULL, result TEXT NOT NULL,
        PRIMARY KEY (owner, actor, project, key, layer, request_id)
      ) STRICT;`);
    return { db, owner: sqliteOwner(db, ownerId), close: () => { if (connections.delete(db)) db.close(); } };
  };
}

function sqliteOwner(db: DatabaseSync, owner_id: string): SettingsOwner {
  const readLayer = db.prepare("SELECT value, revision FROM fixture_layers WHERE owner=? AND actor=? AND project=? AND key=? AND layer=?");
  const writeLayer = db.prepare(`INSERT INTO fixture_layers (owner, actor, project, key, layer, value, revision) VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT (owner, actor, project, key, layer) DO UPDATE SET value=excluded.value, revision=revision+1`);
  const readReceipt = db.prepare("SELECT request, result FROM fixture_receipts WHERE owner=? AND actor=? AND project=? AND key=? AND layer=? AND request_id=?");
  const saveReceipt = db.prepare("INSERT INTO fixture_receipts (owner, actor, project, key, layer, request_id, request, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const layerRow = (scope: SettingsOwnerScope, setting: string, layer: SettingSource) => {
    const actor = layer === "provider_default" ? "" : scope.actor_id;
    const project = layer === "project" ? scope.project_id ?? "" : "";
    return readLayer.get(scope.owner_id, actor, project, setting, layer) as { value: string | null; revision: number } | undefined;
  };
  const snapshot = (scope: SettingsOwnerScope, setting: string): SettingSnapshot => {
    const project = scope.project_id === null ? undefined : layerRow(scope, setting, "project");
    const personal = layerRow(scope, setting, "personal"), fallback = layerRow(scope, setting, "provider_default");
    const revision = JSON.stringify([project?.revision ?? 0, personal?.revision ?? 0, fallback?.revision ?? 0]);
    if (setting === unavailableKey) return { key: setting, revision, state: "unavailable", reason: "Owner has not set this up" };
    const layers: SettingLayers = { provider_default: fallback?.value == null ? budget(2) : JSON.parse(fallback.value) as SandboxJson };
    if (project?.value != null) layers.project = JSON.parse(project.value) as SandboxJson;
    if (personal?.value != null) layers.personal = JSON.parse(personal.value) as SandboxJson;
    return { key: setting, revision, state: "ok", layers };
  };
  const receiptKey = (scope: SettingsOwnerScope, identity: SettingsRequestIdentity) => [
    scope.owner_id, scope.actor_id, scope.project_id ?? "", identity.key, identity.layer, identity.request_id,
  ] as const;
  return {
    owner_id, errors: ownerErrors,
    read: (scope, keys) => keys.map(setting => snapshot(scope, setting)),
    transaction(scope, run) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = run({
          readReceipt(identity) {
            const row = readReceipt.get(...receiptKey(scope, identity)) as { request: string; result: string } | undefined;
            return row && { request: JSON.parse(row.request) as SettingsWriteInput, result: JSON.parse(row.result) as SettingsWriteReceipt["result"] };
          },
          readCurrent: setting => snapshot(scope, setting),
          writeChange(input) {
            const value = "set" in input.change ? input.change.set : undefined;
            if (value && typeof value === "object" && !Array.isArray(value) && typeof value.cap === "number" && value.cap > 10) {
              throw ownerErrors.setting_invalid("Owner limit is 10");
            }
            writeLayer.run(scope.owner_id, scope.actor_id, input.layer === "project" ? scope.project_id : "", input.key, input.layer, value === undefined ? null : JSON.stringify(value));
          },
          saveReceipt(identity, receipt) { saveReceipt.run(...receiptKey(scope, identity), JSON.stringify(receipt.request), JSON.stringify(receipt.result)); },
        });
        db.exec("COMMIT");
        return result;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}

function settings(owner: SettingsOwner, effects?: ConstructorParameters<typeof ActionService>[1], scope: "home" | "project" = "project") {
  const actions = defineSettingsActions({ scope, read, write });
  const handlers = bindSettingsHandlers(actions, declaration, owner);
  const service = new ActionService(undefined, effects);
  service.registerProvider({ provider: { provider_id: owner.owner_id, title: "Settings owner", kind: "system" },
    definitions: [actions.read, actions.write], handlers: [handlers.read, handlers.write] });
  return {
    service, actions,
    read: async (context: ActionCallContext = caller, setting = key) => (await bindActionClient(service, () => context).invoke(actions.read, { keys: [setting] })).values[0]!,
    write: (input: SettingsWriteInput, context: ActionCallContext = caller) => bindActionClient(service, () => context).invoke(actions.write, input),
  };
}

function persisted(db: DatabaseSync) {
  return {
    layers: db.prepare("SELECT * FROM fixture_layers ORDER BY owner, actor, project, key, layer").all(),
    receipts: db.prepare("SELECT * FROM fixture_receipts ORDER BY owner, actor, project, key, layer, request_id").all(),
  };
}

test("SPC-C01: ActionService rejects forged scope, non-user writes, illegal layers and values", async t => {
  const store = temporaryStore(t)(), api = settings(store.owner);
  const before = await api.read(), input = request(before.revision, "write", { set: budget(4) });
  await assert.rejects(api.service.invoke(caller, api.actions.write, { ...input, actor_id: "someone-else", project_id: "project-b" }), { code: "actions.input_invalid" });
  for (const audience of ["agent", "plugin", "workflow", "mcp"] as const) {
    await assert.rejects(api.write(input, { ...caller, audience }), { code: "actions.forbidden" });
  }
  for (const audience of ["agent", "plugin"] as const) assert.deepEqual(await api.read({ ...caller, audience }), before);
  await assert.rejects(api.write({ ...input, key: unavailableKey }), { code: "settings_fixture.setting_invalid" });
  await assert.rejects(api.write({ ...input, change: { set: { cap: 4, enabled: "yes" } } }), { code: "settings_fixture.setting_invalid" });
  await assert.rejects(api.write({ ...input, change: { set: budget(11) } }), { code: "settings_fixture.setting_invalid", message: "Owner limit is 10" });
  const home = settings(store.owner, undefined, "home");
  await assert.rejects(home.write(input, { ...caller, project_id: null }), { code: "settings_fixture.setting_invalid", message: /项目上下文/u });
  assert.deepEqual(await api.read(caller, unavailableKey), { key: unavailableKey, revision: before.revision, state: "unavailable", reason: "Owner has not set this up" });
  assert.deepEqual(persisted(store.db), { layers: [], receipts: [] });
});

test("SPC-C02: two SQLite connections with the same observed revision cannot both commit", async t => {
  const open = temporaryStore(t), left = open(), right = open();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const slow = settings(left.owner, { beforeEffect: async () => { entered.resolve(); await release.promise; } });
  const fast = settings(right.owner);
  const old = (await slow.read()).revision;
  assert.equal((await fast.read()).revision, old);
  const losingInput = request(old, "slow", { set: budget(4) });
  const pending = slow.write(losingInput);
  const rejected = assert.rejects(pending, { code: "settings_fixture.setting_conflict" });
  try {
    await Promise.race([entered.promise, pending]);
    const winner = await fast.write(request(old, "fast", { set: budget(5) }));
    losingInput.expected_revision = winner.values[0]!.revision;
    release.resolve();
    await rejected;
    assert.deepEqual(await slow.read(), winner.values[0]);
    const state = persisted(left.db);
    assert.equal(state.layers.length, 1);
    assert.deepEqual(state.receipts.map(row => row.request_id), ["fast"]);
  } finally { release.resolve(); }
});

test("SPC-C01/C02: writes observe all layers, and inherit reads the next value in the same transaction", async t => {
  const store = temporaryStore(t)(), api = settings(store.owner);
  const initial = (await api.read()).revision;
  const personal = (await api.write(request(initial, "personal", { set: budget(3) }, "personal"))).values[0]!;
  const project = (await api.write(request(personal.revision, "project", { set: budget(4) }))).values[0]!;
  const change = (await api.write(request(project.revision, "personal-new", { set: budget(5) }, "personal"))).values[0]!;
  const restored = (await api.write(request(change.revision, "personal-back", { set: budget(3) }, "personal"))).values[0]!;
  assert.deepEqual(restored, { ...project, revision: restored.revision });
  assert.notEqual(restored.revision, project.revision);
  await assert.rejects(api.write(request(project.revision, "stale", { inherit: true })), { code: "settings_fixture.setting_conflict" });
  const inherited = (await api.write(request(restored.revision, "inherit-project", { inherit: true }))).values[0]!;
  assert.equal(inherited.state === "ok" && inherited.source, "personal");
  assert.deepEqual(inherited.state === "ok" && inherited.value, budget(3));
  const fallback = (await api.write(request(inherited.revision, "inherit-personal", { inherit: true }, "personal"))).values[0]!;
  assert.equal(fallback.state === "ok" && fallback.source, "provider_default");
  assert.deepEqual(fallback.state === "ok" && fallback.value, budget(2));
  assert.deepEqual(await api.read(), fallback);
  store.db.prepare("INSERT INTO fixture_layers VALUES (?, '', '', ?, 'provider_default', ?, 1)").run(store.owner.owner_id, key, JSON.stringify(budget(2)));
  await assert.rejects(api.write(request(fallback.revision, "stale-default", { set: budget(5) })), { code: "settings_fixture.setting_conflict" });
});

test("SPC-C02: replay returns the original result after another write and after closing and reopening the owner", async t => {
  const open = temporaryStore(t), first = open();
  const api = settings({ ...first.owner, transaction: (scope, run) => first.owner.transaction(scope, tx => run({
    ...tx,
    writeChange(input) {
      tx.writeChange(input);
      const value = "set" in input.change ? input.change.set : null;
      // An owner may reuse the value it received while preparing its own storage representation.
      if (value && typeof value === "object" && !Array.isArray(value)) value.cap = 0;
    },
  })) });
  const original = request((await api.read()).revision, "first", { set: budget(4) });
  const receipt = await api.write(original);
  const current = (await api.write(request(receipt.values[0]!.revision, "second", { set: budget(5) }))).values[0]!;
  const before = persisted(first.db);
  const reordered = { ...original, change: { set: { enabled: false, cap: 4 } } };
  assert.deepEqual(await api.write(reordered), receipt);
  await assert.rejects(api.write({ ...original, change: { set: budget(6) } }), { code: "settings_fixture.setting_conflict", message: /request_id/u });
  first.close();
  const reopened = open(), live = settings(reopened.owner);
  assert.deepEqual(await live.write(reordered), receipt);
  assert.deepEqual(await live.read(), current);
  assert.deepEqual(persisted(reopened.db), before);
});

test("SPC-C02: the same request ID cannot read a receipt across owners, actors, projects or layers", async t => {
  const open = temporaryStore(t), first = open(), second = open("other-install");
  const api = settings(first.owner), other = settings(second.owner);
  const differentActor = { ...caller, actor_id: "another-person" }, differentProject = { ...caller, project_id: "project-b" };
  await api.write(request((await api.read()).revision, "same", { set: budget(3) }));
  await api.write(request((await api.read(differentActor)).revision, "same", { set: budget(4) }), differentActor);
  await api.write(request((await api.read(differentProject)).revision, "same", { set: budget(5) }), differentProject);
  await api.write(request((await api.read()).revision, "same", { set: budget(6) }, "personal"));
  await other.write(request((await other.read()).revision, "same", { set: budget(7) }));
  assert.equal(persisted(first.db).receipts.length, 5);
  const own = await api.read(), actor = await api.read(differentActor), project = await api.read(differentProject), foreign = await other.read();
  assert.deepEqual(own.state === "ok" && own.layers, { project: budget(3), personal: budget(6), provider_default: budget(2) });
  assert.deepEqual(actor.state === "ok" && actor.value, budget(4));
  assert.deepEqual(project.state === "ok" && project.value, budget(5));
  assert.deepEqual(foreign.state === "ok" && foreign.value, budget(7));
});

test("SPC-C02: failed receipt insertion and failed readback roll back values, revisions and receipts", async t => {
  const store = temporaryStore(t)(), api = settings(store.owner);
  const before = await api.read();
  const input = request(before.revision, "retry", { set: budget(4) });
  store.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON fixture_receipts BEGIN SELECT RAISE(ABORT, 'receipt refused'); END");
  await assert.rejects(api.write(input), /receipt refused/u);
  assert.deepEqual(await api.read(), before);
  assert.deepEqual(persisted(store.db), { layers: [], receipts: [] });
  store.db.exec(`DROP TRIGGER fail_receipt;
    CREATE TRIGGER fail_readback AFTER INSERT ON fixture_layers BEGIN UPDATE fixture_layers SET value='invalid-json' WHERE rowid=NEW.rowid; END;`);
  await assert.rejects(api.write(input), SyntaxError);
  assert.deepEqual(await api.read(), before);
  assert.deepEqual(persisted(store.db), { layers: [], receipts: [] });
  store.db.exec("DROP TRIGGER fail_readback");
  const result = await api.write(input);
  assert.deepEqual(await api.read(), result.values[0]);
  assert.equal(persisted(store.db).receipts.length, 1);
});

test("SPC-C02: revocation after the dispatcher effect check stops both new writes and replay", async t => {
  const store = temporaryStore(t)(), live = settings(store.owner);
  const original = request((await live.read()).revision, "saved", { set: budget(4) });
  const saved = await live.write(original), before = persisted(store.db);
  for (const input of [request(saved.values[0]!.revision, "new", { set: budget(5) }), original]) {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let armed = false, revoked = false, scheduled = false;
    const api = settings(store.owner, { beforeEffect: async () => { entered.resolve(); await release.promise; armed = true; } });
    const pending = api.write(input, { ...caller, assert_authority_current() {
      if (revoked) throw new ActionError("actions.forbidden", "Owner grant revoked");
      if (armed && !scheduled) { scheduled = true; queueMicrotask(() => { revoked = true; }); }
    } });
    const rejected = assert.rejects(pending, { code: "actions.forbidden", message: "Owner grant revoked" });
    try {
      await Promise.race([entered.promise, pending]);
      release.resolve();
      await rejected;
      assert.equal(revoked, true);
      assert.deepEqual(persisted(store.db), before);
      assert.deepEqual(await live.read(), saved.values[0]);
    } finally { release.resolve(); }
  }
});
