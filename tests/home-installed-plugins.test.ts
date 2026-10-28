import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HomeConsentLedger, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher } from "./fixtures/sandbox-package.js";
import { APPROVED, SECOND_PLUGIN_ID, fixture, homePackage, mac, operate, operationsOf, person, ref, refused, valuesOf } from "./fixtures/home-sandbox.js";
import { openTestHome } from "./fixtures/test-home.js";

/** A Home package that is already installed refuses a second confirmation with the declared state code and a pointed message. */
const describeInstallResult = (result: unknown): string => result instanceof ActionError
  ? `ActionError ${result.code}: ${result.message}`
  : result instanceof Error ? `${result.name}: ${result.message}` : `value ${JSON.stringify(result)}`;
/** The refusal the task asks for: its declared code, and a message that tells the person to uninstall first. */
const refusedInstalledHomePackage = (result: unknown): boolean => result instanceof ActionError && result.code === "plugin.state_invalid" && /先卸载/.test(result.message);

// BL-628 (S-80, S-84, S-91; specs/repository-anti-corruption/slices/bl628-sandboxed-home-plugins.md): a signed package whose Manifest says
// `runtime: { scope: "home" }` is installed in the Home: one sandboxed instance every project shares, started and recovered by the Home's
// plugin host, offered through the Home's action service, reachable from every project unless it hides it, and removed by the same lifecycle
// a project's packages have.

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

test("RAC-968 a running Home package is reached from every project unless the project hides it, and stopping it ends it everywhere", mac, async t => {
  const home = await openTestHome(t);
  const one = await home.createProject("One"), two = await home.createProject("Two");
  const clientOf = (project: typeof one) => home.host.actionClient(project.reference);
  const callerOf = (project: typeof one): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] });
  const installer = home.host.actionClient(one.reference);
  const preview = await installer.invoke(person(one.project_id), ref(pluginInstallActions.preview), { bundle: homePackage() }) as { preview_id: string };
  await installer.invoke(person(one.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const add = async (project: typeof one, text: string) => operate(clientOf(project), callerOf(project), await operationsOf(clientOf(project), callerOf(project)), "notes.add", { text });

  assert.equal(await add(one, "from one"), true);
  assert.equal(await add(two, "from two"), true, "a project that never installed anything reaches the same instance");
  const projectPlugins = `/api/settings/projects/${encodeURIComponent(one.project_id)}/plugins`;
  await home.web.delete(projectPlugins, { plugin_id: PACKAGE_PLUGIN_ID });
  await assert.rejects(add(one, "hidden"), refused("actions.plugin_disabled"), "the project that hid it does not reach it");
  assert.equal(await add(two, "still reached"), true, "hiding is the project's own");
  await home.web.post(projectPlugins, { plugin_id: PACKAGE_PLUGIN_ID });
  assert.equal(await add(one, "shown again"), true);

  const disable = await home.web.post<{ disabled: boolean }>(`/api/plugins/${PACKAGE_PLUGIN_ID}/disable`, {});
  assert.equal(disable.disabled, true);
  for (const project of [one, two]) assert.deepEqual(await operationsOf(clientOf(project), callerOf(project)), [], "no project is offered the actions of a stopped package");
  assert.equal(home.host.homePlugins!.outsideBuild().includes(PACKAGE_PLUGIN_ID), false);
  assert.equal((await home.web.post<{ enabled: boolean }>(`/api/plugins/${PACKAGE_PLUGIN_ID}/enable`, {})).enabled, true);
  assert.equal(await add(two, "back"), true);
});

