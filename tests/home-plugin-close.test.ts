import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MolisWorkLocalHost, type HomePluginPlatform } from "@molis-ai/molis-work-app-local-host";
import { homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

type Probe = ReturnType<typeof homeProbe>;
type Visit = { probe: Probe; install: string };

/** The two probes' installations in the order the close visits them: `runtime.list()` is by install_id, a hash, so the order is read, never assumed. */
function inCloseOrder(platform: HomePluginPlatform, probes: readonly [Probe, Probe]): [Visit, Visit] {
  const visits: Visit[] = [];
  for (const record of platform.runtime.list()) {
    const probe = probes.find(candidate => candidate.id === record.plugin_id);
    if (probe) visits.push({ probe, install: record.install_id });
  }
  assert.equal(visits.length, 2, "both probes are installed");
  return [visits[0]!, visits[1]!];
}

/** Every `runtime.stop` asked of the platform from now on, with its options; the returned function keeps the calls for the given installations. */
function recordStops(platform: HomePluginPlatform) {
  const calls: Array<{ install: string; options: unknown }> = [];
  const stop = platform.runtime.stop.bind(platform.runtime);
  platform.runtime.stop = async (...args: Parameters<typeof stop>) => { calls.push({ install: args[0], options: args[1] }); return stop(...args); };
  return (...visits: Visit[]) => calls.filter(call => visits.some(visit => visit.install === call.install));
}

/** A stop that keeps the record enabled, as the close asks for. */
const kept = (visit: Visit) => ({ install: visit.install, options: { preserve_enabled: true } });

/** The state of each installation's record in the Runtime's table, read from the file after the close, as a restart would find it. */
function recordedStates(home: string, ...visits: Visit[]) {
  const db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"), { readOnly: true });
  try {
    // Only the rows asked for are parsed: a test may have left another one that cannot be.
    const row = db.prepare("SELECT record_json FROM plugin_runtime_installs WHERE install_id = ?");
    return visits.map(visit => {
      const found = row.get(visit.install) as { record_json: string } | undefined;
      return found ? (JSON.parse(found.record_json) as { state: string }).state : undefined;
    });
  } finally { db.close(); }
}

function assertRevoked(platform: HomePluginPlatform, ...visits: Visit[]) {
  for (const { probe } of visits) {
    assert.ok(!platform.supervisor.enabledPluginIds().includes(probe.id), `${probe.id} is revoked`);
    assert.equal(platform.supervisor.state(probe.id)?.code, "plugin.revoked");
  }
}

test("RAC-1825 closing the Home stops each running plugin once and keeps it enabled, revokes it, and a restart runs both", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const [first, second] = inCloseOrder(platform, [one, two]), stopsOf = recordStops(platform);
  await host.homePlugins!.close();
  assert.deepEqual(stopsOf(first, second), [first, second].map(kept), "each running record is stopped once, in record order, and kept enabled");
  assert.deepEqual(recordedStates(home, first, second), ["installed", "installed"], "both are recorded installed, which a restart runs");
  assertRevoked(platform, first, second);
  await host.close();
  // Another Host may open the Home only after this one has closed (W3-06-F-04 does the same).
  const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [one.definition, two.definition] } });
  try {
    await restarted.homePlugins!.ready();
    assert.deepEqual([one.id, two.id].map(id => restarted.homePlugins!.installation(id)?.state), ["running", "running"], "a close is not switching a plugin off");
  } finally { await restarted.close(); }
});

test("RAC-1826 closing the Home leaves a plugin the Runtime already shows as crashed as it is, stops the other, and revokes both", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const [first, second] = inCloseOrder(platform, [one, two]), stopsOf = recordStops(platform);
  await platform.runtime.reportCrash(first.install);
  assert.equal(platform.runtime.get(first.install).state, "crashed");
  await assert.doesNotReject(host.homePlugins!.close());
  assert.deepEqual(stopsOf(first, second), [kept(second)], "only the record still running is stopped");
  assert.deepEqual(recordedStates(home, first, second), ["crashed", "installed"], "the crash stays on its record");
  assertRevoked(platform, first, second);
});

test("RAC-1827 closing the Home does not fail for a plugin that the stop hook of the one before it crashed", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const [first, second] = inCloseOrder(platform, [one, two]), stopsOf = recordStops(platform);
  // The close read both records as running before it stopped the first; the second is crashed by the time it comes to it.
  first.probe.behavior.stop = async () => { await platform.runtime.reportCrash(second.install); };
  await assert.doesNotReject(host.homePlugins!.close());
  assert.deepEqual(stopsOf(first, second), [kept(first)], "the record the first one's hook crashed is not stopped");
  assert.deepEqual(recordedStates(home, first, second), ["installed", "crashed"], "the crash stays on its record");
  assertRevoked(platform, first, second);
});

