import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantOwnerFiles, ownerFileActions, ownerFilesProbe } from "./fixtures/plugin-owner-files.js";

test("SHF-IO-S04 wrong action operation, missing declared/caller permission and another installation cannot use this client", async t => {
  const probe = ownerFilesProbe(), other = ownerFilesProbe("foreignowner");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry(), other.entry()] } });
  await grantOwnerFiles(host, probe); await grantOwnerFiles(host, other);
  const client = probe.client(), actions = host.homeActionClient();
  for (const action of [probe.queryWrite, probe.undeclared]) await assert.rejects(actions.invoke(probe.caller(), action, {}), { code: "actions.forbidden" });
  await assert.rejects(actions.invoke({ ...probe.caller(), permissions: [probe.read] }, probe.writeAction, {}), { code: "actions.forbidden" });
  other.behavior.write = () => client.write(writer => writer.mkdir("documents"));
  other.behavior.read = () => client.list("documents");
  await assert.rejects(actions.invoke(other.caller(), other.writeAction, {}), { code: "actions.forbidden" });
  await assert.rejects(actions.invoke(other.caller(), other.readAction, {}), { code: "actions.forbidden" });
  assert.equal(existsSync(join(home, probe.owner_files.store_name)), false);
});

test("SHF-IO-S05 writer return, throw, microtask, later valid action and expired inherited ALS never extend authority", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const run = ownerFileActions(host, probe), unhandled: unknown[] = [], escaped: PluginOwnerFilesWriter[] = [];
  const observe = (error: unknown) => unhandled.push(error); process.on("unhandledRejection", observe); t.after(() => { process.off("unhandledRejection", observe); });
  await run.write(writer => { escaped.push(writer); writer.writeFile("catalog.json", Buffer.from("original"), "create"); });
  assert.throws(() => escaped[0]!.removeTree("catalog.json"), { code: "actions.expired" });
  await assert.rejects(run.write(() => escaped[0]!.removeTree("catalog.json")), { code: "actions.expired" });
  const expected = new Error("callback failure");
  await assert.rejects(run.write(writer => { escaped.push(writer); throw expected; }), error => error === expected);
  assert.throws(() => escaped[1]!.removeTree("catalog.json"), { code: "actions.expired" });
  const release = deferred(), finished = deferred(); let late: unknown;
  try {
    await assert.rejects(run.write(async writer => {
      writer.writeFile("documents/legal", Buffer.from("before promise"), "create");
      await release.promise;
      try { writer.removeTree("catalog.json"); } catch (error) { late = error; throw error; } finally { finished.resolve(); }
    }), { code: "actions.async_required" });
  } finally { release.resolve(); }
  await finished.promise; await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(late instanceof ActionError); assert.equal(late.code, "actions.expired"); assert.deepEqual(unhandled, []);
  const fire = deferred(), timerFinished = deferred(); let afterAction: unknown;
  probe.behavior.read = client => {
    void fire.promise.then(() => { try { client.read("catalog.json"); } catch (error) { afterAction = error; } finally { timerFinished.resolve(); } });
    return "scheduled";
  };
  assert.equal(await host.homeActionClient().invoke(probe.caller(), probe.readAction, {}), "scheduled");
  fire.resolve(); await timerFinished.promise;
  assert.ok(afterAction instanceof ActionError); assert.equal(afterAction.code, "actions.expired");
  assert.equal(readFileSync(join(home, probe.owner_files.store_name, "catalog.json"), "utf8"), "original");
  assert.equal(readFileSync(join(home, probe.owner_files.store_name, "documents/legal"), "utf8"), "before promise");
});

test("SHF-IO-S04 every writer primitive rechecks the original signal inside a synchronous callback", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  await grantOwnerFiles(host, probe);
  const abort = new AbortController(); let checked = false;
  probe.behavior.write = client => client.write(writer => {
    writer.writeFile("catalog.json", Buffer.from("legal prefix"), "create");
    abort.abort();
    for (const operation of [() => writer.read("catalog.json"), () => writer.writeFile("documents/late", Buffer.from("bad"), "create"),
      () => writer.setAccess("catalog.json", "readonly"), () => writer.removeTree("catalog.json")]) assert.throws(operation);
    checked = true;
  });
  // The gateway may also reject the now-cancelled command; its callback's own assertions must still have run.
  await host.homeActionClient().invoke({ ...probe.caller(), signal: abort.signal }, probe.writeAction, {}).catch(error => { assert.equal(abort.signal.aborted, true); assert.ok(error); });
  assert.equal(checked, true);
  const root = join(home, probe.owner_files.store_name);
  assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "legal prefix");
  assert.equal(statSync(join(root, "catalog.json")).mode & 0o777, 0o600); assert.equal(existsSync(join(root, "documents")), false);
});

