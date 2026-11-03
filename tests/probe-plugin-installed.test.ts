// W4-01, the installed half (specs/repository-anti-corruption/slices/w5-02-registry.md §6, RAC-792): the probe installed, not built in.
// Its package goes through the one install path a person has (ac-trust T2, S-84): `molis-work plugin install` to the Home's resident
// Host, a preview that writes nothing, then a confirmation that pins the publisher and installs. The installed probe is the probe's notes
// in the sandbox package format (a signed package has no routes, search or file sources, methods or undo of its own), and the test
// walks the steps the install path gives such a plugin: discover, invoke, keep its data across a Host restart. What the built-in half
// does beyond that, an installed plugin has no way to do today: a signed package is not upgraded, disabled, enabled or uninstalled by
// any entry a person has (BL-623). The test says so where the built-in half would take that step, so the gap shows when it closes.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { newPublisher, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { residentManagement } from "./fixtures/resident-management.js";

const PROBE_ID = "io.molis.work.probe";
/** Adding a note reads the notes first, so its operation declares reading the plugin's storage as well as writing it. */
function readsBeforeAdding(files: PackageFiles) {
  const contract = JSON.parse(files["contract.json"]!) as { operations: Array<{ id: string; effects: { storage: string[] } }> };
  for (const operation of contract.operations) if (operation.id === "notes.add") operation.effects.storage = ["read", "write"];
  files["contract.json"] = JSON.stringify(contract);
}
const mac = { skip: process.platform !== "darwin", timeout: 180_000 };
const launcher = fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url));
const run = promisify(execFile);
/** The command prints one JSON line; Node may print warnings before it. */
const json = (text: string) => JSON.parse(text.trim().split("\n").at(-1)!) as Record<string, unknown>;

test("RAC-792 W4-01 the probe installed from a signed package through the resident Host: preview, install, discover, invoke, restart", mac, async t => {
  const env = await residentManagement(t, { completeText: null });
  const caller = { actor_id: "owner", audience: "user" as const, permissions: [], project_id: env.project.project_id };
  const cli = (file: string, ...flags: string[]) => run(process.execPath, ["--import", "tsx", launcher, "plugin", "install", file, env.project.project_id, ...flags],
    { env: { ...process.env, MOLIS_WORK_HOME: env.home, MOLIS_WORK_WEB_URL: env.origin }, timeout: 60_000 }).then(
    ok => ({ code: 0, out: json(ok.stdout) }), (error: { code: number; stderr: string }) => ({ code: error.code, out: json(error.stderr) }));
  const records = (host: MolisWorkLocalHost = env.host) => host.withProject(env.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list()
    .filter((item: PluginInstanceRecord) => item.plugin_id === PROBE_ID).map(item => ({ trust: item.publisher_trust, state: item.state, version: item.version })));
  const publisher = newPublisher();
  const build = createHash("sha256").update(JSON.stringify([PROBE_ID, publisher.identity])).digest("hex").slice(0, 8);
  const action = (operation: string) => ({ capability_id: `generated.${build}.${operation}`, version: 1, provider_id: `plugin:${PROBE_ID}` });
  const discovered = async (host: MolisWorkLocalHost = env.host) => {
    await host.inspectActions(caller, env.reference);
    return (await host.actionClient(env.reference).discover(caller)).map(view => view.capability_id).filter(id => id.startsWith(`generated.${build}.`)).sort();
  };
  const file = join(env.home, "probe-package.json");
  await writeFile(file, JSON.stringify(signedPackage(publisher, readsBeforeAdding, { pluginId: PROBE_ID })));

  // Before it is installed: nothing of it to call, as the built-in half before it is enabled.
  assert.deepEqual(await discovered(), []);
  const preview = await cli(file);
  assert.equal(preview.code, 0, JSON.stringify(preview.out));
  assert.equal(preview.out.installed, false, "a preview installs nothing");
  assert.deepEqual([await records(), new HomeConsentLedger(env.home).publishers()], [[], []]);

  const installed = await cli(file, "--confirm", "--pin-as", "Probe publisher");
  assert.equal(installed.code, 0, JSON.stringify(installed.out));
  assert.deepEqual(installed.out.installed, { plugin_id: PROBE_ID, version: "1.0.0", publisher_key_id: publisher.identity });
  assert.deepEqual(await records(), [{ trust: "pinned", state: "running", version: "1.0.0" }],
    "running under the pin the person gave, where the built-in half runs with the Host build's trust");
  assert.deepEqual(await discovered(), [`generated.${build}.notes.add`, `generated.${build}.notes.list`]);
  const client = env.host.actionClient(env.reference);
  assert.equal(await client.invoke(caller, action("notes.add"), { text: "first probe note" }), true);
  assert.deepEqual(await client.invoke(caller, action("notes.list"), {}), [{ id: "1", text: "first probe note" }]);

  // The built-in half's upgrade comes with a newer build of its package; the install path takes no second package of an installed plugin.
  await writeFile(file, JSON.stringify(signedPackage(publisher, readsBeforeAdding, { pluginId: PROBE_ID, version: "1.1.0" })));
  const again = await cli(file, "--confirm");
  assert.equal(again.code, 1, "BL-623: no upgrade of a signed package through the install path");
  assert.deepEqual(await records(), [{ trust: "pinned", state: "running", version: "1.0.0" }], "the refused package changed nothing");

  // The resident Host restarts: the same installation runs again from its kept package, with its data.
  await env.stop();
  const restarted = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
  try {
    const found = await discovered(restarted);
    assert.deepEqual(await records(restarted), [{ trust: "pinned", state: "running", version: "1.0.0" }]);
    assert.deepEqual(found, [`generated.${build}.notes.add`, `generated.${build}.notes.list`]);
    assert.deepEqual(await restarted.actionClient(env.reference).invoke(caller, action("notes.list"), {}), [{ id: "1", text: "first probe note" }]);
  } finally { await restarted.close(); }
});
