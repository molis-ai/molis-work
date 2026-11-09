import assert from "node:assert/strict";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginRuntimeReleaseArtifact, PluginRuntime, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { bindActionHandler, defineSettingsActions, parsePluginManifest, parsePluginPackageManifest } from "@molis-ai/molis-work-plugin-sdk";

const conflict = (key: string) => (error: unknown) =>
  error instanceof ActionError && error.code === "plugin.definition_conflict" && error.message.includes(`设置键 ${key} 已由`);

function definition(name: string, key: string, options: {
  scope?: "home" | "project"; next?: true; link?: string; start?(): Promise<void>; preflight?(): Promise<void>;
} = {}): PluginDefinition {
  const plugin_id = `io.molis.work.admission.${name}`;
  const action = (operation: string) => ({ capability_id: `${plugin_id}.settings.${operation}`, version: 1, title: operation, description: operation, permissions: [] });
  const { read, write } = defineSettingsActions({ scope: options.scope ?? "project", read: action("read"), write: action("write") });
  return {
    manifest: { schema_version: 1, host_api_version: 1, kind: "app", plugin_id, name, version: options.next ? "2.0.0" : "1.0.0",
      publisher: { publisher_id: "admission", signature: "settings-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "index.js" }],
      permissions: [], capabilities: { provides: [], consumes: [] }, ui: { contributions: [] },
      artifacts: { produces: [], consumes: [], ...(options.link ? { links: [{ kind: options.link, role: "output" as const }] } : {}) },
      actions: [read, write], settings_entries: { entries: [{ key, title: { literal: key }, layers: ["project"], schema: { type: "string" } }],
        read: { capability_id: read.capability_id, version: read.version }, write: { capability_id: write.capability_id, version: write.version } },
      ...(options.next ? { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } } : {}),
    },
    async start() {
      await options.start?.();
      return { kind: "app", actions: [bindActionHandler(read, () => ({ values: [] })), bindActionHandler(write, () => ({ values: [] }))] };
    },
    ...(options.preflight ? { validateUpgrade: options.preflight } : {}),
  };
}

const installInput = (definition: PluginDefinition) => ({ definition, deployment: "local" as const, grants: [], trust: UNSIGNED_TRUST });

test("SPC-C01: public Manifest parsing validates setting text, layers and the owner's exact action schema", () => {
  const { manifest } = definition("manifest", "sample.setting");
  assert.equal(parsePluginManifest(manifest), manifest);
  const pathOfRefusal = (path: string) => (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid"
    && (error.details as { problems: { path: string }[] }).problems.some(problem => problem.path === path);
  const changed = (change: (draft: PluginManifest) => void) => {
    const copy = structuredClone(manifest);
    change(copy);
    return () => parsePluginManifest(copy);
  };
  assert.throws(changed(draft => { draft.settings_entries!.read.version++; }), pathOfRefusal("settings_entries.read"));
  assert.throws(changed(draft => { draft.actions![1]!.action!.input_schema = { type: "object" }; }), pathOfRefusal("settings_entries.write"));
  assert.throws(changed(draft => { draft.settings_entries!.entries[0]!.title = { key: "somebody.else.title" }; }), pathOfRefusal("settings_entries.entries[0].title"));
  assert.throws(changed(draft => { Reflect.set(draft.settings_entries!.entries[0]!, "layers", ["task"]); }), pathOfRefusal("settings_entries.entries[0].layers"));
  assert.throws(() => parsePluginPackageManifest(manifest), pathOfRefusal("settings_entries"));
});

function usingDb<T>(path: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path);
  try { return run(db); } finally { db.close(); }
}

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-settings-admission-"));
  const projects = await withMolisWorkProjectCatalog({ homeDirectory: directory }, async catalog => [
    await catalog.createProject({ display_name: "A", actor_id: "owner" }),
    await catalog.createProject({ display_name: "B", actor_id: "owner" }),
  ]);
  const admitted = new Set<PluginDefinition>();
  const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null, pluginFixtures: { installed: admitted } });
  t.after(async () => { try { await host.close(); } finally { await rm(directory, { recursive: true, force: true }); } });

  function scope(runtime: PluginRuntime, path: string) {
    const archive = (definition: PluginDefinition) => {
      admitted.add(definition);
      usingDb(path, db => new SqlitePluginRuntimeReleaseArtifactRepository(db)
        .save(createPluginRuntimeReleaseArtifact(definition.manifest, "export {}")));
    };
    return {
      runtime, path, archive,
      install(definition: PluginDefinition) {
        archive(definition);
        return runtime.install(installInput(definition)).install;
      },
    };
  }

  return {
    async home() {
      const platform = await host.homePlugins!.ready();
      return scope(platform.runtime, join(directory, "plugin-runtime", "plugin-runtime.db"));
    },
    async project(index: number) {
      const project = projects[index]!;
      const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      await host.localPersonContext(reference);
      const platform = await host.withProject(reference, runtime => runningProjectPlatform(runtime.store, runtime.project_id));
      assert.ok(platform);
      return scope(platform.runtime, project.database_path);
    },
  };
}

