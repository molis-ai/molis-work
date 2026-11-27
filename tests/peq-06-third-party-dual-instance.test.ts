import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginManifest, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { SandboxPluginContract, SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { effectsFromContract, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { pluginComponentChoices, type PluginComponentPlan } from "@molis-ai/molis-work-design-system";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { partitionRoot } from "@molis-ai/molis-work-module-projects";
import { attachConversationFile, holdsConversationAttachment, pluginInstallActions, readSandboxPackage, sandboxImageNamespace, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
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

const dualCode = (network: boolean) => `export const operations = {
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
  'common.sample': async () => [{ id: 'example', title: 'Sample note' }],
  'project.list': async (_input, sdk) => {
    const rows = await sdk.projectDatabase.all('SELECT CAST(id AS TEXT) AS id, title FROM dual_tasks ORDER BY id');
    return rows.map(row => ({ id: String(row.id), title: String(row.title) }));
  },
  ${network ? "'project.ping': async () => 'ok'," : ""}
};
`;

function dualPackage(
  publisher = newPublisher(),
  options: { pluginId?: string; version?: string; extraOptionalNetwork?: boolean; upgradesFrom?: string[]; freshDatabase?: boolean; projectConflict?: boolean } = {},
): PluginPackageBundle {
  return signedPackage(publisher, (files: PackageFiles, manifest: PluginManifest) => {
    const listInput: SandboxSchema = { type: "object", properties: {}, required: [], additionalProperties: false };
    const notesOutput: SandboxSchema = { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } }, required: ["id", "title"], additionalProperties: false } };
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
          id: "common.sample", kind: "query", input: listInput, output: notesOutput, effects: {}, errors: [],
          examples: [{ input: {}, output: [{ id: "example", title: "Sample note" }] }],
        },
        {
          id: "project.list", project_instance: true, kind: "query", input: listInput, output: notesOutput,
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
      pages: [{ id: "home", title: "双实例笔记", regions: [{ id: "main", title: "主区", operationIds: ["home.list", "home.add", "project.list", "project.add", "common.sample", ...(options.extraOptionalNetwork ? ["project.ping"] : [])] }] }],
    };
    const rebuilt = sandboxPluginManifest({
      pluginId: manifest.plugin_id,
      name: "Dual Notes",
      version: manifest.version,
      publisher: manifest.publisher,
      presentation: false,
      runtime: { scope: "home", dual_instance: true },
      upgradesFrom: options.upgradesFrom ?? (options.freshDatabase ? [] : ["1.0.0"]),
      effects: effectsFromContract(contract),
      homeDatabase: { version: 1, schema: HOME_SCHEMA + (options.freshDatabase ? "CREATE TABLE new_home_rows(id INTEGER PRIMARY KEY);" : "") },
      projectDatabase: { version: 1, schema: PROJECT_SCHEMA + (options.projectConflict ? "CREATE TABLE project_root(id INTEGER PRIMARY KEY);" : options.freshDatabase ? "CREATE TABLE new_project_rows(id INTEGER PRIMARY KEY);" : "") },
    });
    Object.assign(manifest, rebuilt);
    const parts: PluginComponentPlan[] = [
      ...["project.list", "common.sample"].map(operationId => ({ id: operationId.split(".")[0]!, pageId: "home", regionId: "main",
        intent: "collection" as const, purpose: "Read notes", props: { idField: "id", titleField: "title" }, read: { operationId, input: {} } })),
      { id: "title", pageId: "home", regionId: "main", intent: "heading", purpose: "说明双实例插件", props: { title: "双实例笔记" } },
    ];
    const nodes = parts.map(part => ({ ...part, kind: pluginComponentChoices(part, contract)[0]!.kind }));
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = dualCode(options.extraOptionalNetwork === true);
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
  assert.deepEqual(homeViews.map(v => v.action.local_id).sort(), ["common.sample", "home.add", "home.list"]);
  assert.deepEqual(projectAViews.map(v => v.action.local_id).sort(), ["common.sample", "project.add", "project.list", "project.ping"]);

  // Enable optional home-database permissions on Home; write and read both halves.
  await h.switchOn(DUAL_PLUGIN_ID, "home-database:read", "home-database:write");
  assert.equal(await operate(h.homeClient(), homeCaller, homeViews, "home.add", { text: "shared-from-home" }), true);
  assert.deepEqual(await operate(h.homeClient(), homeCaller, homeViews, "home.list", {}), [{ id: "1", text: "shared-from-home" }]);
  assert.equal(await operate(clientA, projectACaller, projectAViews, "project.add", { title: "task-in-A" }), true);
  assert.deepEqual(await operate(clientA, projectACaller, projectAViews, "project.list", {}), [{ id: "1", title: "task-in-A" }]);

  // PSD-03: the signed page and its actual call route agree about the selected instance.
  for (const prefix of ["", "/projects/" + projectA.project_id]) {
    const frameUrl = new URL(prefix + "/plugins/" + DUAL_PLUGIN_ID + "?frame=workbench", served.origin);
    if (prefix) {
      const { plugins } = await served.web.get<{ plugins: PluginInstalledView[] }>(prefix + "/api/plugin-trust/overview");
      const installation = plugins.find(item => item.plugin_id === DUAL_PLUGIN_ID)?.uninstall_target;
      assert.ok(installation);
      frameUrl.searchParams.set("installation", JSON.stringify({ scope: "project", ...installation }));
    }
    const frame = await fetch(frameUrl);
    assert.equal(frame.status, 200);
    const html = await frame.text();
    const pageId = /"page_id":"([^"]+)"/u.exec(html)?.[1];
    const connected = /"connected":(\[[^\]]*\])/u.exec(html)?.[1];
    assert.ok(pageId && connected, "the installed page supplies its own identity and connected operations");
    const available: string[] = JSON.parse(connected);
    assert.ok(available.includes("common.sample"));
    assert.equal(available.includes("project.list"), Boolean(prefix));
    const read = (componentId: string) => fetch(served.origin + prefix + "/api/plugins/" + DUAL_PLUGIN_ID + "/call", {
      method: "POST", headers: { origin: served.origin, "content-type": "application/json", "x-molis-plugin-page": pageId,
        "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ componentId, binding: "read", payload: {} }),
    });
    const common = await read("common");
    assert.equal(common.status, 200);
    assert.deepEqual(await common.json(), { value: [{ id: "example", title: "Sample note" }] });
    const projectNotes = await read("project");
    if (prefix) {
      assert.equal(projectNotes.status, 200);
      assert.deepEqual(await projectNotes.json(), { value: [{ id: "1", title: "task-in-A" }] });
    } else {
      assert.equal(projectNotes.status, 403);
      assert.equal((await projectNotes.json()).code, "actions.forbidden");
    }
  }

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

  // S-48 optional permission ceiling: project half cannot enable an optional permission Home does not hold,
  // and overview does not lock out project-half toggles as Home-only (`home_managed_install_ids`).
  const overview = await served.web.get<{ plugins: Array<{ install_id: string; plugin_id: string }>; home_managed_install_ids: string[] }>(
    `/projects/${encodeURIComponent(projectA.project_id)}/api/plugin-trust/overview`,
  );
  const projectAInstall = overview.plugins.find(row => row.plugin_id === DUAL_PLUGIN_ID);
  assert.ok(projectAInstall, "Project A lists dual-instance installation");
  assert.equal(overview.home_managed_install_ids.includes(projectAInstall.install_id), false,
    "PEQ-06: signed third-party dual-instance package keeps its project optional permission toggles enabled");
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

  // S-87: revoking the publisher via the settings door blocks live project/Home regrant immediately AND stops BOTH halves on reopen while keeping stored data.
  const servedAfterRevoke = await serveTestHost(null, { home: h.home, host: h.host });
  try {
    const revoked = await servedAfterRevoke.web.post<{ publisher: { revoked_at: string | null } }>("/api/settings/plugin-publishers/revoke", { key_id: publisher.identity });
    assert.ok(revoked.publisher.revoked_at);
    await assert.rejects(
      servedAfterRevoke.web.post(`/projects/${encodeURIComponent(projectA.project_id)}/api/plugin-trust/permissions/set`, {
        install_id: projectAInstall.install_id, permission: "network:request", granted: true,
      }),
      (error: { code?: string }) => error?.code === "plugin.publisher_revoked",
      "S-87: project optional permission regrant is refused once publisher is revoked",
    );
    await assert.rejects(
      servedAfterRevoke.web.post("/api/settings/plugin-permissions/set", {
        install_id: homeInstall.install_id, permission: "network:request", granted: true,
      }),
      (error: { code?: string }) => error?.code === "plugin.publisher_revoked",
      "S-87: Home optional permission regrant is refused once publisher is revoked",
    );
  } finally {
    await servedAfterRevoke.close();
  }
  await h.host.close();
  await h.reopen();
  assert.equal(h.host.homePlugins!.packageError(DUAL_PLUGIN_ID, "code"), "plugin.publisher_revoked");
  assert.notEqual(h.host.homePlugins!.installation(DUAL_PLUGIN_ID)?.state, "running");
  assert.deepEqual(await operationsOf(h.homeClient(), homeCaller, DUAL_PLUGIN_ID), []);
  assert.deepEqual(await operationsOf(h.host.actionClient(projectA.reference), projectACaller, DUAL_PLUGIN_ID), []);
});

