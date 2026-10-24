import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentSkillDeclaration, AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, homeAgentDefinitions, homeStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { pagesManifest, pagesMethods } from "@molis-ai/molis-work-plugin-pages";
import { pluginActions } from "./fixtures/plugin-actions.js";

/**
 * W4-02 (decision #18): the methods a Runtime or installed plugin's Manifest declares take effect as a built-in Plugin's do. The Host
 * registers them, with the bodies the definition ships, when the plugin starts, so other Agents (the Assistant, a Character) list and
 * read them by id and version; they are withdrawn when it is disabled or uninstalled, and an upgrade registers the new version's.
 */

const PLUGIN_ID = "io.molis.work.example.methodprobe";
const declared = (skill_id: string, version = 1): AgentSkillDeclaration => ({ skill_id, version, name: `方法 ${skill_id}`, summary: `何时用 ${skill_id}`, tools: ["read-capability"] });
const body = (skill_id: string, version = 1, text = `${skill_id} 第 ${version} 版的做法`): AgentSkillDefinition => ({ ...declared(skill_id, version), body: text });

function probe(options: { pluginId?: string; version?: string; methods?: AgentSkillDeclaration[]; bodies?: AgentSkillDefinition[]; execution?: "sandbox"; signature?: string } = {}) {
  const { pluginId = PLUGIN_ID, version = "1.0.0", methods = [declared("triage")], bodies = [body("triage")], execution, signature = "probe-methods" } = options;
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version, name: "方法探针", kind: "app",
    publisher: { publisher_id: "molis", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
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

test("W4-02-04 RAC-192 RAC-194 a built-in plugin's methods come with its running definition and only then; a definition for an owner the platform registers itself is refused; a sandboxed definition that carries methods does not start", { timeout: 60_000 },
  withHome(async home => {
    // Pages is built in, and nothing of it is offered until it runs (PG-051): no catalog registers it at start.
    assert.deepEqual(listed(home, "io.molis.work.pages"), [], "not running: no method for other Agents");
    const pages = platformIn(home), own = probe({ pluginId: "io.molis.work.pages", methods: [...pagesManifest.methods ?? []], bodies: [...pagesMethods] });
    try {
      assert.deepEqual((await pages.platform.start([{ definition: own.definition }])).running, ["io.molis.work.pages"]);
      assert.equal(own.started(), 1);
      assert.match(homeAgentDefinitions(home).method("io.molis.work.pages", "meeting-notes", 2).body, /待定问题/, "the body its definition ships");
    } finally { pages.store.close(); }
    // Plugin Builder's Agents and instructions are the platform's own (PG-051 Q2): a definition naming that owner does not start.
    const project = platformIn(home), shadow = probe({ pluginId: "io.molis.work.plugin-builder" });
    try {
      const refused = await project.platform.start([{ definition: shadow.definition }]);
      assert.deepEqual(refused.running, []);
      assert.deepEqual(refused.failed.map(entry => entry.plugin_id), ["io.molis.work.plugin-builder"]);
      assert.equal(shadow.started(), 0, "the plugin never started");
      assert.equal(homeAgentDefinitions(home).prompts().find(view => view.owner_id === "io.molis.work.plugin-builder")?.source.kind, "system", "the platform's registration is untouched");
    } finally { project.store.close(); }
    // A method's body goes into another Agent's round: only a plugin the Host runs itself registers one, and a sandboxed package that carries methods
    // does not start until an install can show the person what it adds (S-60, PG-017 BL-493).
    const sandboxed = platformIn(home), generated = probe({ pluginId: "io.molis.work.example.generated", execution: "sandbox" });
    try {
      assert.deepEqual((await sandboxed.platform.start([{ definition: generated.definition, grants: [] }])).running, []);
      assert.equal(generated.started(), 0, "the plugin never started");
      assert.equal(sandboxed.platform.runtime.get(sandboxed.platform.runtime.list()[0]!.install_id).last_error_code, "sandbox.service_not_given");
      assert.deepEqual(listed(home, "io.molis.work.example.generated"), [], "its methods are not registered");
    } finally { sandboxed.store.close(); }
  }));

test("RAC-191 PG-051 V-05 a running definition's Agent block registers its roles and prompts; the person's edit is what a run gets, and outlives a stop", { timeout: 60_000 },
  withHome(async home => {
    const AGENT_ID = "io.molis.work.example.agentprobe";
    const text = { prompt_id: "probe-role", version: 1, body: "按清单逐项核对" };
    const plugin = probe({ pluginId: AGENT_ID, methods: [], bodies: [] });
    const definition: PluginDefinition = { ...plugin.definition, agent_prompts: [text],
      manifest: { ...plugin.definition.manifest, agent: { roles: [{ role_id: "checker", version: 1, name: "核对员", workspace: "none", prompts: ["probe-role"] }], prompts: [{ prompt_id: "probe-role", version: 1 }] } } };
    const first = platformIn(home);
    try {
      const started = await first.platform.start([{ definition }]);
      assert.deepEqual(started.running, [AGENT_ID], JSON.stringify(started.failed));
      const registry = homeAgentDefinitions(home);
      assert.deepEqual(registry.roles().filter(role => role.owner_id === AGENT_ID).map(role => [role.role_id, role.name, role.prompt_keys]), [["checker", "核对员", [`${AGENT_ID}/probe-role`]]]);
      const [prompt] = registry.prompts().filter(view => view.owner_id === AGENT_ID);
      assert.equal(prompt?.kind, "agent");
      registry.save(prompt!.key, "按清单逐项核对，先列出缺的", null, "tester");
      assert.equal(registry.effective(AGENT_ID, text).body, "按清单逐项核对，先列出缺的", "a run gets the person's version");
      await first.platform.runtime.stop(first.installId(AGENT_ID));
      // Stopped, it stays in the person's settings as not running (PG-051 Q1 b), with the edit kept.
      assert.deepEqual(registry.roles().filter(role => role.owner_id === AGENT_ID).map(role => role.source.kind === "plugin" && role.source.state), ["disabled"]);
    } finally { first.store.close(); }
    const again = platformIn(home);
    try {
      assert.deepEqual((await again.platform.start([{ definition }])).running, [AGENT_ID]);
      assert.equal(homeAgentDefinitions(home).effective(AGENT_ID, text).body, "按清单逐项核对，先列出缺的", "the edit is back with the registration");
    } finally { again.store.close(); }
  }));

/** An Agent probe for PG-051 Q1 b: one role with its prompt, and one method. */
function agentProbe(options: { version?: string; prompt?: string; signature?: string } = {}) {
  const { version = "1.0.0", prompt = "probe-role", signature } = options;
  const plugin = probe({ pluginId: AGENT_PROBE, version, ...(signature ? { signature } : {}) });
  const definition: PluginDefinition = { ...plugin.definition, agent_prompts: [{ prompt_id: prompt, version: 1, body: `${prompt} 的默认做法` }],
    manifest: { ...plugin.definition.manifest, agent: { roles: [{ role_id: "checker", version: 1, name: "核对员", workspace: "none", prompts: [prompt] }], prompts: [{ prompt_id: prompt, version: 1 }] } } };
  return definition;
}
const AGENT_PROBE = "io.molis.work.example.agentprobe";
const promptsOf = (home: string) => homeAgentDefinitions(home).prompts().filter(view => view.owner_id === AGENT_PROBE)
  .map(view => `${view.prompt_id}:${view.source.kind === "plugin" ? view.source.state : "system"}`);

test("RAC-193 PG-051 two installations side by side: one stopping leaves the other's; the last out keeps them as not running, the person's edit with them", { timeout: 60_000 },
  withHome(async home => {
    const first = platformIn(home), second = platformIn(home);
    try {
      assert.deepEqual((await first.platform.start([{ definition: agentProbe() }])).running, [AGENT_PROBE]);
      assert.deepEqual((await second.platform.start([{ definition: agentProbe({ signature: "probe-second" }) }])).running, [AGENT_PROBE]);
      const ids = (platform: ReturnType<typeof platformIn>) => platform.platform.runtime.list().filter(record => record.plugin_id === AGENT_PROBE).map(record => record.install_id);
      assert.equal(new Set([...ids(first), ...ids(second)]).size, 2, "two installations, one per signature");
      const registry = homeAgentDefinitions(home);
      // RAC-198: two installations are what the “多个安装” notice is for (one plugin's Home and project halves are one: tests/dual-instance-declaration.test.ts).
      const notes = () => registry.registrations().find(row => row.owner_id === AGENT_PROBE)?.notes ?? [];
      assert.ok(notes().some(note => note.includes("此插件有多个安装")), JSON.stringify(notes()));
      const [view] = registry.prompts().filter(item => item.owner_id === AGENT_PROBE);
      registry.save(view!.key, "先列出缺的", null, "tester");
      await first.platform.runtime.stop(ids(first)[0]!);
      assert.deepEqual(listed(home, AGENT_PROBE), ["triage@1"], "the other installation still runs: its method stays");
      assert.deepEqual(promptsOf(home), ["probe-role:enabled"]);
      await second.platform.runtime.stop(ids(second)[0]!);
      assert.deepEqual(listed(home, AGENT_PROBE), [], "the last out: no method for other Agents");
      assert.deepEqual(promptsOf(home), ["probe-role:disabled"], "still in the person's settings, as not running");
      assert.equal(registry.effective(AGENT_PROBE, { prompt_id: "probe-role", version: 1, body: "probe-role 的默认做法" }).body, "先列出缺的");
      assert.deepEqual((await second.platform.runtime.start(ids(second)[0]!)).install.state, "running");
      assert.deepEqual(promptsOf(home), ["probe-role:enabled"], "registered again, with the edit in force");
      assert.equal(registry.effective(AGENT_PROBE, { prompt_id: "probe-role", version: 1, body: "probe-role 的默认做法" }).body, "先列出缺的");
    } finally { first.store.close(); second.store.close(); }
  }));

/** The Host starting again on a copy of the Home: what the register shows for the Agent probe then. */
function promptsAfterRestart(home: string) {
  const restarted = mkdtempSync(join(tmpdir(), "plugin-methods-restart-"));
  try {
    for (const store of ["agent-definitions", "agent-declarations"]) cpSync(join(home, store), join(restarted, store), { recursive: true });
    return { prompts: promptsOf(restarted), roles: homeAgentDefinitions(restarted).roles().filter(role => role.owner_id === AGENT_PROBE).map(role => role.role_id) };
  } finally { rmSync(restarted, { recursive: true, force: true }); }
}

test("RAC-196 PG-051 Q1 b the last instance out leaves the installation's newest version, not the one it started with", { timeout: 60_000 },
  withHome(async home => {
    // One installation, two projects: A still runs 1.0.0 when B starts the upgraded 1.1.0; B stops first, A last.
    const a = platformIn(home), b = platformIn(home);
    try {
      assert.deepEqual((await a.platform.start([{ definition: agentProbe() }])).running, [AGENT_PROBE]);
      assert.deepEqual((await b.platform.start([{ definition: agentProbe({ version: "1.1.0", prompt: "probe-role-2" }) }])).running, [AGENT_PROBE]);
      assert.equal(a.installId(AGENT_PROBE), b.installId(AGENT_PROBE), "one installation in both projects");
      assert.deepEqual(promptsOf(home), ["probe-role-2:enabled"], "the register shows the newest version");
      await b.platform.runtime.stop(b.installId(AGENT_PROBE));
      assert.deepEqual(promptsOf(home), ["probe-role-2:enabled"], "1.0.0 still runs in A: the newest declaration stays");
      await a.platform.runtime.stop(a.installId(AGENT_PROBE));
      assert.deepEqual(promptsOf(home), ["probe-role-2:disabled"], "A, on 1.0.0, stops last: 1.1.0 is what stays, as not running");
      // An earlier version starting while a newer one runs does not take its place either.
      await b.platform.runtime.start(b.installId(AGENT_PROBE));
      await a.platform.runtime.start(a.installId(AGENT_PROBE));
      assert.deepEqual(promptsOf(home), ["probe-role-2:enabled"]);
      await a.platform.runtime.stop(a.installId(AGENT_PROBE));
      await b.platform.runtime.stop(b.installId(AGENT_PROBE));
    } finally { a.store.close(); b.store.close(); }
    assert.deepEqual(promptsAfterRestart(home).prompts, ["probe-role-2:disabled"], "and so when the Host starts again");
  }));

test("RAC-196 PG-051 Q1 b a new version that declares nothing for Agents replaces the remembered declaration with nothing", { timeout: 60_000 },
  withHome(async home => {
    const project = platformIn(home);
    try {
      await project.platform.start([{ definition: agentProbe() }]);
      await project.platform.runtime.stop(project.installId(AGENT_PROBE));
      assert.deepEqual(promptsOf(home), ["probe-role:disabled"]);
      await project.platform.runtime.start(project.installId(AGENT_PROBE));
      const bare = probe({ pluginId: AGENT_PROBE, version: "1.1.0", methods: [], bodies: [] }).definition;
      const result = await project.platform.upgrade(AGENT_PROBE, bare);
      assert.equal(result.status, "running", result.message ?? "");
      assert.deepEqual(promptsOf(home), [], "1.1.0 declares no prompt, role or method: none of 1.0.0's is shown");
      await project.platform.runtime.stop(project.installId(AGENT_PROBE));
      assert.deepEqual(promptsOf(home), []);
      assert.deepEqual(homeAgentDefinitions(home).roles().filter(role => role.owner_id === AGENT_PROBE), []);
    } finally { project.store.close(); }
    assert.deepEqual(promptsAfterRestart(home), { prompts: [], roles: [] }, "nor when the Host starts again");
  }));

test("RAC-196 PG-051 Q1 b a stopped installation's declaration comes back as not running when the Host starts again, offers no method, is replaced whole by a new version and goes with the uninstall", { timeout: 60_000 },
  withHome(async home => {
    const project = platformIn(home);
    try {
      await project.platform.start([{ definition: agentProbe() }]);
      await project.platform.runtime.stop(project.installId(AGENT_PROBE));
    } finally { project.store.close(); }
    // The Host starting again: a fresh process opens the Home's register from disk (a copy of the Home stands in for it here).
    const restarted = mkdtempSync(join(tmpdir(), "plugin-methods-restart-"));
    try {
      for (const store of ["agent-definitions", "agent-declarations"]) cpSync(join(home, store), join(restarted, store), { recursive: true });
      assert.deepEqual(promptsOf(restarted), ["probe-role:disabled"], "shown as not running before it starts");
      assert.deepEqual(homeAgentDefinitions(restarted).roles().filter(role => role.owner_id === AGENT_PROBE).map(role => role.role_id), ["checker"]);
      assert.deepEqual(listed(restarted, AGENT_PROBE), [], "its method is not offered to other Agents");
      assert.throws(() => homeAgentDefinitions(restarted).method(AGENT_PROBE, "triage", 1), /没有登记这个方法版本/);
    } finally { rmSync(restarted, { recursive: true, force: true }); }
    // A new version replaces the remembered record whole: the earlier prompt is not kept beside the new one.
    const upgraded = platformIn(home);
    try {
      await upgraded.platform.start([{ definition: agentProbe() }]);
      const result = await upgraded.platform.upgrade(AGENT_PROBE, agentProbe({ version: "1.1.0", prompt: "probe-role-2" }));
      assert.equal(result.status, "running", result.message ?? "");
      await upgraded.platform.runtime.stop(upgraded.installId(AGENT_PROBE));
      assert.deepEqual(promptsOf(home), ["probe-role-2:disabled"]);
      await upgraded.platform.runtime.uninstall(upgraded.installId(AGENT_PROBE));
      assert.deepEqual(promptsOf(home), [], "uninstalled: gone from the register");
    } finally { upgraded.store.close(); }
    const afterUninstall = mkdtempSync(join(tmpdir(), "plugin-methods-restart-"));
    try {
      for (const store of ["agent-definitions", "agent-declarations"]) cpSync(join(home, store), join(afterUninstall, store), { recursive: true });
      assert.deepEqual(promptsOf(afterUninstall), [], "and from the Home");
    } finally { rmSync(afterUninstall, { recursive: true, force: true }); }
  }));
