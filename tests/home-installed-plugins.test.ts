// @requires-platform darwin
import { addProjectPlugin, projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { sandboxPackageBuildId, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HomeConsentLedger, pluginControlActions, pluginInstallActions, homeAgentDefinitions, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, packageMethod, signedAgentPackage, signedPackage } from "./fixtures/sandbox-package.js";
import { APPROVED, SECOND_PLUGIN_ID, fixture, homePackage, mac, operate, operationsOf, person, ref, refused, valuesOf } from "./fixtures/home-sandbox.js";
import { openTestHome } from "./fixtures/test-home.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// All changes precede signing; compatible versions must reach the upgrade path, not fail package validation.
function upgradePackage(publisher: ReturnType<typeof newPublisher>, version = "1.1.0", fail = false) {
  return signedPackage(publisher, (files, manifest) => {
    manifest.runtime = { scope: "home" };
    if (version !== "0.9.0") manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!);
    contract.operations.find((operation: { id: string }) => operation.id === "notes.add").effects.storage = ["read", "write"];
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.prompts] = JSON.stringify([{ id: "new-summary", title: "New summary", purpose: "Summarize", body: "New version summary." }]);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = fail ? "throw new Error('T141 runner startup fault');" : files[SANDBOX_PACKAGE_FILES.entrypoint]!.replace("text: input.text", "text: 'v2:' + input.text");
  }, { version });
}

// BL-628 (S-80, S-84, S-91; specs/archive/repository-anti-corruption/slices/bl628-sandboxed-home-plugins.md): a signed package whose Manifest says
// `runtime: { scope: "home" }` is installed in the Home: one sandboxed instance every project shares, started and recovered by the Home's
// plugin host, offered through the Home's action service, reachable from the projects that enable it, and removed by the same lifecycle
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
  assert.ok(h.host.homePlugins!.outsideBuild().includes(PACKAGE_PLUGIN_ID), "the Host registers the installed package so a partition can enable it");
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

test("RAC-968 each project explicitly enables a running Home package, and stopping its instance ends it everywhere", mac, async t => {
  const home = await openTestHome(t);
  const one = await home.createProject("One"), two = await home.createProject("Two");
  const clientOf = (project: typeof one) => home.host.actionClient(project.reference);
  const callerOf = (project: typeof one): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] });
  const installer = home.host.actionClient(one.reference);
  const preview = await installer.invoke(person(one.project_id), ref(pluginInstallActions.preview), { bundle: homePackage() }) as { preview_id: string };
  await installer.invoke(person(one.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const add = async (project: typeof one, text: string) => operate(clientOf(project), callerOf(project), await operationsOf(clientOf(project), callerOf(project)), "notes.add", { text });

  await assert.rejects(add(one, "before enabling"), refused("actions.plugin_disabled"));
  await addProjectPlugin(home.web, one.project_id, PACKAGE_PLUGIN_ID);
  assert.equal(await add(one, "from one"), true);
  await assert.rejects(add(two, "before enabling"), refused("actions.plugin_disabled"));
  await addProjectPlugin(home.web, two.project_id, PACKAGE_PLUGIN_ID);
  assert.equal(await add(two, "from two"), true, "both enabled projects reach the same Home installation");
  const projectPlugins = `/api/settings/projects/${encodeURIComponent(one.project_id)}/plugins`;
  await home.web.delete(projectPlugins, { plugin_id: PACKAGE_PLUGIN_ID, expected_revision: await projectPluginRevision(home.web, one.project_id) });
  await assert.rejects(add(one, "removed"), refused("actions.plugin_disabled"));
  assert.equal(await add(two, "still reached"), true, "removing membership in one project leaves the other enabled");
  await home.web.post(projectPlugins, { plugin_id: PACKAGE_PLUGIN_ID, expected_revision: await projectPluginRevision(home.web, one.project_id) });
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
  await addProjectPlugin(home.web, project.project_id, PACKAGE_PLUGIN_ID);
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
test("RAC-1505 RAC-1506 RAC-1507 RAC-2615 RAC-2617 Home upgrade preserves installation and data; same/lower versions do not write", mac, async t => {
  const h = await fixture(t), publisher = newPublisher();
  await h.install(homePackage(publisher, { prompt: true }));
  const call = async (id: string, input = {}) => operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), id, input);
  const installation = () => h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!;
  const snapshot = async () => ({ record: installation(), notes: await call("notes.list"),
    approvals: h.store(db => db.prepare("SELECT item_key, item_value FROM plugin_private_values WHERE install_id = ?").all("agent-studio:~home")),
    pins: h.ledger.publishers(), packages: readdirSync(join(h.home, "plugin-packages")).sort() });
  await call("notes.add", { text: "kept" });
  const before = await snapshot(), next = upgradePackage(publisher);
  const prompts = () => homeAgentDefinitions(h.home).prompts().filter(prompt => prompt.source.kind === "plugin" && prompt.source.plugin_id === PACKAGE_PLUGIN_ID);
  assert.deepEqual(prompts().map(prompt => prompt.prompt_id), ["summary"]);
  await h.install(next);
  assert.equal(installation().install_id, before.record.install_id);
  assert.equal(installation().installation_generation, before.record.installation_generation);
  assert.equal(installation().version, "1.1.0");
  assert.deepEqual(prompts().map(prompt => [prompt.prompt_id, prompt.source.state]), [["new-summary", "enabled"]]);
  assert.deepEqual(await call("notes.list"), before.notes);
  const upgraded = await snapshot();
  const incompatible = signedPackage(publisher, (_files, manifest) => { manifest.runtime = { scope: "home" }; }, { version: "1.2.0" });
  for (const bundle of [next, homePackage(publisher), upgradePackage(publisher, "0.9.0"), incompatible]) {
    await assert.rejects(h.install(bundle), refused("plugin.upgrade_required"));
    assert.deepEqual(await snapshot(), upgraded, "RAC-1507 refused version changes no persisted fact");
  }
  assert.equal(await call("notes.add", { text: "after" }), true);
  assert.deepEqual(await call("notes.list"), [{ id: "1", text: "kept" }, { id: "2", text: "v2:after" }]);
  await h.reopen();
  assert.equal(installation().version, "1.1.0");
  assert.deepEqual(prompts().map(prompt => [prompt.prompt_id, prompt.source.state]), [["new-summary", "enabled"]]);
  assert.equal(installation().install_id, before.record.install_id);
  assert.deepEqual(await call("notes.list"), [{ id: "1", text: "kept" }, { id: "2", text: "v2:after" }]);
});

