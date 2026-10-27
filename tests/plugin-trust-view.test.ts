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