test("RAC-970 RAC-971 a Home package is switched and removed by the install lifecycle: prompts, approval and exposure go with it, kept data comes back, discarded data does not", mac, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Lifecycle");
  const client = home.host.actionClient(project.reference), caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] };
  const bundle = homePackage(newPublisher(), { prompt: true });
  const install = async () => {
    const preview = await client.invoke(person(project.project_id), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string };
    await client.invoke(person(project.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  };
  const promptState = async () => {
    const { prompts } = await home.web.get<{ prompts: Array<{ source: { kind: string; plugin_id?: string; state?: string } }> }>("/api/agent-definitions/prompts");
    return prompts.filter(prompt => prompt.source.kind === "plugin" && prompt.source.plugin_id === PACKAGE_PLUGIN_ID).map(prompt => prompt.source.state);
  };
  const approvalKeys = () => valuesOf(home.home, "agent-studio:~home").filter(key => key.startsWith(APPROVED));
  const lifecycle = home.host.homePlugins!;

  await install();
  const installId = lifecycle.installation(PACKAGE_PLUGIN_ID)!.install_id;
  assert.deepEqual(await promptState(), ["enabled"], "its prompts are registered under the Home");
  assert.deepEqual(approvalKeys(), [APPROVED + PACKAGE_PLUGIN_ID], "the person's approval is kept in the Home's store, not in a project's");
  await operate(client, caller, await operationsOf(client, caller), "notes.add", { text: "kept" });

  await home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/disable`, {});
  assert.deepEqual(await promptState(), ["disabled"]);
  await home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/enable`, {});
  assert.deepEqual(await promptState(), ["enabled"]);

  // Removed with its data kept: nothing of the Host's is left, the data is, and the same installation takes it back.
  assert.deepEqual(await home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/uninstall`, { keep_data: true }), { uninstalled: true });
  assert.equal(lifecycle.hasPackage(PACKAGE_PLUGIN_ID), false);
  assert.deepEqual(await operationsOf(client, caller), []);
  assert.deepEqual(await promptState(), []);
  assert.deepEqual(approvalKeys(), []);
  assert.ok(valuesOf(home.home, installId).length > 0, "the data the person asked to keep is kept");
  assert.equal(home.host.homePlugins!.outsideBuild().includes(PACKAGE_PLUGIN_ID), false);
  assert.equal(new HomeConsentLedger(home.home).publishers().length, 1, "the publisher's pin is the person's trust in the publisher, not the plugin's");
  assert.equal(readdirSync(join(home.home, "plugin-packages")).length, 1, "the kept package stays for a reinstall");

  await install();
  assert.equal(lifecycle.installation(PACKAGE_PLUGIN_ID)!.install_id, installId, "a reinstall that keeps data is the same installation");
  assert.deepEqual(await operate(client, caller, await operationsOf(client, caller), "notes.list", {}), [{ id: "1", text: "kept" }]);

  // Removed with its data discarded: the data goes too.
  await home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/uninstall`, { keep_data: false });
  assert.deepEqual(valuesOf(home.home, installId), []);
  assert.deepEqual(approvalKeys(), []);
  await install();
  assert.deepEqual(await operate(client, caller, await operationsOf(client, caller), "notes.list", {}), [], "a fresh installation starts empty");
});
test("RAC-1505 RAC-1506 RAC-1507 a Home package already installed refuses a second confirmation with plugin.state_invalid and changes nothing", mac, async t => {
  const h = await fixture(t), publisher = newPublisher(), first = homePackage(publisher);
  await h.install(first);
  const installation = () => h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!;
  const approvals = () => valuesOf(h.home, "agent-studio:~home").filter(key => key.startsWith(APPROVED));
  const observed = (error: unknown) => ({ unavailable: error instanceof ActionError ? error.code : String(error) });
  const notes = async () => operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), "notes.list", {}).catch(observed);
  const readState = async () => ({
    install_id: installation().install_id,
    version: installation().version,
    state: installation().state,
    approvals: approvals(),
    publishers: h.ledger.publishers().length,
    has_package: h.host.homePlugins!.hasPackage(PACKAGE_PLUGIN_ID),
    notes: await notes(),
  });
  await operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), "notes.add", { text: "kept" });
  const installed = await readState();
  // Both refusals are collected as values first, and the guardrail state is read after each one, so one
  // failing code assertion cannot hide the other scenario or the state that RAC-1507 has to report.
  const newerResult = await h.install(homePackage(publisher, { version: "1.1.0" })).catch(error => error);
  const afterNewer = await readState();
  const sameResult = await h.install(first).catch(error => error);
  const afterSame = await readState();
  const actionResult = await operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), "notes.add", { text: "after" }).then(value => ({ value }), observed);
  const afterActions = await readState();

  assert.equal(installed.version, "1.0.0", "the test starts from a genuinely installed 1.0.0 Home package");
  assert.equal(installed.state, "running", "the package is genuinely running before the refusals");
  assert.equal(installed.has_package, true, "the installed package is there before the refusals");
  assert.ok(installed.approvals.length >= 1, "the Home holds the person's approval before the refusals");
  assert.deepEqual(installed.notes, [{ id: "1", text: "kept" }], "the data written before the refusals is there");

  assert.deepEqual(afterNewer, installed, `RAC-1507: a refused newer version must change nothing (got ${JSON.stringify(afterNewer)})`);
  assert.deepEqual(afterSame, installed, `RAC-1507: the second refusal must change nothing (got ${JSON.stringify(afterSame)})`);
  assert.equal("unavailable" in actionResult, false, `RAC-1507: the package still answers actions after the refusals (got ${JSON.stringify(actionResult)})`);
  assert.deepEqual(afterActions.notes, [{ id: "1", text: "kept" }, { id: "2", text: "after" }], "RAC-1507: the data written after the refusals is read back");

  assert.deepEqual(
    [refusedInstalledHomePackage(newerResult), refusedInstalledHomePackage(sameResult)],
    [true, true],
    `RAC-1505/RAC-1506: both confirmations must be refused with plugin.state_invalid and tell the person to uninstall first; got ${describeInstallResult(newerResult)} | ${describeInstallResult(sameResult)}`,
  );
});


