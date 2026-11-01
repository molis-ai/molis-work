import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { EN } from "@molis-ai/molis-work-app-workbench";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { platformPermissionMeaning } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, installedPluginViews, pluginInstallActions, pluginInstallProvider, sandboxPluginManifest } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";

// ac-trust T7: what the install preview and the plugin's detail page tell the person. RAC-405 the platform says what a permission is
// (BL-353); RAC-406 the detail page lists what each installed plugin asked for and why, the jobs it keeps (BL-362), who signed it and the
// agreements given, as a read only the person's own surfaces make.

const AT = "2026-10-25T00:00:00.000Z";
const record = (patch: Partial<PluginInstanceRecord>): PluginInstanceRecord => ({
  install_id: "install-1", installation_generation: "g1", plugin_id: PACKAGE_PLUGIN_ID, version: "1.0.0", publisher_id: "example", publisher_signature: "ed25519:sha256:aa",
  manifest_digest: "digest", deployment: "local", selected_entrypoint: "./plugin.mjs", grants: [], execution: "sandbox", publisher_trust: "pinned", state: "running",
  recovery_count: 0, last_error_code: null, installed_at: AT, updated_at: AT, uninstalled_at: null, retain_private_data: false, ...patch });

test("RAC-405 the platform names what a platform permission lets a plugin do, a site or a secret by its name, and says nothing of a permission it does not define", () => {
  assert.match(platformPermissionMeaning("storage:private")!, /私有空间/);
  assert.match(platformPermissionMeaning("actions:delegate")!, /你能做的事/);
  assert.equal(platformPermissionMeaning("network:api.example.com"), "连接到这个网站：api.example.com");
  assert.equal(platformPermissionMeaning("secret:weather-key"), "读取你存放的这项密钥：weather-key");
  assert.equal(platformPermissionMeaning("issues:write"), null, "a permission a plugin defines for itself has no platform meaning");
  assert.equal(platformPermissionMeaning("network"), null);
});

test("RAC-405 an install preview lists each permission with the plugin's reason and the platform's meaning", async () => {
  const service = new PluginInstallService({ ledger: new MemoryPluginConsentLedger(), packages: new SandboxPackageStore("/nonexistent"), now: () => AT, installInProject: async () => undefined, installInHome: async () => undefined, installed: async () => [], control: async () => "disabled" });
  const shown = await service.preview({ bundle: signedPackage(newPublisher()) }, { project_id: "project-one", actor_id: LOCAL_PERSON_ACTOR_ID });
  assert.deepEqual(shown.preview.permissions, [{ permission: "storage:private", required: true, reason: "保存这个插件自己的数据", meaning: platformPermissionMeaning("storage:private") }]);
  assert.deepEqual(shown.preview.jobs, [], "a sandbox package keeps no background job");
});

test("RAC-406 an installed plugin's detail has its trust, the publisher's name, each permission with reason and meaning, its background jobs, and every agreement given including a revoked one", () => {
  const ledger = new MemoryPluginConsentLedger();
  ledger.pinPublisher({ key_id: "ed25519:sha256:aa", public_key_spki_base64: "spki", label: "Example", pinned_at: AT, pinned_by: LOCAL_PERSON_ACTOR_ID });
  const [given] = ledger.record({ plugin_id: PACKAGE_PLUGIN_ID, publisher_signature: "ed25519:sha256:aa", manifest_digest: "digest", granted_by: "user", grants: [{ kind: "always_on", subject: "plugin" }], at: AT });
  ledger.revoke(given!.consent_id, AT);
  const manifest = { ...sandboxPluginManifest({ pluginId: PACKAGE_PLUGIN_ID, version: "1.0.0", name: "Example notes", publisher: { publisher_id: "example", signature: "ed25519:sha256:aa" }, presentation: false }) };
  manifest.permissions = [...manifest.permissions, { permission: "network:api.example.com", required: false, reason: "查询天气" }, { permission: "issues:write", required: false, reason: "记录问题" }];
  manifest.background = { jobs: [{ job_id: "refresh", reason: "每天更新一次天气", permissions: ["network:api.example.com"] }] } as typeof manifest.background;
  const [view, unreadable] = installedPluginViews([{ record: record({}), manifest }, { record: record({ install_id: "install-2", plugin_id: "io.molis.work.other", publisher_trust: "host", publisher_signature: "host" }), manifest: undefined }], ledger);
  assert.deepEqual([view!.name, view!.trust, view!.publisher_label, view!.manifest_available], ["Example notes", "pinned", "Example", true]);
  assert.deepEqual(view!.permissions.map(item => [item.permission, item.reason, item.meaning === null]), [
    ["storage:private", "保存这个插件自己的数据", false], ["network:api.example.com", "查询天气", false], ["issues:write", "记录问题", true]]);
  assert.deepEqual(view!.jobs, [{ job_id: "refresh", reason: "每天更新一次天气", permissions: ["network:api.example.com"] }]);
  assert.deepEqual(view!.consents.map(item => [item.kind, item.revoked_at]), [["always_on", AT]]);
  assert.deepEqual([unreadable!.name, unreadable!.manifest_available, unreadable!.permissions, unreadable!.publisher_label], ["io.molis.work.other", false, [], null],
    "a Manifest that cannot be read is said so, not shown as asking for nothing");
});

