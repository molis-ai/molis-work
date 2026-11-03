import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { PluginOwnerFilesClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantOwnerFiles, ownerFileActions, ownerFilesProbe } from "./fixtures/plugin-owner-files.js";

// specs/repository-anti-corruption/slices/pg022-manifest-declarations.md, P2b (统筹 10-24 裁 R1): a plugin may use its own files outside
// an action (in `start`, in a timer it set up there) when the installation's current grants cover `storage:private` and the file
// permission, as every other service decides there. Inside an action nothing changed (security-invariants-plugin-owner-files-lifecycle).

const text = (bytes: Uint8Array | null) => bytes === null ? null : Buffer.from(bytes).toString("utf8");

test("RAC-324 a plugin reads and writes its files in its own start and in a timer it set up there, while the installation's grants cover them", async t => {
  const probe = ownerFilesProbe(), fire = deferred(), timerDone = deferred();
  let timer: unknown;
  probe.behavior.start = async context => {
    if (!context.grants.includes(probe.write)) return;
    const files = context.services!.ownerFiles!;
    assert.equal(files.read("catalog.json"), null, "reading before anything was written finds nothing and creates nothing");
    await files.write(writer => writer.writeFile("catalog.json", Buffer.from("seeded in start"), "create"));
    assert.equal(text(files.read("catalog.json")), "seeded in start");
    void fire.promise.then(async () => {
      try { await files.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("written by the timer"))); timer = "wrote"; }
      catch (error) { timer = error; }
      finally { timerDone.resolve(); }
    });
  };
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const root = join(home, probe.owner_files.store_name);
  assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "seeded in start");
  fire.resolve(); await timerDone.promise;
  assert.equal(timer, "wrote"); assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "written by the timer");
});

test("RAC-325 outside an action the files are only what the Manifest declares: an undeclared entry, a path off the root or a link is refused and creates nothing", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const client = probe.client();
  for (const relative of ["outside.json", "../outside.json", "documents/../../outside.json", "/tmp/outside.json"]) {
    await assert.rejects(client.write(writer => writer.writeFile(relative, Buffer.from("refused"), "create")), { code: "host.owner_file_invalid" }, relative);
    assert.throws(() => client.read(relative), { code: "host.owner_file_invalid" }, relative);
  }
  assert.equal(existsSync(join(home, probe.owner_files.store_name, "outside.json")), false);
  assert.equal(existsSync(join(home, "outside.json")), false);
});

/** What a stopped activation's code gets from a client it kept (BL-411): the refusal throws nothing, so a read returns nothing and a write never settles. */
async function assertInert(stale: PluginOwnerFilesClient, file: string, expected: string) {
  assert.equal(stale.read("catalog.json"), undefined, "a read from a stopped activation returns nothing");
  assert.equal(stale.stat("catalog.json"), undefined);
  let settled = false;
  void Promise.resolve(stale.write(writer => writer.removeTree("catalog.json"))).then(() => { settled = true; }, () => { settled = true; });
  await new Promise<void>(resolve => setTimeout(resolve, 50));
  assert.equal(settled, false, "and a write from one never settles");
  assert.equal(readFileSync(file, "utf8"), expected, "and changes nothing");
}

for (const change of ["write-revoked", "read-revoked", "stopped", "uninstalled"] as const) {
  test(`RAC-326 outside an action, once the installation is ${change}, the plugin's files are refused: the grants at the time decide, not the ones it started with`, { timeout: 30_000 }, async t => {
    const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
    const { platform, install } = await grantOwnerFiles(host, probe), run = ownerFileActions(host, probe);
    await run.write(writer => writer.writeFile("catalog.json", Buffer.from("original"), "create"));
    const file = join(home, probe.owner_files.store_name, "catalog.json");
    const before = probe.client();
    assert.equal(text(before.read("catalog.json")), "original", "with the grants it started with, the plugin reads");
    await before.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("written outside an action")));
    const expected = "written outside an action", refused = { code: "actions.forbidden" };
    if (change === "stopped" || change === "uninstalled") {
      if (change === "uninstalled") await platform.runtime.uninstall(install.install_id, { retain_private_data: true });
      else await platform.runtime.stop(install.install_id);
      await assertInert(before, file, expected);
    } else {
      await platform.runtime.stop(install.install_id);
      platform.runtime.grant(install.install_id, probe.permissions.filter(permission => permission !== (change === "write-revoked" ? probe.write : probe.read)));
      await platform.supervisor.restart(probe.id);
      const client = probe.client();
      assert.notEqual(client, before, "a new start made a new client");
      if (change === "write-revoked") {
        assert.equal(text(client.read("catalog.json")), expected, "the read permission is still granted");
        await assert.rejects(client.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("must not be written"))), refused);
        await assert.rejects(client.write(writer => writer.mkdir("documents")), refused);
      } else {
        assert.throws(() => client.read("catalog.json"), refused);
        assert.throws(() => client.list("documents"), refused);
        assert.throws(() => client.rootPath(), refused);
      }
      await assertInert(before, file, expected);
    }
    assert.equal(existsSync(join(home, probe.owner_files.store_name, "documents")), false);
  });
}
