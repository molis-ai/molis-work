import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { DEMO_PROJECT_ID, HomeConsentLedger, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, molisWorkHostProjectReference, pluginInstallActions, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { openTestHome } from "./fixtures/test-home.js";

// BL-628 (S-80, S-84, S-91; specs/repository-anti-corruption/slices/bl628-sandboxed-home-plugins.md): a signed package whose Manifest says
// `runtime: { scope: "home" }` is installed in the Home: one sandboxed instance every project shares, started and recovered by the Home's
// plugin host, offered through the Home's action service, reachable from every project unless it hides it, and removed by the same lifecycle
// a project's packages have.

const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
const SECOND_PLUGIN_ID = "io.molis.work.example.second";
const APPROVED = "plugin-builder:agent-studio:approved:";

/** The fixture package, asking for the Home. Its `notes.add` reads the notes it adds to, so the contract says so. */
const homePackage = (publisher = newPublisher(), options: { pluginId?: string; version?: string } = {}): PluginPackageBundle =>
  signedPackage(publisher, (files, manifest) => {
    manifest.runtime = { scope: "home" };
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.find(operation => operation.id === "notes.add")!.effects.storage = ["read", "write"];
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  }, options);
const ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
const person = (projectId: string | null = DEMO_PROJECT_ID): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: PLUGIN_INSTALL_PERMISSIONS,
  user_action: { source: "management", conversation_ref: "bl628:install", message_ref: "bl628:confirm" } });
const operationsOf = async (client: ActionClient, caller: ActionCallContext, pluginId = PACKAGE_PLUGIN_ID) =>
  (await client.discover(caller)).filter(view => view.provider.plugin_id === pluginId);
const operate = (client: ActionClient, caller: ActionCallContext, views: readonly ActionView[], localId: string, input: unknown) => {
  const view = views.find(item => item.action.local_id === localId);
  assert.ok(view, `${localId} is offered`);
  return client.invoke(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input);
};
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

/** A Host on a temporary Home with one project, which can be closed and opened again over the same Home. */
async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "bl628-home-"));
  // The Host makes the Home first: a Home that already holds files is an older one, and its memory is not adopted.
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const databasePath = join(home, "project.sqlite"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const open = async () => { await host.withProject(reference, () => undefined); return host; };
  await open();
  t.after(async () => { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  const install = async (bundle: PluginPackageBundle) => {
    const client = host.actionClient(reference);
    const preview = await client.invoke(person(), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; runtime_scope: string };
    const installed = await client.invoke(person(), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
    return { preview, installed };
  };
  const store = <Result>(read: (db: DatabaseSync) => Result): Result => {
    const db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"), { readOnly: true });
    try { return read(db); } finally { db.close(); }
  };
  return { home, reference, install, store, ledger: new HomeConsentLedger(home), open,
    get host() { return host; },
    async reopen() { await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); await open(); await host.homePlugins!.ready(); return host; },
    homeClient: () => host.homeActionClient(), projectClient: () => host.actionClient(reference), homeCaller: (): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: [] }),
    projectCaller: (): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: DEMO_PROJECT_ID, permissions: [] }) };
}

test("RAC-963 RAC-965 a signed package that writes runtime.scope home previews as home and is installed in the Home Runtime, not in the project", mac, async t => {
  const h = await fixture(t);
  const { preview, installed } = await h.install(homePackage());
  assert.equal(preview.runtime_scope, "home");
  assert.equal((installed as { plugin_id: string }).plugin_id, PACKAGE_PLUGIN_ID);
  const record = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID);
  assert.deepEqual([record?.state, record?.execution, record?.publisher_trust], ["running", "sandbox", "pinned"]);
  assert.equal(h.host.homePlugins!.hasPackage(PACKAGE_PLUGIN_ID), true);
  const project = new DatabaseSync(join(h.home, "project.sqlite"), { readOnly: true });
  try {
    const rows = project.prepare("SELECT record_json FROM plugin_runtime_installs").all().map(row => JSON.parse((row as { record_json: string }).record_json) as { plugin_id: string });
    assert.deepEqual(rows.filter(row => row.plugin_id === PACKAGE_PLUGIN_ID), [], "nothing was installed in the project");
  }
  finally { project.close(); }
  assert.equal(h.ledger.publishers().length, 1, "the publisher is pinned by the same confirmation");
  assert.ok(h.host.homePlugins!.outsideBuild().includes(PACKAGE_PLUGIN_ID), "it is one of the personal plugins every project reaches");
});

test("RAC-965 RAC-969 the package's operations are the Home's actions: the same instance and data from the Home and from a project, and back after a restart", mac, async t => {
  const h = await fixture(t);
  await h.install(homePackage());
  const fromHome = await operationsOf(h.homeClient(), h.homeCaller());
  assert.deepEqual(fromHome.map(view => view.action.scope), ["home", "home"]);
  await operate(h.homeClient(), h.homeCaller(), fromHome, "notes.add", { text: "written in the Home" });
  const fromProject = await operationsOf(h.projectClient(), h.projectCaller());
  assert.deepEqual(fromProject.map(view => view.capability_id).sort(), fromHome.map(view => view.capability_id).sort(), "the project sees the same actions");
  await operate(h.projectClient(), h.projectCaller(), fromProject, "notes.add", { text: "written from a project" });
  assert.deepEqual(await operate(h.homeClient(), h.homeCaller(), fromHome, "notes.list", {}), [{ id: "1", text: "written in the Home" }, { id: "2", text: "written from a project" }]);

  await h.reopen();
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "running", "the Home starts the package again");
  assert.equal(h.host.homePlugins!.packageError(PACKAGE_PLUGIN_ID), undefined);
  const again = await operationsOf(h.homeClient(), h.homeCaller());
  assert.deepEqual((await operate(h.homeClient(), h.homeCaller(), again, "notes.list", {}) as unknown[]).length, 2, "its data is the Home's and survives the restart");
});

test("RAC-965 a package that cannot start leaves its reason with its installation and stops nothing else: the Host starts, the built-in Home plugins and the other package run", mac, async t => {
  const h = await fixture(t);
  await h.install(homePackage());
  await h.install(homePackage(newPublisher(), { pluginId: SECOND_PLUGIN_ID }));
  assert.ok(h.host.homePlugins!.installations().some(record => record.publisher_trust === "host" && record.state === "running"), "the Host's own Home plugins run");
  // Its kept package is gone, as when a Home was copied without it.
  await h.host.close();
  for (const name of readdirSync(join(h.home, "plugin-packages"))) {
    const bundle = JSON.parse(readFileSync(join(h.home, "plugin-packages", name, "bundle.json"), "utf8")) as PluginPackageBundle;
    if (bundle.payload.manifest.plugin_id === PACKAGE_PLUGIN_ID) rmSync(join(h.home, "plugin-packages", name), { recursive: true, force: true });
  }
  await h.reopen();
  assert.match(h.host.homePlugins!.packageError(PACKAGE_PLUGIN_ID) ?? "", /找不到已安装的插件包/);
  assert.equal(h.host.homePlugins!.outsideBuild().includes(PACKAGE_PLUGIN_ID), false, "a package that is not running is not offered to the projects");
  assert.equal(h.host.homePlugins!.installation(SECOND_PLUGIN_ID)?.state, "running", "the other package runs");
  assert.ok(h.host.homePlugins!.installations().some(record => record.publisher_trust === "host" && record.state === "running"), "the built-in Home plugins run");
});