test("RAC-2857 Home upgrade retains complete signed registration and current role/method sources after recovery", mac, async t => {
  const h = await fixture(t), publisher = newPublisher();
  await h.install(signedAgentPackage(publisher, { scope: "home" }));
  const before = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!;
  // The role is listed once, as role material; the method once, as registered (its reference is the shared catalog's).
  const roles = () => homeAgentDefinitions(h.home).signedRoles().filter(item => item.owner_id === PACKAGE_PLUGIN_ID);
  const methods = () => homeAgentDefinitions(h.home).methods().filter(item => item.owner_id === PACKAGE_PLUGIN_ID);
  const previous = roles();
  assert.equal(previous.length, 1); assert.equal(methods().length, 1);
  const bodies = { "agent/role.md": "升级后完整的角色正文。", "skills/proofread/SKILL.md": "升级后完整的方法正文。" };
  // The method's body changes, so its Skill version goes up with it (SKC-04: a changed body under the same version is refused).
  await h.install(signedAgentPackage(publisher, { scope: "home", version: "1.1.0", compatibleFrom: ["1.0.0"], methods: [packageMethod("proofread", "校对", "逐项核对事实", { version: 2 })], bodies }));
  const check = () => {
    const installed = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!, registry = homeAgentDefinitions(h.home);
    assert.equal(installed.install_id, before.install_id);
    assert.equal(installed.installation_generation, before.installation_generation);
    assert.equal(installed.version, "1.1.0");
    const [role] = roles(), [method] = methods();
    assert.equal(roles().length, 1); assert.equal(methods().length, 1);
    assert.ok(registry.prompts().some(item => item.owner_id === PACKAGE_PLUGIN_ID && item.kind === "instruction" && item.prompt_id === "summary"));
    assert.equal(registry.roles().find(item => item.owner_id === PACKAGE_PLUGIN_ID)!.workspace, "none");
    assert.equal(role!.install_id, before.install_id); assert.equal(method!.install_id, before.install_id);
    assert.deepEqual(method!.tools, []);
    assert.deepEqual(role!.default_ref.source, { kind: "plugin", plugin_id: PACKAGE_PLUGIN_ID, plugin_version: "1.1.0", publisher_signature: publisher.identity });
    assert.equal(registry.signedMaterial(installed.install_id, role!.default_ref).body, bodies["agent/role.md"]);
    assert.equal(registry.installation(PACKAGE_PLUGIN_ID, installed.install_id)?.methods?.find(item => item.skill_id === "proofread" && item.version === 2)?.body, bodies["skills/proofread/SKILL.md"]);
    for (const item of previous) assert.throws(() => registry.signedMaterial(installed.install_id, item.default_ref), /来源已变化/);
  };
  check();
  await h.reopen();
  check();
});