test("RAC-406 plugins.installed.list is the person's read of one project: other audiences do not see it, and it needs a project", async () => {
  const entries = [{ record: record({}), manifest: undefined }];
  let asked: string | undefined;
  const service = new PluginInstallService({ ledger: new MemoryPluginConsentLedger(), packages: new SandboxPackageStore("/nonexistent"), now: () => AT, installInProject: async () => undefined, installInHome: async () => undefined,
    installed: async projectId => { asked = projectId; return entries; } });
  const actions = new ActionService();
  actions.registerProvider(pluginInstallProvider(service));
  const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: "project-one", permissions: PLUGIN_INSTALL_PERMISSIONS, ...extra });
  const target = { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version };
  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    assert.deepEqual((await actions.discover(caller({ audience }))).filter(view => view.capability_id === target.capability_id), [], `${audience} does not see it`);
    await assert.rejects(actions.invoke(caller({ audience }), target, {}), error => error instanceof ActionError, `${audience} cannot call it`);
  }
  await assert.rejects(actions.invoke(caller({ project_id: undefined }), target, {}), (error: unknown) => error instanceof ActionError && error.code === "actions.project_required");
  const listed = await actions.invoke(caller(), target, {}) as { plugins: Array<{ plugin_id: string; manifest_available: boolean }> };
  assert.deepEqual([asked, listed.plugins.map(item => [item.plugin_id, item.manifest_available])], ["project-one", [[PACKAGE_PLUGIN_ID, false]]]);
});

test("RAC-2600 the installed list says why an installation is not running when its plugin host knows, and null when nothing is wrong", () => {
  const manifest = sandboxPluginManifest({ pluginId: PACKAGE_PLUGIN_ID, version: "1.0.0", name: "Example notes", publisher: { publisher_id: "example", signature: "ed25519:sha256:aa" }, presentation: false });
  const [broken, fine] = installedPluginViews([{ record: record({}), manifest, recoveryError: "找不到已安装的插件包" }, { record: record({ install_id: "install-2", plugin_id: "io.molis.work.other" }), manifest }], new MemoryPluginConsentLedger());
  assert.equal(broken!.recovery_error, "找不到已安装的插件包");
  assert.equal(broken!.state, "running", "the state is the record's own; the reason is said beside it");
  assert.equal(fine!.recovery_error, null);
  assert.deepEqual([fine!.name, fine!.trust, fine!.manifest_available, fine!.permissions.length], ["Example notes", "pinned", true, 1], "the other fields are what they were");
});


// View-only inputs exercise the existing client renderer with multiple services; signed source packages currently allow one service.
// The separate RAC-2619 e2e file uses real signed files and real preview/confirm responses throughout.
test("RAC-2619-VIEW service rows preserve multiple exact origins as text and omit an empty group", { skip: process.platform !== "darwin", timeout: 60_000 }, async t => {
  const executable = process.env.MOLIS_WORK_TEST_CHROME;
  assert.equal(executable, "/Users/yijunwang/.local/bin/molis-test-browser");
  await access(executable, constants.X_OK);
  await access("/Users/yijunwang/.local/share/molis-test-browser/engine/chrome-headless-shell", constants.X_OK);
  const directory = await mkdtemp(join(tmpdir(), "t141-preview-view-"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const home = await serveHomeRuntime(t, { completeText: null }), project = await home.project("Preview view");
  browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page();
  await page.command("Page.navigate", { url: home.origin + `/projects/${project.project_id}/settings/plugins` });
  await page.wait("!!document.querySelector('[data-plugin-trust-pick]')");
  const service = new PluginInstallService({ ledger: new MemoryPluginConsentLedger(), packages: new SandboxPackageStore("/nonexistent"),
    installInProject: async () => undefined, installInHome: async () => undefined, installed: async () => [] });
  const preview = await service.preview({ bundle: signedPackage(newPublisher()) }, { project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID });
  const origins = [
    { title: "One <img src=x onerror=alert(1)>", service_id: "one", origins: ["https://one.example.com", "https://second.example.com:8443"] },
    { title: "Two & three", service_id: "two", origins: ["https://two.example.com"] },
  ];
  await page.evaluate(`(() => { const original = globalThis.molisWorkRequest; globalThis.molisWorkRequest = Object.assign((url, ...args) => url.endsWith('/install/preview') ? Promise.resolve(globalThis.previewViewFixture) : original(url, ...args), original); })()`);
  for (const rows of [origins, []]) {
    await page.evaluate(`globalThis.previewViewFixture = ${JSON.stringify({ ...preview, origins: rows })}`);
    const file = join(directory, "view-" + rows.length + ".json"); await writeFile(file, "{}");
    const doc = await page.command<{ root: { nodeId: number } }>("DOM.getDocument");
    const input = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "[data-plugin-trust-pick]" });
    await page.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
    await page.wait("document.querySelector('[data-plugin-trust-preview]')?.hidden === false");
    const text = await page.evaluate<string>("document.querySelector('[data-plugin-trust-preview]').innerText");
    assert.equal(text.includes("可访问的服务地址"), rows.length > 0);
    for (const row of rows) for (const value of [row.title, row.service_id, ...row.origins]) assert.ok(text.includes(value), value);
    assert.equal(await page.evaluate("document.querySelectorAll('[data-plugin-trust-preview] img').length"), 0);
    await page.click("[data-plugin-trust-preview] .mw-btn--secondary");
    await page.wait("document.querySelector('[data-plugin-trust-preview]').hidden");
  }
  assert.equal(EN["可访问的服务地址"], "Service addresses it may access");
});
