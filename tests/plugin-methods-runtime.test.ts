import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentSkillDeclaration, AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, homeAgentDefinitions, homeStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

/**
 * W4-02 (decision #18): the methods a Runtime or installed plugin's Manifest declares take effect as a built-in Plugin's do. The Host
 * registers them, with the bodies the definition ships, when the plugin starts, so other Agents (the Assistant, a Character) list and
 * read them by id and version; they are withdrawn when it is disabled or uninstalled, and an upgrade registers the new version's.
 */

const PLUGIN_ID = "io.molis.work.example.methodprobe";
const declared = (skill_id: string, version = 1): AgentSkillDeclaration => ({ skill_id, version, name: `方法 ${skill_id}`, summary: `何时用 ${skill_id}`, tools: ["read-capability"] });
const body = (skill_id: string, version = 1, text = `${skill_id} 第 ${version} 版的做法`): AgentSkillDefinition => ({ ...declared(skill_id, version), body: text });

function probe(options: { pluginId?: string; version?: string; methods?: AgentSkillDeclaration[]; bodies?: AgentSkillDefinition[]; execution?: "sandbox" } = {}) {
  const { pluginId = PLUGIN_ID, version = "1.0.0", methods = [declared("triage")], bodies = [body("triage")], execution } = options;
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version, name: "方法探针", kind: "app",
    publisher: { publisher_id: "molis", signature: "probe-methods" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, methods,
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  let started = 0;
  const definition: PluginDefinition = { manifest, methods: bodies, ...(execution ? { execution } : {}),
    async start() { started += 1; return { kind: "app", views: [] }; } };
  return { definition, started: () => started };
}

function platformIn(home: string) {
  const file = join(mkdtempSync(join(home, "board-")), "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: { directory: home, completeText: () => undefined, stores: homeStores() } });
  const installId = (pluginId = PLUGIN_ID) => platform.runtime.list().find(record => record.plugin_id === pluginId)!.install_id;
  return { store, platform, installId };
}

function withHome(run: (home: string) => Promise<void>) {
  return async () => {
    const home = mkdtempSync(join(tmpdir(), "plugin-methods-runtime-"));
    try { await run(home); } finally { rmSync(home, { recursive: true, force: true }); }
  };
}

const listed = (home: string, ownerId = PLUGIN_ID) => homeAgentDefinitions(home).methods().filter(method => method.owner_id === ownerId)
  .map(method => `${method.skill_id}@${method.version}`);

test("W4-02-01 a Runtime plugin's methods are registered when it starts, exactly as declared, and the last of its projects to stop withdraws them", { timeout: 60_000 },
  withHome(async home => {
    assert.deepEqual(listed(home), [], "nothing of the plugin's before it runs");
    const first = platformIn(home), second = platformIn(home);
    // Two declared, one shipped with a body: the one without is not registered, and the developer diagnostics say so.
    const plugin = probe({ methods: [declared("triage"), declared("handoff")], bodies: [body("triage"), body("unlisted")] });
    try {
      assert.deepEqual((await first.platform.start([{ definition: plugin.definition }])).running, [PLUGIN_ID]);
      assert.deepEqual(listed(home), ["triage@1"], "a body nobody declared is not registered either");
      const registry = homeAgentDefinitions(home);
      assert.equal(registry.method(PLUGIN_ID, "triage", 1).body, "triage 第 1 版的做法");
      assert.throws(() => registry.method(PLUGIN_ID, "handoff"), /没有登记这个方法版本/);
      const owner = registry.diagnostics().owners.find(row => row.owner_id === PLUGIN_ID);
      assert.equal(owner?.methods, 1);
      assert.ok(owner?.issues.some(issue => issue.text === "方法 handoff 声明了但包里没有正文，未登记"));
      const [view] = registry.methods().filter(method => method.owner_id === PLUGIN_ID);
      assert.deepEqual(view?.source, { kind: "plugin", plugin_id: PLUGIN_ID, plugin_version: "1.0.0", title: "方法探针", state: "enabled" });
      // The same installation in a second project: still one registration; one project stopping leaves it with the other.
      assert.deepEqual((await second.platform.start([{ definition: probe().definition }])).running, [PLUGIN_ID]);
      await first.platform.runtime.stop(first.installId());
      assert.deepEqual(listed(home), ["triage@1"]);
      await second.platform.runtime.stop(second.installId());
      assert.deepEqual(listed(home), [], "the last instance out withdraws them");
    } finally { first.store.close(); second.store.close(); }
  }));

test("W4-02-02 disabling withdraws a plugin's methods and enabling brings them back; uninstalling withdraws them; an upgrade registers the new version's", { timeout: 60_000 },
  withHome(async home => {
    const project = platformIn(home);
    try {
      await project.platform.start([{ definition: probe().definition }]);
      assert.deepEqual(listed(home), ["triage@1"]);
      await project.platform.runtime.stop(project.installId());
      assert.deepEqual(listed(home), [], "disabled: other Agents no longer see them");
      await project.platform.runtime.start(project.installId());
      assert.deepEqual(listed(home), ["triage@1"], "enabled again");
      const upgraded = await project.platform.upgrade(PLUGIN_ID, probe({ version: "1.1.0", methods: [declared("triage", 2), declared("handoff")],
        bodies: [body("triage", 2, "第 2 版的做法"), body("handoff")] }).definition);
      assert.equal(upgraded.status, "running", upgraded.message ?? "");
      assert.deepEqual(listed(home).sort(), ["handoff@1", "triage@2"], "the new version's methods, not the old one's");
      assert.equal(homeAgentDefinitions(home).method(PLUGIN_ID, "triage", 2).body, "第 2 版的做法");
      assert.throws(() => homeAgentDefinitions(home).method(PLUGIN_ID, "triage", 1), /没有登记这个方法版本/);
      await project.platform.runtime.uninstall(project.installId());
      assert.deepEqual(listed(home), [], "uninstalled: withdrawn");
    } finally { project.store.close(); }
  }));

test("W4-02-03 an upgrade that starts while another project still runs the earlier version replaces the registration; the last instance out withdraws it", { timeout: 60_000 },
  withHome(async home => {
    const first = platformIn(home), second = platformIn(home);
    try {
      await first.platform.start([{ definition: probe().definition }]);
      await second.platform.start([{ definition: probe().definition }]);
      await first.platform.upgrade(PLUGIN_ID, probe({ version: "1.1.0", methods: [declared("triage", 2)], bodies: [body("triage", 2)] }).definition);
      assert.deepEqual(listed(home), ["triage@2"], "the installation's newest version is the one registered");
      await second.platform.runtime.stop(second.installId());
      assert.deepEqual(listed(home), ["triage@2"], "the upgraded project still runs it");
      await first.platform.runtime.stop(first.installId());
      assert.deepEqual(listed(home), []);
    } finally { first.store.close(); second.store.close(); }
  }));

test("W4-02-04 a definition's methods for an owner the catalog registers for are refused; one that carries no bodies starts; a sandboxed definition's are not registered", { timeout: 60_000 },
  withHome(async home => {
    // A catalog plugin's own definition (Issues on the Home Runtime) shares the Manifest that declares the methods and carries no
    // bodies: the catalog registers them, and the plugin starts as before.
    const catalogOwn = platformIn(home), own = probe({ pluginId: "io.molis.work.pages", methods: [declared("meeting-notes")], bodies: [] });
    try {
      assert.deepEqual((await catalogOwn.platform.start([{ definition: own.definition }])).running, ["io.molis.work.pages"]);
      assert.equal(own.started(), 1);
      assert.match(homeAgentDefinitions(home).method("io.molis.work.pages", "meeting-notes", 1).body, /待定问题/, "the catalog's body, not replaced");
    } finally { catalogOwn.store.close(); }
    // Pages' methods are the catalog's: a second source for the same owner would replace them in the register, so it does not start.
    const project = platformIn(home), shadow = probe({ pluginId: "io.molis.work.pages" });
    try {
      const refused = await project.platform.start([{ definition: shadow.definition }]);
      assert.deepEqual(refused.running, []);
      assert.deepEqual(refused.failed.map(entry => entry.plugin_id), ["io.molis.work.pages"]);
      assert.equal(shadow.started(), 0, "the plugin never started");
      assert.ok(homeAgentDefinitions(home).methods().some(method => method.key === "io.molis.work.pages/meeting-notes"), "the catalog's method is still there");
    } finally { project.store.close(); }
    // A method's body goes into another Agent's round: only a plugin the Host runs itself registers one.
    const sandboxed = platformIn(home), generated = probe({ pluginId: "io.molis.work.example.generated", execution: "sandbox" });
    try {
      assert.deepEqual((await sandboxed.platform.start([{ definition: generated.definition, grants: [] }])).running, ["io.molis.work.example.generated"]);
      assert.equal(generated.started(), 1);
      assert.deepEqual(listed(home, "io.molis.work.example.generated"), [], "it runs, and its methods are not registered");
    } finally { sandboxed.store.close(); }
  }));
