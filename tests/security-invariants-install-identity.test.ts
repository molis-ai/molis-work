import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PluginRuntime, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";

// S-75 (ac-trust T6): a signature the author wrote is a label, so it never gives an install another's identity, and the names a plugin lives
// under (`plugin_id`, the contribution ids made from it, the id its actions are registered under) belong to whoever came first.
const FINGERPRINT = `ed25519:sha256:${"a".repeat(64)}`;
const PINNED = { level: "pinned", publisher_key_id: FINGERPRINT } as const;
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

function manifest(pluginId: string, signature: string, version = "1.0.0"): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: pluginId, version, name: "Identity fixture", kind: "app",
    publisher: { publisher_id: signature, signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  };
}
const definition = (value: PluginManifest): PluginDefinition =>
  ({ manifest: value, async start() { return { kind: "app", views: [] }; }, async stop() {} }) as PluginDefinition;
const install = (runtime: PluginRuntime, pluginId: string, signature: string, trust: Parameters<PluginRuntime["install"]>[0]["trust"] = UNSIGNED_TRUST) =>
  runtime.install({ definition: definition(manifest(pluginId, signature)), deployment: "local", grants: [], trust });

test("RAC-394 S-75 a signature in the fingerprint form is for a pinned key only, never for a label the author wrote", () => {
  const runtime = new PluginRuntime();
  assert.throws(() => install(runtime, "io.molis.work.example.fp", FINGERPRINT, UNSIGNED_TRUST), code("plugin.signer_mismatch"));
  assert.throws(() => install(runtime, "io.molis.work.example.fp", FINGERPRINT, HOST_BUILD_TRUST), code("plugin.signer_mismatch"));
  assert.deepEqual(runtime.list(), [], "a refused install leaves no record");
  assert.equal(install(runtime, "io.molis.work.example.fp", FINGERPRINT, PINNED).install.publisher_trust, "pinned");
  assert.equal(install(runtime, "io.molis.work.example.label", "my-own-label", UNSIGNED_TRUST).install.publisher_trust, "unsigned");
});

test("RAC-395 S-75 ids on one dotted path belong to one publisher: another's install may not nest above or below", () => {
  const runtime = new PluginRuntime();
  install(runtime, "io.molis.work.example.tools", "first");
  assert.throws(() => install(runtime, "io.molis.work.example.tools.extra", "second"), code("plugin.id_namespace_conflict"), "below");
  assert.throws(() => install(runtime, "io.molis.work.example", "second"), code("plugin.id_namespace_conflict"), "above");
  assert.deepEqual(runtime.list().map(record => record.plugin_id), ["io.molis.work.example.tools"], "the refused installs wrote no record");
  assert.equal(install(runtime, "io.molis.work.example.toolset", "second").install.publisher_trust, "unsigned", "a name that only shares letters is another name");
  assert.throws(() => install(runtime, "io.molis.work.example.tools.extra", FINGERPRINT, PINNED), code("plugin.id_namespace_conflict"), "a pinned key is a publisher too");
  assert.equal(install(runtime, "io.molis.work.example.tools.more", "first").install.plugin_id, "io.molis.work.example.tools.more", "the same publisher may nest its own ids");
  install(runtime, "io.molis.work.example.same", "first");
  assert.notEqual(install(runtime, "io.molis.work.example.same", "second").install.install_id, runtime.list().find(record => record.publisher_signature === "first")!.install_id,
    "an equal id from another publisher is another install, as before");
});

test("RAC-395 S-75 an uninstalled plugin frees its name", async () => {
  const runtime = new PluginRuntime();
  const first = install(runtime, "io.molis.work.example.gone", "first");
  assert.throws(() => install(runtime, "io.molis.work.example.gone.child", "second"), code("plugin.id_namespace_conflict"));
  await runtime.uninstall(first.install.install_id);
  assert.equal(install(runtime, "io.molis.work.example.gone.child", "second").install.plugin_id, "io.molis.work.example.gone.child");
});

test("RAC-399 S-75 an id the Host's build ships, or one under it, is not for another trust level", () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: new Set(["io.molis.work.example.shipped"]) });
  for (const id of ["io.molis.work.example.shipped", "io.molis.work.example.shipped.sub", "io.molis.work.example"]) {
    assert.throws(() => install(runtime, id, "someone"), code("plugin.id_namespace_conflict"), id);
    assert.throws(() => install(runtime, id, FINGERPRINT, PINNED), code("plugin.id_namespace_conflict"), `${id} pinned`);
  }
  assert.deepEqual(runtime.list(), [], "the refused installs wrote no record");
  assert.equal(install(runtime, "io.molis.work.example.shipped", "host-label", HOST_BUILD_TRUST).install.publisher_trust, "host", "the Host's own build installs it");
  assert.equal(install(runtime, "io.molis.work.example.other", "someone").install.publisher_trust, "unsigned");
});

