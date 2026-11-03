import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantOwnerFiles, ownerFilesProbe } from "./fixtures/plugin-owner-files.js";

test("SYS-15-F4 availability reads owned settings, cannot write, and expires before deferred reads", async t => {
  const probe = ownerFilesProbe("availabilityfiles"), pending: Promise<unknown>[] = [];
  const command = { ...probe.writeAction, action: { ...probe.writeAction.action, permissions: [probe.read, probe.write] } };
  let reads = 0;
  const definition: PluginDefinition = { ...probe.definition,
    manifest: { ...probe.definition.manifest, actions: probe.definition.manifest.actions!.map(row => row.capability_id === command.capability_id ? command : row) },
    async start(context) {
      const contribution = await probe.definition.start!(context), files = context.services!.ownerFiles!;
      return { ...contribution, actions: contribution.actions!.map(binding => binding.capability_id !== command.capability_id ? binding : {
        ...binding, availability: () => {
          assert.equal(Buffer.from(files.read("catalog.json")!).toString(), "chosen-model"); reads++;
          pending.push(assert.rejects(files.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("illegal"))), { code: "actions.forbidden" }));
          pending.push(Promise.resolve().then(() => assert.throws(() => files.read("catalog.json"), { code: "actions.expired" })));
          return { available: false as const, code: "actions.connection_required", reason: "The chosen model is unavailable" };
        },
      }) };
    },
  };
  // The plugin writes the chosen model into its own files in its own start (no host initializer: PG-103).
  probe.behavior.start = async context => {
    if (context.grants.includes(probe.write)) await context.services!.ownerFiles!.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("chosen-model")));
  };
  const entry = { ...probe.entry(), definition };
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [entry] } });
  await grantOwnerFiles(host, probe);
  const client = host.homeActionClient(), directory = await client.discover(probe.caller());
  assert.equal(directory.find(row => row.capability_id === command.capability_id)?.availability.available, false);
  await assert.rejects(client.invoke(probe.caller(), command, {}), { code: "actions.connection_required" });
  await Promise.all(pending); assert.ok(reads >= 2);
  assert.equal(readFileSync(join(home, probe.owner_files.store_name, "catalog.json"), "utf8"), "chosen-model");
  assert.equal(existsSync(join(home, probe.owner_files.store_name, "documents")), false);
});