test("RAC-2615-FAIL Home upgrade reaches a real runner failure and restores the old callable version", mac, async t => {
  const h = await fixture(t), publisher = newPublisher();
  await h.install(homePackage(publisher, { prompt: true }));
  const before = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!;
  const call = async (operation: string, input = {}) => operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), operation, input);
  const approved = () => h.store(db => db.prepare("SELECT item_value FROM plugin_private_values WHERE install_id = ? AND item_key = ?").get("agent-studio:~home", APPROVED + PACKAGE_PLUGIN_ID));
  const approval = approved();
  await call("notes.add", { text: "kept before failure" });
  await assert.rejects(h.install(upgradePackage(publisher, "1.1.0", true)), /升级没有完成：Plugin entrypoint 启动失败，已记录为 crashed/);
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.version, "1.0.0");
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.install_id, before.install_id);
  assert.equal(await operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), "notes.add", { text: "restored" }), true);
  assert.deepEqual(await call("notes.list"), [{ id: "1", text: "kept before failure" }, { id: "2", text: "restored" }]);
  assert.deepEqual(approved(), approval);
  assert.deepEqual(homeAgentDefinitions(h.home).prompts().filter(prompt => prompt.source.kind === "plugin" && prompt.source.plugin_id === PACKAGE_PLUGIN_ID).map(prompt => prompt.prompt_id), ["summary"]);
  // A published version is immutable even when it could not start: retry a corrected, newer package.
  await h.install(upgradePackage(publisher, "1.2.0"));
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.version, "1.2.0");
});

test("RAC-2615 Home upgrade keeps a disabled installation disabled across restart", mac, async t => {
  const h = await fixture(t), publisher = newPublisher();
  await h.install(homePackage(publisher));
  const id = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.install_id;
  await h.host.homePlugins!.packageAction(PACKAGE_PLUGIN_ID, "disable");
  await h.install(upgradePackage(publisher));
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.state, "disabled");
  assert.deepEqual(await operationsOf(h.homeClient(), h.homeCaller()), []);
  await h.reopen();
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.state, "disabled");
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.install_id, id);
  await h.host.homePlugins!.packageAction(PACKAGE_PLUGIN_ID, "enable");
  assert.equal(await operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), "notes.add", { text: "enabled" }), true);
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
  for (const project of [doomed, kept]) await addProjectPlugin(home.web, project.project_id, PACKAGE_PLUGIN_ID);
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

// BL-586 (user 2026-11-18, scope chosen 2026-11-22): two publishers who both wrote the notes plugin under the same id are two plugins. One is
// installed in the Home, the other in a project; the project page lists and draws both, each in its own words, each with its own data, and
// stopping one leaves the other open, also after a restart. Within one range, a second publisher is still refused (checkExistingInstall).
const namedNotes = (scope: "home" | "project", zh: string, en: string, publisher = newPublisher()) => signedPackage(publisher, files => {
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
  contract.operations.find(operation => operation.id === "notes.add")!.effects.storage = ["read", "write"];
  contract.ui = { locales: { default: "zh", available: ["zh", "en"] } };
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  for (const [locale, word] of [["zh", zh], ["en", en]] as const) {
    files[`locales/${locale}.json`] = JSON.stringify({ format_version: 1, owner: PACKAGE_PLUGIN_ID, locale, messages: { "notes.directory.name": word } });
  }
  return sandboxPluginManifest({ pluginId: PACKAGE_PLUGIN_ID, version: "1.0.0", name: zh, publisher: { publisher_id: "example", signature: publisher.identity },
    presentation: false, contract, ...(scope === "home" ? { runtime: { scope: "home" as const } } : {}),
    textDeclarations: { plugin_id: PACKAGE_PLUGIN_ID, name_text: { key: "notes.directory.name" } } });
});
const WANG = { zh: "小王的便签", en: "Wang notes" }, LI = { zh: "小李的便签", en: "Li notes" };
const byScope = (views: readonly ActionView[], scope: "home" | "project") => views.filter(view => view.action.scope === scope);
const framesIn = (html: string, scope: "home" | "project") => html.split(`%22scope%22%3A%22${scope}%22`).length - 1;