test("RAC-970 only a package installed in the Home can be removed through the Home's plugin route; a plugin of the Host's build cannot", mac, async t => {
  const home = await openTestHome(t);
  const builtIn = (await home.host.homePlugins!.ready()).runtime.list().find(record => record.publisher_trust === "host" && record.state === "running")!;
  await assert.rejects(home.web.post(`/api/plugins/${builtIn.plugin_id}/uninstall`, { keep_data: false }), (error: { status?: number }) => error.status === 404);
  assert.equal(home.host.homePlugins!.installation(builtIn.plugin_id)?.state, "running", "it is still installed");
});

test("RAC-972 deleting a project changes nothing of a Home package: the instance runs on, its data stays, and the other projects reach it", mac, async t => {
  const home = await openTestHome(t);
  const doomed = await home.createProject("Doomed"), kept = await home.createProject("Kept");
  const clientOf = (project: typeof kept) => home.host.actionClient(project.reference);
  const callerOf = (project: typeof kept): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] });
  const preview = await clientOf(doomed).invoke(person(doomed.project_id), ref(pluginInstallActions.preview), { bundle: homePackage() }) as { preview_id: string };
  await clientOf(doomed).invoke(person(doomed.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const call = async (project: typeof kept, localId: string, input: unknown) => operate(clientOf(project), callerOf(project), await operationsOf(clientOf(project), callerOf(project)), localId, input);
  await call(doomed, "notes.add", { text: "written while the doomed project was open" });
  const installId = home.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.install_id;

  await home.web.post(`/api/settings/projects/${doomed.project_id}/delete`, { delete_confirmed: true, idempotency_key: "bl628-delete" });
  assert.equal(home.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "running", "the Home instance is still running");
  assert.equal(home.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.install_id, installId);
  assert.deepEqual(await call(kept, "notes.list", {}), [{ id: "1", text: "written while the doomed project was open" }], "its data is the Home's, not the doomed project's");
  assert.ok(valuesOf(home.home, installId).length > 0);
  assert.equal(home.host.homePlugins!.packageError(PACKAGE_PLUGIN_ID), undefined);
});