test("SPC-C01: settings are scoped to the project and Home, including the same installation id in both", { timeout: 60_000 }, async t => {
  const world = await setup(t), a = await world.project(0), b = await world.project(1), home = await world.home();
  const first = definition("alpha", "sample.shared", { link: "sample.output" });
  const second = definition("beta", "sample.shared");
  const homeOwner = definition("owner", "sample.shared", { scope: "home" });
  const record = a.install(first), other = b.install(second);
  assert.equal(other.state, "installed", "two distinct projects can declare the same key");
  assert.throws(() => a.install(second), conflict("sample.shared"));
  assert.throws(() => home.install(first), conflict("sample.shared"), "same plugin and signature would compute the same install id");
  assert.throws(() => home.install(homeOwner), conflict("sample.shared"));
  assert.equal(home.runtime.list().some(row => row.install_id === record.install_id), false);

  await a.runtime.stop(record.install_id);
  assert.equal(a.runtime.get(record.install_id).state, "disabled");
  assert.throws(() => a.install(second), conflict("sample.shared"), "disabled keeps the key");
  await a.runtime.uninstall(record.install_id, { retain_private_data: true });
  assert.equal(a.runtime.get(record.install_id).retain_private_data, true);
  assert.throws(() => home.install(homeOwner), conflict("sample.shared"), "the other project still holds the key");
  await b.runtime.uninstall(other.install_id, { retain_private_data: true });
  assert.equal(home.install(homeOwner).state, "installed", "uninstall frees settings while preserving private data");
  assert.throws(() => a.install(second), conflict("sample.shared"), "Home now owns the key in both projects");
  assert.throws(() => b.install(definition("other-link", "sample.distinct", { link: "sample.output" })),
    { code: "plugin.definition_conflict", message: /链接种类 sample\.output 已由/ }, "an artifact link keeps the prior Home-wide retained-data rule");
});

test("SPC-C01: enable rechecks installed settings and project-only reads skip unrelated project libraries", { timeout: 60_000 }, async t => {
  const world = await setup(t), a = await world.project(0), b = await world.project(1), home = await world.home();
  const first = definition("owner", "sample.enable"), earlier = definition("earlier", "sample.enable");
  const firstRecord = a.install(first);
  await a.runtime.stop(firstRecord.install_id);
  a.archive(earlier);
  const existing = usingDb(a.path, db => new PluginRuntime(new SqlitePluginRuntimeRepository(db), undefined, { hostIds: new Set() })
    .install(installInput(earlier)).install);
  await assert.rejects(a.runtime.start(firstRecord.install_id), conflict("sample.enable"));
  assert.equal(a.runtime.get(firstRecord.install_id).state, "disabled");

  // A retained record can have a damaged release. Settings ignore it before trying to decode the archive.
  usingDb(a.path, db => db.prepare("UPDATE plugin_runtime_release_artifacts SET artifact_json = '{}' WHERE plugin_id = ?").run(earlier.manifest.plugin_id));
  await a.runtime.uninstall(existing.install_id, { retain_private_data: true });
  assert.equal((await a.runtime.start(firstRecord.install_id)).install.state, "running");

  const aside = b.path + ".unavailable";
  await rename(b.path, aside);
  try {
    assert.equal(a.install(definition("local", "sample.local")).state, "installed");
    assert.throws(() => home.install(definition("global", "sample.global", { scope: "home" })), { code: "plugin.definition_conflict" });
  } finally { await rename(aside, b.path); }
});

