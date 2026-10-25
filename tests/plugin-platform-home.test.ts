import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import {
  homeStores, installedArtifacts, artifactTypeDeclarations,
  DEMO_PROJECT_ID, LocalProjectDatabase, MolisWorkLocalHost, createPluginPlatform, molisWorkHostProjectReference, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// W3-06 D0: the plumbing the Home-level services stand on. A plugin platform takes a position on its Home (the Home it can
// reach in process, or `null`, which says it reaches none), and a Host can be given plugins that exist only for a test or a
// probe (`pluginFixtures`). The services themselves (`services.homeStore`, `services.model`) come in D and E.

const PROBE = "io.molis.work.example.fixture-probe";
const SECOND = "io.molis.work.example.fixture-second";
const SHIPPED = "io.molis.work.text-stats";

const shape = { scope: "project" as const, audiences: ["user" as const], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } };
function hello(id: string): ActionDefinition<Record<string, never>, string> {
  return { capability_id: `${id}.hello`, version: 1, operation: "query",
    action: { ...shape, title: "问候", description: "夹具插件的一个只读动作", kind: "query", permissions: [], output_schema: { type: "string" } } };
}

/** A plugin that exists only for the test: one read-only action, no permissions, no services. */
function probe(options: { pluginId?: string; execution?: "sandbox"; signature?: string } = {}): PluginDefinition {
  const { pluginId = PROBE, execution, signature = "fixture-probe" } = options;
  const action = hello(pluginId);
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: pluginId, kind: "app",
    publisher: { publisher_id: "molis", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action] };
  return { manifest, ...(execution ? { execution } : {}),
    async start() { return { kind: "app", views: [], actions: [{ ...action, handle: async () => `hello from ${pluginId}` }] }; },
    async stop() {} };
}

function withDirectory(run: (directory: string) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "plugin-platform-home-"));
    try { await run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
}

/** A new Home with one project per name, each a real project database the Host can open. */
async function homeWithProjects(directory: string, ...names: string[]) {
  const home = mkdtempSync(join(directory, "home-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const projects = [];
    for (const name of names) {
      const project = await catalog.createProject({ display_name: name, actor_id: "web-user" });
      projects.push(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
    }
    return { home, projects };
  } finally { catalog.close(); }
}

const asUser = (projectId: string): ActionCallContext => ({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: [] });
const pluginsSeen = async (host: MolisWorkLocalHost, reference: { project_id: string; storage_key: string }, ...ids: string[]) =>
  (await host.actionClient(reference).discover(asUser(reference.project_id))).filter(row => ids.includes(row.provider.plugin_id ?? ""));
const fixtured = (home: string, ...project: PluginDefinition[]) => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project } });

/** Everything `createPluginPlatform` needs except what the test is about: its Home. */
function platformParts(directory: string, reference?: { project_id: string; storage_key: string }) {
  const file = reference?.storage_key ?? join(mkdtempSync(join(directory, "board-")), "board.db");
  if (!reference) seedDemoBoard(file);
  const projectId = reference?.project_id ?? DEMO_PROJECT_ID;
  const store = new LocalProjectDatabase(file);
  const options = { actions: pluginActions(store, projectId), project_id: projectId, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) };
  return { store, options };
}