test("RAC-396 S-75 an installation's actions are registered under its install id, and under its plugin id only when it is of the Host's build", async () => {
  const PLUGIN_ID = "io.molis.work.example.provider";
  // The Host answers with the plugin id for whatever it is asked about: only an install of its own build may be given that.
  const runtime = () => new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { actions: { registry: {} as never, providerId: () => PLUGIN_ID } });
  const unsigned = runtime();
  const stranger = install(unsigned, PLUGIN_ID, "someone", UNSIGNED_TRUST);
  await assert.rejects(unsigned.start(stranger.install.install_id));
  assert.equal(unsigned.list()[0]?.state, "crashed", "the install did not become the provider");
  assert.equal(unsigned.list()[0]?.last_error_code, "plugin.id_namespace_conflict");
  const own = runtime();
  assert.equal((await own.start(install(own, PLUGIN_ID, "host-label", HOST_BUILD_TRUST).install.install_id)).install.state, "running");
  const plain = new PluginRuntime();
  assert.equal((await plain.start(install(plain, PLUGIN_ID, "someone", UNSIGNED_TRUST).install.install_id)).install.state, "running", "no Host answer means the install id, as before");
});

test("RAC-395 S-75 unsigned installs never nest with one another, whatever their labels say; no record is written", () => {
  const runtime = new PluginRuntime();
  install(runtime, "io.molis.work.example.label", "copied-label");
  assert.throws(() => install(runtime, "io.molis.work.example.label.child", "copied-label"), code("plugin.id_namespace_conflict"), "below, same label");
  assert.throws(() => install(runtime, "io.molis.work.example", "copied-label"), code("plugin.id_namespace_conflict"), "above, same label");
  assert.deepEqual(runtime.list().map(record => record.plugin_id), ["io.molis.work.example.label"]);
  // The same key is the only thing that makes two installs one publisher.
  install(runtime, "io.molis.work.example.keyed", FINGERPRINT, PINNED);
  assert.equal(install(runtime, "io.molis.work.example.keyed.child", FINGERPRINT, PINNED).install.publisher_trust, "pinned");
});

test("RAC-395 S-75 an installation on record that breaks the names rule does not start: it is recorded crashed, with the same code, and the executor never runs it", async () => {
  const repository = new MemoryPluginRuntimeRepository();
  const shipped = "io.molis.work.example.shipped";
  const before = new PluginRuntime(repository);
  const squatter = install(before, shipped, "someone").install;
  const first = install(before, "io.molis.work.example.p", "same-label").install;
  repository.save({ ...first, install_id: "kept-from-before-the-rule", plugin_id: "io.molis.work.example.p.q" });
  let started = 0;
  const executor = { async start() { started += 1; throw new Error("must not run"); }, async stop() {} } as never;
  const now = new PluginRuntime(repository, executor, { hostIds: new Set([shipped]) });
  for (const id of [squatter.install_id, first.install_id, "kept-from-before-the-rule"]) {
    await assert.rejects(now.start(id), code("plugin.id_namespace_conflict"), id);
    assert.deepEqual([repository.get(id)?.state, repository.get(id)?.last_error_code], ["crashed", "plugin.id_namespace_conflict"], id);
  }
  assert.equal(started, 0);
});

test("RAC-399 S-75 every Runtime the Host composes is given the list of ids its build ships", () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? (entry.name === "node_modules" || entry.name === "dist" ? [] : files(join(dir, entry.name))) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : []);
  const callOf = (source: string, at: number): string => {
    let depth = 0;
    for (let i = source.indexOf("(", at); i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      if (source[i] === ")" && --depth === 0) return source.slice(at, i + 1);
    }
    return source.slice(at);
  };
  const withoutList: string[] = [];
  let found = 0;
  for (const file of files("apps/local-host/src")) {
    const source = readFileSync(file, "utf8");
    for (let at = source.indexOf("new PluginRuntime("); at >= 0; at = source.indexOf("new PluginRuntime(", at + 1)) {
      found += 1;
      if (!/\bhostIds\b/.test(callOf(source, at))) withoutList.push(file);
    }
  }
  assert.ok(found >= 4, `the Host composes its Runtimes in apps/local-host/src (${found} found)`);
  assert.deepEqual(withoutList, [], "a Runtime composed without the list reserves no id");
});