test("BL-586 a Home plugin and a project plugin by two publishers under one id both install, show their own words and data, and stopping one leaves the other", mac, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Two notes");
  const client = home.host.actionClient(project.reference), caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] };
  const install = async (bundle: PluginPackageBundle, label: string) => {
    const preview = await client.invoke(person(project.project_id), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; runtime_scope: string };
    await client.invoke(person(project.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: label });
    return preview.runtime_scope;
  };
  assert.equal(await install(namedNotes("home", WANG.zh, WANG.en), "Wang"), "home");
  await addProjectPlugin(home.web, project.project_id, PACKAGE_PLUGIN_ID);
  assert.equal(await install(namedNotes("project", LI.zh, LI.en), "Li"), "project", "another publisher's plugin under the same id is another plugin, with its own range");
  await assert.rejects(install(namedNotes("project", "第三家", "Third"), "Third"), refused("plugin.definition_conflict"), "a second publisher in the same range is still refused");

  const views = await operationsOf(client, caller);
  assert.equal(new Set(views.map(view => view.provider.plugin_install_id)).size, 2, "each installation offers its own actions");
  await operate(client, caller, byScope(views, "home"), "notes.add", { text: "Wang's" });
  await operate(client, caller, byScope(views, "project"), "notes.add", { text: "Li's" });
  assert.deepEqual(await operate(client, caller, byScope(views, "home"), "notes.list", {}), [{ id: "1", text: "Wang's" }]);
  assert.deepEqual(await operate(client, caller, byScope(views, "project"), "notes.list", {}), [{ id: "1", text: "Li's" }], "each keeps its own data");

  const page = async (language: string) => (await fetch(`${home.origin}/projects/${encodeURIComponent(project.project_id)}/`, { headers: { "accept-language": language } })).text();
  const zh = await page("zh-CN"), en = await page("en");
  for (const [html, language] of [[zh, "zh"], [en, "en"]] as const) {
    assert.ok(html.includes(WANG[language]) && html.includes(LI[language]), `the ${language} page names both, each in its own words`);
    assert.ok(!html.includes(WANG[language === "zh" ? "en" : "zh"]) && !html.includes(LI[language === "zh" ? "en" : "zh"]), `the ${language} page uses each plugin's ${language} words`);
  }
  assert.deepEqual([framesIn(zh, "home"), framesIn(zh, "project")], [1, 1], "both stages are drawn, each by its own installation");

  // Removing the Home membership leaves the other publisher's project installation reachable.
  const membership = `/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`;
  await home.web.delete(membership, { plugin_id: PACKAGE_PLUGIN_ID, expected_revision: await projectPluginRevision(home.web, project.project_id) });
  await assert.rejects(operate(client, caller, byScope(await operationsOf(client, caller), "home"), "notes.list", {}), refused("actions.plugin_disabled"));
  const afterRemoval = await page("zh-CN");
  assert.deepEqual([framesIn(afterRemoval, "home"), framesIn(afterRemoval, "project")], [0, 1]);
  assert.deepEqual(await operate(client, caller, byScope(await operationsOf(client, caller), "project"), "notes.list", {}), [{ id: "1", text: "Li's" }]);
  await home.web.post(membership, { plugin_id: PACKAGE_PLUGIN_ID, expected_revision: await projectPluginRevision(home.web, project.project_id) });

  // Stopping the Home one leaves the project one open, and the other way round.
  await home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/disable`, {});
  const withoutWang = await page("zh-CN");
  assert.deepEqual([withoutWang.includes(WANG.zh), withoutWang.includes(LI.zh), framesIn(withoutWang, "project")], [false, true, 1]);
  assert.deepEqual(await operate(client, caller, byScope(await operationsOf(client, caller), "project"), "notes.list", {}), [{ id: "1", text: "Li's" }]);
  await home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/enable`, {});
  await client.invoke(person(project.project_id), ref(pluginControlActions.disable), { plugin_id: PACKAGE_PLUGIN_ID });
  const withoutLi = await page("zh-CN");
  assert.deepEqual([withoutLi.includes(WANG.zh), withoutLi.includes(LI.zh), framesIn(withoutLi, "home"), framesIn(withoutLi, "project")], [true, false, 1, 0]);
  assert.deepEqual(byScope(await operationsOf(client, caller), "project"), [], "the stopped one offers nothing");
  assert.deepEqual(await operate(client, caller, byScope(await operationsOf(client, caller), "home"), "notes.list", {}), [{ id: "1", text: "Wang's" }]);
});