test("RAC-1828 closing the Home does not fail for a plugin that the stop hook of the one before it already stopped", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const [first, second] = inCloseOrder(platform, [one, two]), stopsOf = recordStops(platform);
  // The hook stops the second the way the close does; the close then finds it installed, which the Runtime refuses to stop for a shutdown.
  first.probe.behavior.stop = async () => { await platform.runtime.stop(second.install, { preserve_enabled: true }); };
  await assert.doesNotReject(host.homePlugins!.close());
  assert.deepEqual(stopsOf(first, second), [kept(first), kept(second)], "the close stops the first; the second was stopped by that hook, and is not stopped again");
  assert.deepEqual(recordedStates(home, first, second), ["installed", "installed"], "both are kept enabled");
  assertRevoked(platform, first, second);
});

/** The Home's Runtime table, opened for writing by the test to put it in the state a test needs. */
function editRecords<T>(home: string, edit: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"));
  try { return edit(db); } finally { db.close(); }
}

// RAC-2180 T-227: the Home has no plugin list of its own, and its close used to begin with one `runtime.list()`, which parses every stored row:
// one it cannot parse ended the close before any plugin was stopped. Now the installation the Supervisor runs is read on its own.
test("RAC-2180 one record the Runtime cannot parse does not keep the other Home plugin from closing, and the close still fails as a Home plugin close", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const [broken, other] = inCloseOrder(platform, [one, two]), stopsOf = recordStops(platform);
  editRecords(home, db => db.prepare("UPDATE plugin_runtime_installs SET record_json = '{' WHERE install_id = ?").run(broken.install));
  await assert.rejects(host.homePlugins!.close(), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /Home 插件关闭失败/);
    // Both are about the one record: reading it to stop its installation, and reading the list it is in.
    assert.equal(error.errors.length, 2, "one failure for that installation, one for the list; none for the other plugin");
    assert.ok(error.errors.every(item => item instanceof SyntaxError));
    return true;
  });
  assert.deepEqual(stopsOf(broken, other), [kept(other)], "the other plugin is stopped once and kept enabled; the unreadable one is not stopped");
  assert.deepEqual(recordedStates(home, other), ["installed"]);
  assertRevoked(platform, broken, other);
});

// RAC-2181 T-227: a plugin can have two records (a package uninstalled, then installed again under another signature). Revoking it on the
// older record, while the Supervisor still runs the other one, had the Supervisor stop that one as switched off.
test("RAC-2181 a Home plugin with an older uninstalled record is still stopped kept enabled, and its revoke stops nothing", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const [first, current] = inCloseOrder(platform, [one, two]);
  const older: Visit = { probe: current.probe, install: `0-${current.install}` };
  assert.ok(older.install < current.install, "the older record comes first in the Runtime's order");
  editRecords(home, db => {
    const record = JSON.parse((db.prepare("SELECT record_json FROM plugin_runtime_installs WHERE install_id = ?").get(current.install) as { record_json: string }).record_json);
    db.prepare("INSERT INTO plugin_runtime_installs (install_id, record_json, publisher_trust) VALUES (?, ?, ?)")
      .run(older.install, JSON.stringify({ ...record, install_id: older.install, state: "uninstalled", publisher_signature: "home-closetwo-before" }), record.publisher_trust);
  });
  assert.deepEqual(platform.runtime.list().filter(record => record.plugin_id === two.id).map(record => record.install_id), [older.install, current.install]);
  const stopsOf = recordStops(platform);
  await assert.doesNotReject(host.homePlugins!.close());
  // The older record now comes first, so the second probe may be closed first: which order is the Runtime's, and is not what this asserts.
  const byInstall = (left: { install: string }, right: { install: string }) => left.install.localeCompare(right.install);
  assert.deepEqual(stopsOf(first, older, current).sort(byInstall), [kept(first), kept(current)].sort(byInstall), "only the running installations are stopped, each once and kept enabled");
  assert.deepEqual(recordedStates(home, first, older, current), ["installed", "uninstalled", "installed"], "the running one is still enabled; the older one stays uninstalled");
  assertRevoked(platform, first, current);
});