test("B47-K4 confirmed dual reinstall clears only its two databases, restoring both if the project cannot start", mac, async t => {
  const h = await fixture(t), served = await serveTestHost(null, { home: h.home, host: h.host });
  t.after(() => served.close());
  const project = (await served.createProject("Reinstall here")).reference;
  const other = await served.createProject("Other project");
  const base = (id: string) => "/projects/" + encodeURIComponent(id) + "/api/plugin-trust";
  const publisher = newPublisher(), original = dualPackage(publisher);
  const preview = (bundle: PluginPackageBundle, id = project.project_id) =>
    served.web.post<{preview_id: string; kept_data_incompatible: boolean}>(base(id) + "/install/preview", { bundle });
  const confirm = (preview_id: string, discard?: boolean, id = project.project_id) =>
    served.web.post<{retained_cleanup_incomplete?: boolean}>(base(id) + "/install/confirm", { preview_id, consent: true, pin_label: "Dual publisher", discard_kept_data: discard });
  const homeCaller = {...h.homeCaller(), permissions: HOME_DB_PERMS};
  const note = async (operation: string, input = {}) =>
    operate(h.homeClient(), homeCaller, await operationsOf(h.homeClient(), homeCaller, DUAL_PLUGIN_ID), operation, input);
  const task = async (place: typeof project, operation: string, input = {}) => {
    const client = h.host.actionClient(place), caller = {...person(place.project_id), permissions: PROJECT_DB_PERMS};
    return operate(client, caller, await operationsOf(client, caller, DUAL_PLUGIN_ID), operation, input);
  };
  const keep = async () => {
    const primary = await served.web.get<{plugins: PluginInstalledView[]}>(base(project.project_id) + "/overview");
    const personal = await served.web.post<{plugins: PluginInstalledView[]}>("/api/settings/plugin-permissions/list", {});
    for (const [url, plugins] of [[base(project.project_id) + "/installed/uninstall", primary.plugins], ["/api/settings/plugin-permissions/uninstall", personal.plugins]] as const) {
      const target = plugins.find(p => p.plugin_id === DUAL_PLUGIN_ID)!.uninstall_target;
      await served.web.post(url, { plugin_id: DUAL_PLUGIN_ID, keep_data: true, target });
    }
  };
  await confirm((await preview(original)).preview_id);
  await h.switchOn(DUAL_PLUGIN_ID, "home-database:read", "home-database:write");
  await note("home.add", { text: "Personal notes" });
  await task(project, "project.add", { title: "Project notes" });
  await confirm((await preview(original, other.project_id)).preview_id, undefined, other.project_id);
  await task(other.reference, "project.add", { title: "Other project" });
  const listHome = async () => (await served.web.post<{plugins: PluginInstalledView[]}>("/api/settings/plugin-permissions/list", {})).plugins.find(p => p.plugin_id === DUAL_PLUGIN_ID)!;
  const installId = (await listHome()).install_id;
  const roots = [h.home, partitionRoot(h.home, project.project_id)].map(root => join(root, "plugin-files", installId));
  for (const root of roots) {
    mkdirSync(root, {recursive: true});
    writeFileSync(join(root, "note"), "Old file");
  }
  const layer = h.host.observation!.layer;
  const fact = DUAL_PLUGIN_ID + ".saved";
  const ctx = {...person(project.project_id), actor_kind: "runtime" as const, audience: "plugin" as const,
    host_plugin: {plugin_id: DUAL_PLUGIN_ID, install_id: installId, actor_id: "notes", project_id: project.project_id,
      declaration: {manifest: readSandboxPackage(original.payload).manifest}, assertActive() {}}};
  await layer.reportAction(() => {}).handler.handle({...ctx, beforeEffect: async () => {}}, {facts: [{fact, outcome: "succeeded"}]});
  const oldReports = () => {
    layer.flush();
    return readRecords(layer.writer.database()!.db, {fact, project_id: project.project_id}).length;
  };
  assert.equal(oldReports(), 1);
  const image = sandboxImageNamespace(installId);
  const connection = withConnectorConnections(h.home, store => {
    const account = store.createToken({serviceId: "image-api", displayName: "Notes", token: "sample-token"});
    store.bind({scopeId: "home", pluginId: image, slotId: "cover", serviceId: "image-api", connectionId: account.connection_id});
    return account.connection_id;
  });
  const bound = () => withConnectorConnections(h.home, store => store.binding("home", image, "cover")?.connection_id);

  await keep();

  const next = dualPackage(publisher, {version: "3.0.0", freshDatabase: true});
  const refusedPreview = await preview(next);
  assert.equal(refusedPreview.kept_data_incompatible, true);
  await assert.rejects(confirm(refusedPreview.preview_id), { code: "plugin.kept_data_incompatible" });
  const conflict = dualPackage(publisher, {version: "2.0.0", freshDatabase: true, projectConflict: true});
  await assert.rejects(confirm((await preview(conflict)).preview_id, true), { code: "actions.execution_failed" });
  for (const root of roots) assert.equal(readFileSync(join(root, "note"), "utf8"), "Old file");
  assert.equal(bound(), connection);
  assert.equal(oldReports(), 1);

  // A protected click still cannot discard data the preview never asked the person to give up.
  const sameEdition = await preview(original);
  assert.equal(sameEdition.kept_data_incompatible, false);
  await assert.rejects(confirm(sameEdition.preview_id, true), { code: "plugin.preview_unknown" });
  // Reopen the old signed edition through the normal door and read both original records.
  await confirm((await preview(original)).preview_id);
  await h.switchOn(DUAL_PLUGIN_ID, "home-database:read", "home-database:write");
  assert.deepEqual(await note("home.list"), [{id: "1", text: "Personal notes"}]);
  assert.deepEqual(await task(project, "project.list"), [{id: "1", title: "Project notes"}]);
  await keep();

  await confirm((await preview(next)).preview_id, true);
  for (const root of roots) assert.equal(existsSync(join(root, "note")), false);
  assert.equal(bound(), undefined);
  assert.equal(oldReports(), 0);

  await h.switchOn(DUAL_PLUGIN_ID, "home-database:read", "home-database:write");
  assert.deepEqual(await note("home.list"), []);
  assert.deepEqual(await task(project, "project.list"), []);
  assert.equal(await note("home.add", {text: "New note"}), true);
  assert.equal(await task(project, "project.add", {title: "New task"}), true);
  assert.deepEqual(await h.host.withProject(other.reference, runtime =>
    runtime.store.db.prepare<[], {title: string}>("SELECT title FROM dual_tasks").all().map(row => row.title)), ["Other project"]);

  // B47-K4: another project kept v1, while the shared Home now runs v3. A bad project replacement must leave v3 serving its notes.
  const otherBase = base(other.project_id);
  const old = (await served.web.get<{plugins: PluginInstalledView[]}>(otherBase + "/overview")).plugins.find(p => p.plugin_id === DUAL_PLUGIN_ID)!;
  await served.web.post(otherBase + "/installed/uninstall", {plugin_id: DUAL_PLUGIN_ID, keep_data: true, target: old.uninstall_target});
  const mixed = (version: string, projectConflict: boolean) => dualPackage(publisher, {version, freshDatabase: true, upgradesFrom: ["3.0.0"], projectConflict});
  const otherPreview = await preview(mixed("4.0.0", true), other.project_id);
  assert.equal(otherPreview.kept_data_incompatible, true);
  await assert.rejects(confirm(otherPreview.preview_id, true, other.project_id), { code: "actions.execution_failed" });
  assert.equal((await listHome()).version, "3.0.0");
  assert.deepEqual(await note("home.list"), [{id: "1", text: "New note"}]);
  assert.deepEqual(await h.host.withProject(other.reference, runtime =>
    runtime.store.db.prepare<[], {title: string}>("SELECT title FROM dual_tasks").all().map(row => row.title)), ["Other project"]);
  const valid = await preview(mixed("5.0.0", false), other.project_id);
  // A late failure in an auxiliary owner leaves both new versions installed and reports the incomplete deletion.
  const owner = {plugin_id: DUAL_PLUGIN_ID, install_id: installId, project_id: other.project_id};
  const attachment = await attachConversationFile(h.home, owner, {file_name: "old.txt", data_base64: Buffer.from("old attachment").toString("base64")});
  const attachments = new DatabaseSync(homeSqlitePath(h.home, "conversation-attachments"));
  try {
    attachments.exec("CREATE TRIGGER hold_old_attachment BEFORE DELETE ON attachments BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END");
    assert.equal((await confirm(valid.preview_id, true, other.project_id)).retained_cleanup_incomplete, true);
    assert.equal(holdsConversationAttachment(h.home, owner, attachment.ref), true);
    attachments.exec("DROP TRIGGER hold_old_attachment");
  } finally { attachments.close(); }
  assert.equal((await listHome()).version, "5.0.0");
  assert.deepEqual(await note("home.list"), [{id: "1", text: "New note"}]);
  assert.deepEqual(await task(other.reference, "project.list"), []);
  const replaced = (await served.web.get<{plugins: PluginInstalledView[]}>(otherBase + "/overview")).plugins.find(p => p.plugin_id === DUAL_PLUGIN_ID)!;
  assert.equal(replaced.version, "5.0.0");
  await served.web.post(otherBase + "/installed/uninstall", {plugin_id: DUAL_PLUGIN_ID, keep_data: false, target: replaced.uninstall_target});
  assert.equal(holdsConversationAttachment(h.home, owner, attachment.ref), false);


});