test("BFTC-02 BFTC-03 a project's database closed on its own leaves the shared artifact directory readable and the other project's installation usable",
  withDirectory(async directory => {
    const { home, projects } = await homeWithProjects(directory, "先关库", "仍开放");
    assert.notEqual(projects[0]!.project_id, projects[1]!.project_id);
    const before = { effective: installedArtifacts.effective().map(manifest => manifest.plugin_id).sort(), known: [...installedArtifacts.known()].sort() };
    const items = projects.map((reference, index) => {
      const parts = platformParts(directory, reference), pluginId = index === 0 ? PROBE : SECOND;
      const typeId = `example.project-${index}`, action = hello(pluginId);
      const preview = defineArtifactPreviewAction(`${pluginId}.preview`, "预览", []);
      const original = probe({ pluginId });
      const definition: PluginDefinition = { ...original,
        manifest: { ...original.manifest, actions: [action, preview],
          artifacts: { produces: [{ artifact_type_id: typeId, schema_version: 1, title: typeId,
            preview: { capability_id: preview.capability_id, version: preview.version } }], consumes: [] } },
        async start() { return { kind: "app", views: [], actions: [
          { ...action, handle: async () => `hello from ${pluginId}` },
          { ...preview, handle: async () => ({ media_type: "text/plain", text: pluginId }) },
        ] }; } };
      const platform = createPluginPlatform({ ...parts.options, home: { directory: home, completeText: () => undefined, stores: homeStores() } });
      return { ...parts, platform, definition, pluginId, typeId, action };
    });
    try {
      for (const item of items) {
        const report = await item.platform.start([{ definition: item.definition,
          releaseArtifact: { capture: () => "export {}", restore: () => item.definition } }]);
        assert.deepEqual(report.failed, []);
        assert.deepEqual(report.running, [item.pluginId]);
        assert.equal(item.platform.runtime.list().find(record => record.plugin_id === item.pluginId)?.state, "running");
        assert.equal(artifactTypeDeclarations().get(item.typeId)?.plugin_id, item.pluginId);
        assert.equal(installedArtifacts.known().has(item.pluginId), true);
      }
      const [closed, open] = items as [typeof items[number], typeof items[number]];
      closed.store.close(); // Deliberately leave platform coordination alive: this must exercise db.open, not the normal close flag.
      assert.equal(closed.store.db.open, false);
      assert.equal(open.store.db.open, true);
      const declarations = artifactTypeDeclarations(); // Reads the production watch/view directory shared by both project platforms.
      assert.equal(declarations.has(closed.typeId), false);
      assert.equal(declarations.get(open.typeId)?.plugin_id, open.pluginId);
      assert.equal(installedArtifacts.effective().some(manifest => manifest.plugin_id === closed.pluginId), false);
      assert.equal(installedArtifacts.known().has(closed.pluginId), false);
      assert.equal(installedArtifacts.known().has(open.pluginId), true);
      assert.equal(await open.options.actions.client.invoke(asUser(open.options.project_id), open.action, {}), `hello from ${open.pluginId}`);
    } finally {
      const cleanup = await Promise.allSettled(items.map(async item => {
        try {
          await item.platform.closeCoordination();
          if (item.store.db.open) for (const record of item.platform.runtime.list()) {
            if (record.state === "running") await item.platform.runtime.stop(record.install_id);
          }
        } finally { item.store.close(); }
      }));
      for (const result of cleanup) if (result.status === "rejected") throw result.reason;
    }
    assert.deepEqual(installedArtifacts.effective().map(manifest => manifest.plugin_id).sort(), before.effective);
    assert.deepEqual([...installedArtifacts.known()].sort(), before.known, "both project watches have been removed");
  }));

test("a plugin platform takes a position on its Home: a Home it reaches or null; a caller that says nothing is refused, and the Home is not called while a plugin starts",
  withDirectory(async directory => {
    const silent = platformParts(directory);
    try {
      assert.throws(() => createPluginPlatform(silent.options as never), /Home/);
    } finally { silent.store.close(); }

    let asked = 0;
    const homes: Array<[string, Parameters<typeof createPluginPlatform>[0]["home"]]> = [
      ["null", null], ["a Home", { directory, completeText: () => { asked += 1; return undefined; }, stores: homeStores() }]];
    for (const [name, home] of homes) {
      const item = platformParts(directory);
      try {
        const platform = createPluginPlatform({ ...item.options, home });
        assert.deepEqual((await platform.start([{ definition: probe() }])).running, [PROBE], `a platform whose Home is ${name} runs a plugin`);
      } finally { item.store.close(); }
    }
    assert.equal(asked, 0, "the model injection is read when a call needs it, not when a plugin starts");
  }));

