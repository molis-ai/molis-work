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
    const rows = db.prepare("SELECT record_json FROM plugin_runtime_installs").all().map(row => JSON.parse((row as { record_json: string }).record_json) as { install_id: string; state: string });
    return visits.map(visit => rows.find(row => row.install_id === visit.install)?.state);
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