test("BL-586 after a restart the plugin that was not stopped comes back with its data, and the stopped one by the other publisher stays stopped", mac, async t => {
  const h = await fixture(t);
  await h.install(namedNotes("home", WANG.zh, WANG.en));
  await h.install(namedNotes("project", LI.zh, LI.en));
  const caller = h.projectCaller();
  await operate(h.projectClient(), caller, byScope(await operationsOf(h.projectClient(), caller), "project"), "notes.add", { text: "Li's" });
  await h.host.homePlugins!.packageAction(PACKAGE_PLUGIN_ID, "disable");
  await h.reopen();
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "disabled", "the stopped Home plugin stays stopped");
  const views = await operationsOf(h.projectClient(), caller);
  assert.deepEqual(byScope(views, "home"), []);
  assert.deepEqual(await operate(h.projectClient(), caller, byScope(views, "project"), "notes.list", {}), [{ id: "1", text: "Li's" }], "the other publisher's plugin is back with its data");
});

test("B47-F1 BL-586 the two installed pages read their own language and records after the other scope stops", mac, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { origin, projectId, sessionId, localHost } = browser;
  assert.ok(projectId && localHost);
  const client = localHost.actionClient(molisWorkHostProjectReference({ projectId, databasePath: browser.databasePath }));
  const caller = person(projectId), prefix = origin + "/projects/" + projectId + "/";
  const titles = { home: WANG, project: LI };
  const rows = { home: "Only in personal space", project: "Only in this project" };
  const surfaces = { home: PACKAGE_PLUGIN_ID, project: "" };
  const publishers = { home: newPublisher(), project: newPublisher() };
  for (const scope of ["home", "project"] as const) {
    const publisher = publishers[scope];
    const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle: namedNotes(scope, titles[scope].zh, titles[scope].en, publisher) }) as { preview_id: string };
    await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: titles[scope].en });
    if (scope === "home") await addProjectPlugin(browser.web, projectId, PACKAGE_PLUGIN_ID);
    await operate(client, caller, byScope(await operationsOf(client, caller), scope), "notes.add", { text: rows[scope] });
    if (scope === "project") surfaces[scope] = "app-" + sandboxPackageBuildId(PACKAGE_PLUGIN_ID, publisher.identity);
  }
  await browser.command("Network.enable", {}, sessionId);
  await browser.setViewport(1350, 920);
  const frames = { home: await pluginFrameBrowser(t, browser, surfaces.home), project: await pluginFrameBrowser(t, browser, surfaces.project) };
  const open = (scope: "home" | "project") => browser.navigate(() => browser.command("Page.navigate", { url: prefix + "?openSurface=" + surfaces[scope] }, sessionId));
  const read = async (scope: "home" | "project", language: "zh" | "en") => {
    const frame = frames[scope], surface = surfaces[scope], other = scope === "home" ? "project" : "home";
    const text = "document.querySelector('[data-component-id=notes]')?.innerText";
    await open(scope);
    await frame.waitFor(`${text}?.includes(${JSON.stringify(rows[scope])})`, 15_000);
    assert.ok(!(await frame.evaluate<string>(text)).includes(rows[other]));
    assert.equal(await browser.evaluate(`document.querySelector('[data-work-surface="${surface}"]').dataset.workSurfaceLabel`), titles[scope][language]);
  };
  for (const language of ["zh", "en"] as const) {
    await browser.command("Network.setExtraHTTPHeaders", { headers: { "Accept-Language": language } }, sessionId);
    await read("home", language);
    await read("project", language);
  }
  await browser.web.post("/api/settings/plugin-permissions/disable", { plugin_id: PACKAGE_PLUGIN_ID });
  await read("project", "en");
  await browser.web.post("/api/settings/plugin-permissions/enable", { plugin_id: PACKAGE_PLUGIN_ID });
  await client.invoke(caller, ref(pluginControlActions.disable), { plugin_id: PACKAGE_PLUGIN_ID });
  await read("home", "en");
});
