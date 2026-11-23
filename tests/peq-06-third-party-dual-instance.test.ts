import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginManifest, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { effectsFromContract, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { pluginComponentChoices, type PluginComponentPlan } from "@molis-ai/molis-work-design-system";
import { pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { newPublisher, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { fixture, mac, operate, operationsOf, person, ref, refused } from "./fixtures/home-sandbox.js";
import { serveTestHost } from "./fixtures/test-home.js";

// PEQ-06 (S-48, S-80, S-87): signed pinned third-party sandbox packages can declare dual-instance
// (`runtime: { scope: "home", dual_instance: true }`), running one shared Home half and isolated
// per-project halves with disjoint operations, S-48 Home permission ceiling, and S-87 revocation.

const DUAL_PLUGIN_ID = "com.example.dual-notes";
const HOME_SCHEMA = "CREATE TABLE home_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);";
const PROJECT_SCHEMA = "CREATE TABLE dual_tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL);";
const HOME_DB_PERMS = ["storage:private", "home-database:read", "home-database:write"];
const PROJECT_DB_PERMS = ["storage:private"];

const DUAL_CODE = `export const operations = {
  'home.add': async (input, sdk) => {
    await sdk.homeDatabase.transaction([{ sql: 'INSERT INTO home_notes(text) VALUES (?)', parameters: [input.text] }]);
    return true;
  },
  'home.list': async (_input, sdk) => {
    const rows = await sdk.homeDatabase.all('SELECT CAST(id AS TEXT) AS id, text FROM home_notes ORDER BY id');
    return rows.map(row => ({ id: String(row.id), text: String(row.text) }));
  },
  'project.add': async (input, sdk) => {
    await sdk.projectDatabase.transaction([{ sql: 'INSERT INTO dual_tasks(title) VALUES (?)', parameters: [input.title] }]);
    return true;
  },
  'project.list': async (_input, sdk) => {
    const rows = await sdk.projectDatabase.all('SELECT CAST(id AS TEXT) AS id, title FROM dual_tasks ORDER BY id');
    return rows.map(row => ({ id: String(row.id), title: String(row.title) }));
  },
  'project.ping': async () => 'ok',
};
`;

function dualPackage(
  publisher = newPublisher(),
  options: { pluginId?: string; version?: string; extraOptionalNetwork?: boolean } = {},
): PluginPackageBundle {
  return signedPackage(publisher, (files: PackageFiles, manifest: PluginManifest) => {
    const contract: SandboxPluginContract = {
      version: 1,
      pluginId: manifest.plugin_id,
      revision: "dual-v1",
      entities: [],
      acceptance: [],
      operations: [
        {
          id: "home.add", kind: "command",
          input: { type: "object", properties: { text: { type: "string", maxLength: 200 } }, required: ["text"], additionalProperties: false },
          output: { type: "boolean" }, errors: [],
          effects: { homeDatabase: ["read", "write"] },
          examples: [{ input: { text: "hello" }, output: true }],
        },
        {
          id: "home.list", kind: "query",
          input: { type: "object", properties: {}, required: [], additionalProperties: false },
          output: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"], additionalProperties: false } },
          errors: [],
          effects: { homeDatabase: ["read"] },
          examples: [{ input: {}, output: [] }],
        },
        {
          id: "project.add", kind: "command",
          input: { type: "object", properties: { title: { type: "string", maxLength: 200 } }, required: ["title"], additionalProperties: false },
          output: { type: "boolean" }, errors: [],
          effects: { projectDatabase: ["read", "write"] },
          examples: [{ input: { title: "task" }, output: true }],
        },
        {
          id: "project.list", kind: "query",
          input: { type: "object", properties: {}, required: [], additionalProperties: false },
          output: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } }, required: ["id", "title"], additionalProperties: false } },
          errors: [],
          effects: { projectDatabase: ["read"] },
          examples: [{ input: {}, output: [] }],
        },
        ...(options.extraOptionalNetwork ? [{
          id: "project.ping", kind: "query" as const,
          input: { type: "object", properties: {}, required: [], additionalProperties: false },
          output: { type: "string" }, errors: [],
          effects: { projectDatabase: ["read" as const], networkDomains: ["dual.example"] },
          examples: [{ input: {}, output: "ok" }],
        }] : []),
      ],
      pages: [{ id: "home", title: "双实例笔记", regions: [{ id: "main", title: "主区", operationIds: ["home.list", "home.add", "project.list", "project.add", ...(options.extraOptionalNetwork ? ["project.ping"] : [])] }] }],
    };
    const rebuilt = sandboxPluginManifest({
      pluginId: manifest.plugin_id,
      name: "Dual Notes",
      version: manifest.version,
      publisher: manifest.publisher,
      presentation: false,
      runtime: { scope: "home", dual_instance: true },
      upgradesFrom: ["1.0.0"],
      effects: effectsFromContract(contract),
      homeDatabase: { version: 1, schema: HOME_SCHEMA },
      projectDatabase: { version: 1, schema: PROJECT_SCHEMA },
    });
    Object.assign(manifest, rebuilt);
    const parts: PluginComponentPlan[] = [
      { id: "title", pageId: "home", regionId: "main", intent: "heading", purpose: "说明双实例插件", props: { title: "双实例笔记" } },
    ];
    const nodes = parts.map(part => ({ ...part, kind: pluginComponentChoices(part, contract)[0]!.kind }));
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = DUAL_CODE;
    files[SANDBOX_PACKAGE_FILES.interface] = JSON.stringify({ parts, nodes });
  }, { pluginId: options.pluginId ?? DUAL_PLUGIN_ID, version: options.version ?? "1.0.0" });
}