test("a plugin id may appear once in a start list: a fixture cannot stand in for a plugin the Host ships, and nothing of a refused list starts",
  withDirectory(async directory => {
    const item = platformParts(directory);
    try {
      const platform = createPluginPlatform({ ...item.options, home: null });
      await assert.rejects(platform.start([{ definition: probe(), trust: { level: "host" } }, { definition: probe({ signature: "a-second-copy" }) }]),
        new RegExp(PROBE.replaceAll(".", "\\.")));
      assert.deepEqual(platform.supervisor.states(), []);
    } finally { item.store.close(); }
  }));

test("a fixture given to a Host starts in the project's platform beside the shipped plugins, answers through the Host's action client, and is not a shipped plugin",
  withDirectory(async directory => {
    const { home, projects: [reference] } = await homeWithProjects(directory, "夹具");
    const host = fixtured(home, probe());
    try {
      const rows = await pluginsSeen(host, reference!, PROBE, SHIPPED);
      const own = rows.filter(row => row.provider.plugin_id === PROBE);
      assert.deepEqual(own.map(row => [row.capability_id, row.availability.available]), [[`${PROBE}.hello`, true]]);
      assert.ok(rows.some(row => row.provider.plugin_id === SHIPPED), "the shipped plugins still start");
      // Not on the Host's own start list, so it is the installation that answers, not the plugin id a shipped plugin would carry.
      assert.notEqual(own[0]!.provider.provider_id, PROBE);
      assert.equal(own[0]!.provider.provider_id, own[0]!.provider.plugin_install_id);
      assert.equal(await host.actionClient(reference!).invoke(asUser(reference!.project_id), hello(PROBE), {}), `hello from ${PROBE}`);
    } finally { await host.close(); }
  }));

test("fixtures belong to the Home of the Host that was given them: another Home's Host does not get them, and neither does the Host that comes after one that closed",
  withDirectory(async directory => {
    const { home: first, projects: [a1, a2, a3] } = await homeWithProjects(directory, "甲一", "甲二", "甲三");
    const { home: second, projects: [b1] } = await homeWithProjects(directory, "乙一");
    const ids = async (host: MolisWorkLocalHost, reference: { project_id: string; storage_key: string }) =>
      [...new Set((await pluginsSeen(host, reference, PROBE, SECOND)).map(row => row.provider.plugin_id))];
    const hostB = fixtured(second);
    try {
      const hostA = fixtured(first, probe());
      try {
        assert.deepEqual(await ids(hostA, a1!), [PROBE]);
        assert.deepEqual(await ids(hostB, b1!), [], "another Home's Host was not given it");
      } finally { await hostA.close(); }
      const hostC = fixtured(first, probe({ pluginId: SECOND, signature: "fixture-second" }));
      try {
        assert.deepEqual(await ids(hostC, a2!), [SECOND], "the Host that follows has its own fixtures, not those of the one that closed");
      } finally { await hostC.close(); }
      const hostD = fixtured(first);
      try {
        assert.deepEqual(await ids(hostD, a3!), [], "a Host given none does not inherit the fixtures of one that closed");
      } finally { await hostD.close(); }
    } finally { await hostB.close(); }
  }));

test("a fixture that cannot run the way the Host runs a plugin stops the project's platform, instead of the test going on without the plugin it asked for",
  withDirectory(async directory => {
    const { home, projects: [named, sandboxed] } = await homeWithProjects(directory, "同名", "沙箱");
    const shipping = fixtured(home, probe({ pluginId: SHIPPED, signature: "an-unsigned-copy" }));
    try {
      assert.deepEqual(await pluginsSeen(shipping, named!, PROBE, SHIPPED), [], "named like a shipped plugin: it neither replaces the shipped one nor runs beside it");
    } finally { await shipping.close(); }
    const sandbox = fixtured(home, probe({ execution: "sandbox" }));
    try {
      assert.deepEqual(await pluginsSeen(sandbox, sandboxed!, PROBE, SHIPPED), [], "a sandboxed definition is not a plugin the Host runs itself");
    } finally { await sandbox.close(); }
  }));