for (const invalidation of ["cancel", "caller-revoke", "stop", "revoke", "reinstall"] as const) {
  test(`SHF-IO-S04 SHF-IO-S05 ${invalidation} inside the original beforeEffect barrier prevents create/update/delete/chmod and never revives an old client`, { timeout: 30_000 }, async t => {
    const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
    const { platform, install } = await grantOwnerFiles(host, probe), run = ownerFileActions(host, probe);
    await run.write(writer => writer.writeFile("catalog.json", Buffer.from("original"), "create"));
    const old = probe.client(), entered = deferred(), release = deferred(), abort = new AbortController();
    let started = false, paused = false, allowed = true, committed = false;
    probe.behavior.write = client => {
      started = true;
      return client.write(writer => {
        committed = true; writer.writeFile("documents/late", Buffer.from("bad"), "create");
        writer.writeFile("catalog.json", Buffer.from("bad"), "replace"); writer.setAccess("catalog.json", "readonly"); writer.removeTree("catalog.json");
      });
    };
    const pending = host.homeActionClient().invoke({ ...probe.caller(), signal: abort.signal,
      validate_authority: async () => { if (started && !paused) { paused = true; entered.resolve(); await release.promise; } },
      assert_authority_current: () => { if (!allowed) throw new ActionError("actions.forbidden", "caller revoked"); },
    }, probe.writeAction, {});
    const refused = assert.rejects(pending);
    try {
      await entered.promise;
      if (invalidation === "cancel") abort.abort();
      else if (invalidation === "caller-revoke") allowed = false;
      else {
        await platform.runtime.stop(install.install_id);
        if (invalidation === "revoke") platform.runtime.grant(install.install_id, ["storage:private", probe.read]);
        if (invalidation === "reinstall") {
          await platform.runtime.uninstall(install.install_id, { retain_private_data: true });
          const installed = platform.runtime.install({ definition: probe.definition, deployment: "local", grants: probe.permissions });
          assert.notEqual(installed.install.installation_generation, install.installation_generation);
          await platform.runtime.start(install.install_id);
        }
      }
    } finally { release.resolve(); }
    await refused;
    const root = join(home, probe.owner_files.store_name);
    assert.equal(committed, false); assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "original");
    assert.equal(statSync(join(root, "catalog.json")).mode & 0o777, 0o600); assert.equal(existsSync(join(root, "documents")), false);
    if (["stop", "revoke"].includes(invalidation)) { platform.runtime.grant(install.install_id, probe.permissions); await platform.supervisor.restart(probe.id); }
    if (!["cancel", "caller-revoke"].includes(invalidation)) {
      probe.behavior.write = () => old.write(writer => writer.removeTree("catalog.json"));
      await assert.rejects(host.homeActionClient().invoke(probe.caller(), probe.writeAction, {}));
    }
    await run.write(writer => writer.writeFile("catalog.json", Buffer.from("new action"), "replace"));
    assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), "new action");
  });
}

test("SHF-IO-S02 SHF-IO-S07 RAC-307 stop callback loses file authority and upgrade cannot inherit a declaration by plugin id", async t => {
  const probe = ownerFilesProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.entry()] } });
  const { platform, install } = await grantOwnerFiles(host, probe), run = ownerFileActions(host, probe);
  await run.write(writer => writer.writeFile("catalog.json", Buffer.from("keep"), "create"));
  let stopChecked = false;
  probe.behavior.stop = async context => {
    await assert.rejects(context.services!.ownerFiles!.write(writer => writer.removeTree("catalog.json")));
    stopChecked = true;
  };
  // A different definition under the same plugin_id is not on the Host's list: one that declares the files in its own Manifest is refused,
  // not started without them (RAC-307), and the plugin it would have replaced keeps running.
  const replacement = ownerFilesProbe("ownerprobe", "home", "1.1.0");
  await assert.rejects(platform.runtime.upgrade({ install_id: install.install_id, definition: replacement.definition, grants: replacement.permissions }), /启动失败/u);
  assert.equal(stopChecked, true);
  assert.equal(replacement.contexts.length, 0, "its code never ran, so it read and wrote nothing");
  assert.equal(platform.runtime.get(install.install_id).version, "1.0.0");
  // One that declares none starts, and has no files service: nothing is inherited from the plugin it replaces.
  const plain = ownerFilesProbe("ownerprobe", "home", "1.2.0");
  await platform.runtime.upgrade({ install_id: install.install_id, definition: plain.withoutFiles(), grants: plain.permissions });
  assert.equal(plain.preflight[0]!.services?.ownerFiles, undefined);
  assert.equal(plain.contexts.at(-1)!.services?.ownerFiles, undefined, "a different same-id definition has no trusted binding");
  assert.equal(readFileSync(join(home, probe.owner_files.store_name, "catalog.json"), "utf8"), "keep");
});