// RAC-2182 T-227: a record that is gone by the time the close comes to it is still stopped (T-124, closePlugin), and that stop's failure is
// thrown with the others as the Home's close failure.
test("RAC-2182 a Home plugin whose record goes during the close is still let go, and the close fails as a Home plugin close", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const [first, gone] = inCloseOrder(platform, [one, two]), stopsOf = recordStops(platform);
  first.probe.behavior.stop = async () => { editRecords(home, db => db.prepare("DELETE FROM plugin_runtime_installs WHERE install_id = ?").run(gone.install)); };
  await assert.rejects(host.homePlugins!.close(), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /Home 插件关闭失败/);
    assert.deepEqual(error.errors.map(item => (item as { code?: unknown }).code), ["plugin.definition_missing"], "the one failure is the missing record");
    return true;
  });
  assert.deepEqual(stopsOf(first, gone), [kept(first), kept(gone)], "the one whose record is gone is stopped all the same");
  assert.deepEqual(recordedStates(home, first, gone), ["installed", undefined]);
  assert.equal(platform.runtime.contribution(gone.install), null, "its instance is let go");
  assertRevoked(platform, first, gone);
});

/** An event type no Manifest declares. An upgrade to a definition that carries it fails before the Runtime is asked anything. */
const undeclaredEvent = { event_type_id: "closeprobe.undeclared", type_version: 1, validate: (payload: unknown) => payload };

// RAC-2050 T-227b: an upgrade that fails before the Runtime is asked anything leaves the Supervisor counting the plugin as failed, with the
// installation the Runtime still runs. When `list()` cannot be read, that installation was not stopped kept enabled, and the revoke stopped it
// as switched off. Now the close stops the installation the Supervisor holds, whatever it counts it as, as its revoke would have.
test("RAC-2050 a Home plugin the Supervisor counts as failed while the Runtime still runs it stays enabled when the list cannot be read", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const visits = inCloseOrder(platform, [one, two]);
  const failed = visits.find(visit => visit.probe === one)!, broken = visits.find(visit => visit.probe === two)!;
  const upgraded = await platform.supervisor.upgrade(one.id, { ...one.definition, event_types: [undeclaredEvent] });
  assert.deepEqual([upgraded.status, upgraded.install_id, upgraded.code], ["failed", failed.install, "plugin.event_type_undeclared"]);
  assert.equal(platform.runtime.get(failed.install).state, "running", "the Runtime still runs it");
  assert.ok(platform.supervisor.enabledPluginIds().includes(one.id), "and it is still enabled");
  editRecords(home, db => db.prepare("UPDATE plugin_runtime_installs SET record_json = '{' WHERE install_id = ?").run(broken.install));
  const stopsOf = recordStops(platform);
  await assert.rejects(host.homePlugins!.close(), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /Home 插件关闭失败/);
    // As in RAC-2180, both are about the record that cannot be read: reading it to stop its installation, and reading the list it is in.
    assert.equal(error.errors.length, 2, "none for the plugin the Supervisor counts as failed");
    assert.ok(error.errors.every(item => item instanceof SyntaxError));
    return true;
  });
  assert.deepEqual(stopsOf(failed), [kept(failed)], "the installation the Supervisor holds is stopped once and kept enabled");
  assert.deepEqual(recordedStates(home, failed), ["installed"], "which a restart runs");
  assertRevoked(platform, failed, broken);
});

// RAC-2407 T-172 review / T-275: the list reads fine, but stopping one installation cannot read its record. The failure is one of the
// aggregate the Home close throws, the other installation still stops kept enabled, and both plugins are revoked. RAC-2180 covers the
// list itself being unreadable; here only that one record is, read when the close stops it.
test("RAC-2407 a Home close that cannot read one installation's record still throws it, stops the other kept enabled, and revokes both", { timeout: 60_000 }, async t => {
  const one = homeProbe("closeone"), two = homeProbe("closetwo");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  const platform = await host.homePlugins!.ready();
  const [broken, other] = inCloseOrder(platform, [one, two]), stopsOf = recordStops(platform);
  // Read the records as the close does, then make the one it will stop unreadable before it gets to it: the list is readable, that record is not.
  const list = platform.runtime.list.bind(platform.runtime);
  platform.runtime.list = () => {
    const records = list();
    editRecords(home, db => db.prepare("UPDATE plugin_runtime_installs SET record_json = '{' WHERE install_id = ?").run(broken.install));
    return records;
  };
  try {
    await assert.rejects(host.homePlugins!.close(), error => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /Home 插件关闭失败/);
      assert.equal(error.errors.length, 1, "one failure: the record read when the close stops that installation; the list itself was read");
      assert.ok(error.errors.every(item => item instanceof SyntaxError));
      return true;
    });
  } finally { platform.runtime.list = list; }
  assert.deepEqual(stopsOf(broken, other), [kept(other)], "the other plugin is stopped once and kept enabled; the unreadable one is not stopped");
  assert.deepEqual(recordedStates(home, other), ["installed"]);
  assertRevoked(platform, broken, other);
});