test("PEQ-06 S-48 S-80 S-87 a signed third-party dual-instance package shares its Home half, isolates project halves, honors Home permission ceiling, and stops on revocation", mac, async t => {
  const h = await fixture(t);
  const served = await serveTestHost(null, { home: h.home, host: h.host });
  t.after(() => served.close());
  const projectA = await served.createProject("Dual A");
  const projectB = await served.createProject("Dual B");
  const publisher = newPublisher();
  const bundle = dualPackage(publisher, { extraOptionalNetwork: true });

  // Preview reports dual_instance: true and Home scope.
  const clientA = h.host.actionClient(projectA.reference);
  const previewA = await clientA.invoke(person(projectA.project_id), ref(pluginInstallActions.preview), { bundle }) as {
    preview_id: string; runtime_scope: string; dual_instance?: boolean;
  };
  assert.equal(previewA.runtime_scope, "home");
  assert.equal(previewA.dual_instance, true);

  // Confirm in Project A installs BOTH Home half and Project A half.
  await clientA.invoke(person(projectA.project_id), ref(pluginInstallActions.confirm), {
    preview_id: previewA.preview_id, consent: true, pin_label: "Dual publisher",
  });
  const homeInstall = h.host.homePlugins!.installation(DUAL_PLUGIN_ID);
  assert.ok(homeInstall && homeInstall.state === "running", "Home half is running");
  assert.equal(h.host.homePlugins!.dualInstance(DUAL_PLUGIN_ID), true);

  // Operations are disjoint per half: Home exposes home.*, Project A exposes project.*.
  const homeCaller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: HOME_DB_PERMS };
  const projectACaller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectA.project_id, permissions: PROJECT_DB_PERMS };
  const homeViews = await operationsOf(h.homeClient(), homeCaller, DUAL_PLUGIN_ID);
  const projectAViews = await operationsOf(clientA, projectACaller, DUAL_PLUGIN_ID);
  assert.deepEqual(homeViews.map(v => v.action.local_id).sort(), ["home.add", "home.list"]);
  assert.deepEqual(projectAViews.map(v => v.action.local_id).sort(), ["project.add", "project.list", "project.ping"]);

  // Enable optional home-database permissions on Home; write and read both halves.
  await h.switchOn(DUAL_PLUGIN_ID, "home-database:read", "home-database:write");
  assert.equal(await operate(h.homeClient(), homeCaller, homeViews, "home.add", { text: "shared-from-home" }), true);
  assert.deepEqual(await operate(h.homeClient(), homeCaller, homeViews, "home.list", {}), [{ id: "1", text: "shared-from-home" }]);
  assert.equal(await operate(clientA, projectACaller, projectAViews, "project.add", { title: "task-in-A" }), true);
  assert.deepEqual(await operate(clientA, projectACaller, projectAViews, "project.list", {}), [{ id: "1", title: "task-in-A" }]);

  // Install the same version into Project B: Home half is reused, Project B gets an isolated project DB.
  const clientB = h.host.actionClient(projectB.reference);
  const previewB = await clientB.invoke(person(projectB.project_id), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; dual_instance?: boolean };
  assert.equal(previewB.dual_instance, true);
  await clientB.invoke(person(projectB.project_id), ref(pluginInstallActions.confirm), { preview_id: previewB.preview_id, consent: true });
  assert.equal(h.host.homePlugins!.installation(DUAL_PLUGIN_ID)?.install_id, homeInstall.install_id, "Home half reused without reinstalling");

  const projectBCaller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectB.project_id, permissions: PROJECT_DB_PERMS };
  const projectBViews = await operationsOf(clientB, projectBCaller, DUAL_PLUGIN_ID);
  assert.deepEqual(await operate(clientB, projectBCaller, projectBViews, "project.list", {}), [], "Project B has isolated empty project DB");
  assert.equal(await operate(clientB, projectBCaller, projectBViews, "project.add", { title: "task-in-B" }), true);
  assert.deepEqual(await operate(clientB, projectBCaller, projectBViews, "project.list", {}), [{ id: "1", title: "task-in-B" }]);
  assert.deepEqual(await operate(clientA, projectACaller, projectAViews, "project.list", {}), [{ id: "1", title: "task-in-A" }], "Project A untouched");
  assert.deepEqual(await operate(h.homeClient(), homeCaller, homeViews, "home.list", {}), [{ id: "1", text: "shared-from-home" }], "Home data still shared");

  // S-48 optional permission ceiling: project half cannot enable an optional permission Home does not hold.
  const projectInstalled = await clientA.invoke(person(projectA.project_id), ref(pluginInstallActions.installed), {}) as {
    plugins: Array<{ install_id: string; plugin_id: string }>;
  };
  const projectAInstall = projectInstalled.plugins.find(row => row.plugin_id === DUAL_PLUGIN_ID);
  assert.ok(projectAInstall, "Project A lists dual-instance installation");
  await assert.rejects(
    served.web.post(`/projects/${encodeURIComponent(projectA.project_id)}/api/plugin-trust/permissions/set`, {
      install_id: projectAInstall.install_id, permission: "network:request", granted: true,
    }),
    (error: { code?: string }) => error?.code === "plugin.grant_denied",
    "S-48: project half cannot grant an optional permission that Home does not hold",
  );

  // S-48 live ceiling tightening: enable network:request on Home + Project A, then revoke on Home -> Project A project.ping is immediately refused.
  await served.web.post("/api/settings/plugin-permissions/set", {
    install_id: homeInstall.install_id, permission: "network:request", granted: true,
  });
  await served.web.post(`/projects/${encodeURIComponent(projectA.project_id)}/api/plugin-trust/permissions/set`, {
    install_id: projectAInstall.install_id, permission: "network:request", granted: true,
  });
  const viewsWithNetwork = await operationsOf(clientA, projectACaller, DUAL_PLUGIN_ID);
  assert.equal(await operate(clientA, projectACaller, viewsWithNetwork, "project.ping", {}), "ok", "project.ping runs while both Home and Project A hold network:request");
  await served.web.post("/api/settings/plugin-permissions/set", {
    install_id: homeInstall.install_id, permission: "network:request", granted: false,
  });
  await assert.rejects(
    operate(clientA, projectACaller, viewsWithNetwork, "project.ping", {}),
    (error: { code?: string }) => ["actions.plugin_permission", "actions.forbidden", "actions.plugin_unavailable", "actions.missing"].includes(error?.code ?? ""),
    "S-48: revoking Home optional permission immediately blocks Project A operation",
  );
  const viewsAfterNetworkRevoke = await operationsOf(clientA, projectACaller, DUAL_PLUGIN_ID);
  assert.equal(viewsAfterNetworkRevoke.some(view => view.capability_id.endsWith(".project.ping") && view.availability.available), false,
    "S-48: project.ping is no longer available after Home revokes network:request");
  assert.deepEqual(await operate(clientA, projectACaller, viewsAfterNetworkRevoke, "project.list", {}), [{ id: "1", title: "task-in-A" }],
    "project.list still works after Home revokes only network:request");

  // Disabling Home half immediately stops and blocks Project A half; re-enabling Home half restores Project A half.
  await served.web.post("/api/settings/plugin-permissions/disable", { plugin_id: DUAL_PLUGIN_ID });
  assert.equal(h.host.homePlugins!.installation(DUAL_PLUGIN_ID)?.state, "disabled");
  await assert.rejects(
    operate(clientA, projectACaller, projectAViews, "project.list", {}),
    "disabling Home half immediately blocks Project A operations",
  );
  await served.web.post("/api/settings/plugin-permissions/enable", { plugin_id: DUAL_PLUGIN_ID });
  const viewsAfterEnable = await operationsOf(clientA, projectACaller, DUAL_PLUGIN_ID);
  assert.deepEqual(await operate(clientA, projectACaller, viewsAfterEnable, "project.list", {}), [{ id: "1", title: "task-in-A" }], "re-enabling Home half restores Project A operations");
  await served.close();

  // S-48: turning off home-database:write on Home blocks home.add immediately.
  const homePlatform = await h.host.homePlugins!.ready();
  await homePlatform.runtime.regrant(homeInstall.install_id, "home-database:write", false);
  await assert.rejects(operate(h.homeClient(), homeCaller, homeViews, "home.add", { text: "blocked" }));

  // S-80: dual-instance scope cannot be changed to project-only under the same plugin_id.
  const projectOnly = signedPackage(publisher, undefined, { pluginId: DUAL_PLUGIN_ID, version: "1.1.0" });
  await assert.rejects(clientA.invoke(person(projectA.project_id), ref(pluginInstallActions.preview), { bundle: projectOnly }), refused("plugin.declaration_invalid"));

  // S-87: revoking the publisher stops BOTH Home half and Project halves on reopen while keeping stored data.
  await h.host.close();
  assert.ok(h.ledger.revokePublisher(publisher.identity, "2026-11-19T00:00:00.000Z")?.revoked_at);
  await h.reopen();
  assert.equal(h.host.homePlugins!.packageError(DUAL_PLUGIN_ID, "code"), "plugin.publisher_revoked");
  assert.notEqual(h.host.homePlugins!.installation(DUAL_PLUGIN_ID)?.state, "running");
  assert.deepEqual(await operationsOf(h.homeClient(), homeCaller, DUAL_PLUGIN_ID), []);
  assert.deepEqual(await operationsOf(h.host.actionClient(projectA.reference), projectACaller, DUAL_PLUGIN_ID), []);
});