test("SPC-C01: a racing installation wins the new key during async upgrade preflight", { timeout: 60_000 }, async t => {
  const world = await setup(t), project = await world.project(0), home = await world.home();
  const first = definition("first", "sample.original"), entered = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
  const upgraded = definition("first", "sample.contested", { next: true, async preflight() { entered.resolve(); await resume.promise; } });
  const previous = project.install(first);
  await project.runtime.start(previous.install_id);
  project.archive(upgraded);
  const attempt = project.runtime.upgrade({ install_id: previous.install_id, definition: upgraded });
  const upgrading = assert.rejects(attempt, conflict("sample.contested"));
  try {
    await Promise.race([entered.promise, attempt.then(() => assert.fail("upgrade skipped preflight"))]);
    assert.equal(project.runtime.get(previous.install_id).version, "1.0.0");
    assert.equal(home.install(definition("rival", "sample.contested", { scope: "home" })).state, "installed");
  } finally { resume.resolve(); await upgrading; }
  assert.equal(project.runtime.get(previous.install_id).version, "1.0.0");
  assert.equal(project.runtime.get(previous.install_id).state, "running");
});

for (const outcome of ["success", "failure", "cancel"] as const) {
  test(`SPC-C01: an async candidate start holds the old key across scopes through ${outcome}`, { timeout: 60_000 }, async t => {
    const world = await setup(t), project = await world.project(0), home = await world.home();
    const [owner, rival, scope] = outcome === "success" ? [project, home, "project"] as const : [home, project, "home"] as const;
    const original = definition("switch", "sample.old", { scope });
    const entered = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
    const target = definition("switch", "sample.new", { next: true, scope, async start() {
      entered.resolve();
      await resume.promise;
      if (outcome === "failure") throw new Error("candidate start failed");
    } });
    const record = owner.install(original);
    await owner.runtime.start(record.install_id);
    owner.archive(target);
    const cancellation = new AbortController();
    const before = owner.runtime.get(record.install_id);
    const candidate = owner.runtime.upgrade({ install_id: record.install_id, definition: target, assertCurrent: () => cancellation.signal.throwIfAborted() });
    const settled = outcome === "success" ? candidate : assert.rejects(candidate, outcome === "failure" ? { code: "plugin.executor_failed" } : { name: "AbortError" });
    const claimant = definition("new-owner", "sample.old", { scope: scope === "home" ? "project" : "home" });
    try {
      await Promise.race([entered.promise, candidate.then(() => assert.fail("upgrade skipped candidate start"))]);
      assert.equal(owner.runtime.get(record.install_id).version, "2.0.0", "candidate is actually saved");
      assert.throws(() => rival.install(claimant), conflict("sample.old"), "old key still has its original owner");
      if (outcome === "cancel") {
        cancellation.abort();
        assert.throws(() => rival.install(claimant), conflict("sample.old"), "request cancellation does not release a key while restoration can still happen");
      }
    } finally { resume.resolve(); await settled; }
    const after = owner.runtime.get(record.install_id);
    assert.equal(after.state, "running");
    assert.equal(after.installation_generation, before.installation_generation);
    if (outcome === "success") {
      assert.equal(after.version, "2.0.0");
      assert.equal(rival.install(claimant).state, "installed", "a successful activation frees the old key");
    } else {
      assert.equal(after.version, "1.0.0");
      assert.equal(after.manifest_digest, before.manifest_digest);
      assert.throws(() => rival.install(claimant), conflict("sample.old"), "the restored record owns the old key");
      assert.equal(rival.install(definition("candidate-key", "sample.new", { scope: scope === "home" ? "project" : "home" })).state, "installed");
    }
  });
}
