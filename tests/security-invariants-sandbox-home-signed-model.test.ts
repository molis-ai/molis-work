import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { sandboxedPluginDefinition, pluginInstallActions, sandboxImageNamespace, sandboxProviderId, withConnectorConnections, type HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { sandboxDerivedPermissions, sandboxPluginManifest } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginManifest, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { AgentRelease } from "@molis-ai/molis-work-plugin-builder";
import { effectsFromContract } from "@molis-ai/molis-work-plugin-sandbox";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { PACKAGE_PLUGIN_ID, newPublisher, packageFiles, payloadOf, signedPackage } from "./fixtures/sandbox-package.js";
import { mac, operate, operationsOf, person, ref, runtimeStore } from "./fixtures/home-sandbox.js";
import { openTestHome } from "./fixtures/test-home.js";

// BL-491 (PG-017; specs/repository-anti-corruption/slices/pg011-pg017-remaining.md §6, S-60, S-66, S-91): a signed package installed in the Home asks for its model and
// its image connections in `contract.json` and nothing else; the Host derives the Manifest rows, the names and the clean-up. This file runs real packages in real
// sandbox processes behind a real Home: it asserts what the package can do (call the model, choose among the enabled models, bind an image connection the person already
// pinned) and what it cannot (name an address, a connection or an account, pin a connection itself, bind outside its approved domains, do any of it from a project).

const DOMAIN = "images.example.com";
const EFFECTS: SandboxEffects = { storage: ["read", "write"], model: ["invoke"], modelSettings: ["read", "save"], imageGeneration: ["read", "bind", "generate"], networkDomains: [DOMAIN] };
const CODE = `export const operations = {
  'notes.list': async (_input, sdk) => [{ id: 'result', text: (await sdk.storage.get('result')) ?? '' }],
  'notes.add': async (input, sdk) => {
    const cmd = JSON.parse(input.text); let out = null;
    try {
      if (cmd.op === 'complete') out = (await sdk.model.complete({ prompt_id: 'summary', data: 'x' })).text;
      else if (cmd.op === 'settings.read') out = await sdk.model.settings.read();
      else if (cmd.op === 'settings.save') out = (await sdk.model.settings.save(cmd.choice)).selection ?? null;
      else if (cmd.op === 'image.connections') out = await sdk.imageGeneration.connections();
      else if (cmd.op === 'image.bind') { await sdk.imageGeneration.bind({ slot_id: 'main', base_url: cmd.url }, cmd.connection); out = 'bound'; }
    } catch (error) { out = { error: error.code ?? String(error) }; }
    await sdk.storage.set('result', JSON.stringify(out)); return true;
  },
};\n`;

function bundle(scope: "home" | "project", effects: SandboxEffects = EFFECTS, pluginId?: string) {
  return signedPackage(newPublisher(), (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.find(operation => operation.id === "notes.add")!.effects = effects;
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = CODE;
    files[SANDBOX_PACKAGE_FILES.prompts] = JSON.stringify([{ id: "summary", title: "摘要", purpose: "把材料压成一句话", body: "把下面的材料压成一句话。" }]);
    Object.assign(manifest, sandboxPluginManifest({ pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher, presentation: false,
      ...scope === "home" ? { runtime: { scope } } : {}, effects: effectsFromContract(contract) }));
  }, pluginId ? { pluginId } : {});
}

const complete: HostCompleteText = async (_prompt, options = {}) => { await options.beforeDispatch?.(); return "摘要结果"; };
const ALL = ["model:read", "model:invoke", "image-api:read", "image-api:write", "image-api:generate"];

async function rig(t: test.TestContext) {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const h = await openTestHome(t, { host: { completeText: complete } });
  const project = await h.createProject("BL-491");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: h.home });
  t.after(() => catalog.close());
  const model = withConnectorConnections(h.home, store => store.createToken({ serviceId: "model-api", displayName: "模型账号", token: "model-test-credential" }));
  withConnectorConnections(h.home, store => store.assertTarget(model.connection_id, "model-api", "http://127.0.0.1:1"));
  catalog.models.upsert({ credential_ref: model.credential_ref!, provider_id: "fixture", display_name: "测试供应商", base_url: "http://127.0.0.1:1", api_format: "anthropic-messages", models: [{ model_id: "model", enabled: true }] });
  const account = (name: string, origin?: string) => {
    const created = withConnectorConnections(h.home, store => store.createToken({ serviceId: "image-api", displayName: name, token: `image-${name}` }));
    if (origin) withConnectorConnections(h.home, store => store.assertTarget(created.connection_id, "image-api", origin));
    return created.connection_id;
  };
  const projectClient = h.host.actionClient(project.reference), client = h.host.homeActionClient();
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: [...ALL] };
  const install = async (which = bundle("home")) => {
    const preview = await projectClient.invoke(person(project.project_id), ref(pluginInstallActions.preview), { bundle: which }) as { preview_id: string; effects: SandboxEffects; preview: { permissions: Array<{ permission: string }> } };
    await projectClient.invoke(person(project.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
    return preview;
  };
  const approve = async () => {
    const record = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!, platform = await h.host.homePlugins!.ready();
    // The person approves each optional row the Manifest derived.
    for (const permission of ALL) await platform.runtime.regrant(record.install_id, permission, true);
    installation = record.install_id;
    return record.install_id;
  };
  const ask = async (command: Record<string, unknown>) => {
    const views = await operationsOf(client, caller);
    await operate(client, caller, views, "notes.add", { text: JSON.stringify(command) });
    const [row] = await operate(client, caller, views, "notes.list", {}) as Array<{ text: string }>;
    return JSON.parse(row!.text) as unknown;
  };
  let installation = "";
  const binding = () => withConnectorConnections(h.home, store => store.binding("home", sandboxImageNamespace(installation), "main")?.connection_id ?? null);
  const origin = (id: string) => withConnectorConnections(h.home, store => store.targetOrigin(id));
  const uninstall = (keep_data: boolean) => h.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/uninstall`, { keep_data });
  return { h, install, approve, ask, account, binding, origin, uninstall };
}

test("BL-491 RAC-2627 the Manifest rows a package gets are derived from its effects; a package whose Manifest says anything else is refused, and the preview shows them", mac, async t => {
  const r = await rig(t);
  const preview = await r.install(bundle("home"));
  const rows = preview.preview.permissions.map(view => view.permission);
  assert.deepEqual(ALL.filter(permission => !rows.includes(permission)), [], "each derived row is shown for the person to approve");
  assert.deepEqual(preview.effects.imageGeneration?.slice().sort(), ["bind", "generate", "read"]);
  const { files, manifest } = packageFiles(newPublisher().identity, (changed, changedManifest) => {
    const contract = JSON.parse(changed[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.find(operation => operation.id === "notes.add")!.effects = EFFECTS;
    changed[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    Object.assign(changedManifest, sandboxPluginManifest({ pluginId: changedManifest.plugin_id, version: changedManifest.version, name: changedManifest.name, publisher: changedManifest.publisher, presentation: false,
      runtime: { scope: "home" }, effects: effectsFromContract(contract) }));
  });
  const { readSandboxPackage } = await import("@molis-ai/molis-work-app-local-host");
  assert.doesNotThrow(() => readSandboxPackage(payloadOf(manifest, files)));
  const mutations: Array<(m: PluginManifest) => void> = [
    m => { m.permissions = m.permissions.filter(item => item.permission !== "model:invoke"); },
    m => { m.permissions = m.permissions.filter(item => item.permission !== "image-api:generate"); },
    m => { m.permissions.find(item => item.permission === "image-api:generate")!.required = true; },
    m => { m.permissions.push({ permission: "image-api:extra", required: false, reason: "arbitrary" }); },
    m => { (m as { model_configuration?: unknown }).model_configuration = { preference: { store_name: "x", file_name: "y.json" } }; },
    m => { (m as { image_generation?: unknown }).image_generation = { store_name: "imageconn-x", read_permission: "a", write_permission: "b", generate_permission: "c" }; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(manifest); mutate(changed);
    assert.throws(() => readSandboxPackage(payloadOf(changed, files)), { code: "plugin.declaration_invalid" });
  }
  assert.deepEqual(sandboxDerivedPermissions({}).length, 0);
});

test("BL-491 RAC-2629 an installed package chooses among the enabled models inside its own action; it sees no endpoint and no account", mac, async t => {
  const r = await rig(t);
  await r.install();
  const installId = await r.approve();
  const view = await r.ask({ op: "settings.read" }) as { configured: boolean; providers: Array<{ provider_id: string }>; selection?: unknown };
  assert.deepEqual(view.providers.map(provider => provider.provider_id), ["fixture"]);
  assert.doesNotMatch(JSON.stringify(view), /base_url|api_format|connection|127\.0\.0\.1/u);
  assert.equal(view.selection, undefined);
  assert.deepEqual(await r.ask({ op: "settings.save", choice: { provider_id: "fixture", model_id: "model" } }), { provider_id: "fixture", model_id: "model" });
  const preference = join(r.h.home, "plugin-files", installId, ".model-settings", "preference.json");
  assert.deepEqual(JSON.parse(readFileSync(preference, "utf8")), { schema_version: 1, provider_id: "fixture", model_id: "model" });
});

test("BL-491 RAC-2630 a package cannot save an address, a connection, a format, the reserved provider or anything unknown; nothing is written and no provider is made", mac, async t => {
  const r = await rig(t);
  await r.install();
  const installId = await r.approve();
  const preference = join(r.h.home, "plugin-files", installId, ".model-settings", "preference.json");
  const reserved = sandboxProviderId(installId);
  for (const choice of [{ provider_id: "fixture", model_id: "model", base_url: "https://evil.example/v1" }, { provider_id: "fixture", model_id: "model", connection_id: "c" },
    { provider_id: "fixture", model_id: "model", api_format: "openai-chat-completions" }, { provider_id: "fixture", model_id: "model", surprise: 1 }, { provider_id: reserved, model_id: "model" },
    { provider_id: "fixture", model_id: 7 }, { provider_id: "nobody", model_id: "model" }, { provider_id: "fixture", model_id: "not-enabled" }]) {
    const outcome = await r.ask({ op: "settings.save", choice }) as { error?: string } | null;
    assert.ok(outcome && typeof outcome === "object" && "error" in outcome, `refused: ${JSON.stringify(choice)} -> ${JSON.stringify(outcome)}`);
    assert.equal(existsSync(preference), false, `nothing was written for ${JSON.stringify(choice)}`);
  }
  const view = await r.ask({ op: "settings.read" }) as { providers: Array<{ provider_id: string }> };
  assert.deepEqual(view.providers.map(provider => provider.provider_id), ["fixture"], "no provider was created, the reserved one included");
});

test("BL-491 RAC-2632 a package cannot pin a connection to an address: bind needs a connection the person already used at that origin, inside the operation's approved domains", mac, async t => {
  const r = await rig(t);
  await r.install(); await r.approve();
  const never = r.account("never"), elsewhere = r.account("elsewhere", "https://other.example.com"), unapproved = r.account("unapproved", "https://unapproved.example.com"), pinned = r.account("pinned", `https://${DOMAIN}`);
  const listed = await r.ask({ op: "image.connections" }) as Array<{ connection_id: string; target_origin?: string }>;
  assert.equal(listed.find(item => item.connection_id === pinned)?.target_origin, `https://${DOMAIN}`, "the listing carries where each connection is pinned");
  assert.equal(listed.find(item => item.connection_id === never)?.target_origin, undefined);
  const tables = () => JSON.stringify([r.origin(never), r.origin(elsewhere), r.origin(unapproved), r.origin(pinned), r.binding()]);
  const before = tables();
  assert.deepEqual(await r.ask({ op: "image.bind", url: `https://${DOMAIN}/v1`, connection: never }), { error: "sandbox.not_authorized" }, "never pinned");
  assert.deepEqual(await r.ask({ op: "image.bind", url: `https://${DOMAIN}/v1`, connection: elsewhere }), { error: "sandbox.not_authorized" }, "pinned to another origin");
  assert.deepEqual(await r.ask({ op: "image.bind", url: "https://unapproved.example.com/v1", connection: unapproved }), { error: "sandbox.not_authorized" }, "an origin the operation did not declare");
  assert.equal(tables(), before, "no refusal pinned, bound or changed anything");
  assert.equal(r.binding(), null);
  assert.equal(await r.ask({ op: "image.bind", url: `https://${DOMAIN}/v1`, connection: pinned }), "bound");
  assert.equal(r.binding(), pinned);
});

test("BL-491 RAC-2635 an uninstall that keeps the data keeps the model choice and the image binding; one that discards it removes both", mac, async t => {
  const r = await rig(t);
  const same = bundle("home");
  await r.install(same);
  const installId = await r.approve();
  const pinned = r.account("pinned", `https://${DOMAIN}`);
  await r.ask({ op: "settings.save", choice: { provider_id: "fixture", model_id: "model" } });
  await r.ask({ op: "image.bind", url: `https://${DOMAIN}/v1`, connection: pinned });
  const preference = join(r.h.home, "plugin-files", installId, ".model-settings", "preference.json");
  assert.ok(existsSync(preference)); assert.equal(r.binding(), pinned);
  await r.uninstall(true);
  assert.ok(existsSync(preference) && r.binding() === pinned, "kept data keeps both");
  assert.equal(r.origin(pinned), `https://${DOMAIN}`, "the person's account stays whatever happens");
  await r.install(same); await r.approve();
  assert.equal(r.binding(), pinned, "a reinstall of the same installation finds the binding again");
  await r.uninstall(false);
  assert.equal(existsSync(preference), false, "the choice goes with the installation's folder");
  assert.equal(r.binding(), null, "the package's image slots are unbound");
  assert.equal(r.origin(pinned), `https://${DOMAIN}`, "the account itself is still the person's");
});

test("BL-491 RAC-2654 a package that asks for model settings or image generation is refused in a project: they are the Home's", mac, async t => {
  const r = await rig(t);
  await assert.rejects(r.install(bundle("project")), /安装没有完成/u);
  // The install error does not carry the cause, so the guard itself is asked: a project's instance of a package with either effect never starts, and says why.
  const contract = { operations: [{ id: "draw", kind: "command" as const, effects: { imageGeneration: ["read"] as Array<"read"> }, input: { type: "null" }, output: { type: "null" } }] };
  const release = { buildId: "project-refusal", pluginId: "io.molis.work.example.projectrefusal", version: 1, bundlePath: "/nowhere", design: { title: "refusal", contract, parts: [], acceptance: [] } } as AgentRelease;
  const definition = sandboxedPluginDefinition(release, { imageGeneration: ["read"] }, []);
  const context = { project_id: "p", install_id: "refusal", installation_generation: "1", requireGrant: () => {} } as Partial<PluginStartContext> as PluginStartContext;
  await assert.rejects(definition.start(context), (error: { code?: string; message?: string }) => error.code === "plugin.declaration_invalid" && /模型设置和图片生成只给装在 Home 里的插件/u.test(error.message ?? ""));
  // The same package without those two effects installs in the project: the refusal is theirs.
  await r.install(bundle("project", { storage: ["read", "write"], model: ["invoke"] }, "io.molis.work.example.control"));
  assert.equal(r.h.host.homePlugins!.hasPackage(PACKAGE_PLUGIN_ID), false);
});

test("RAC-239 deleting a project clears what a sandboxed package kept there without any purge of its own: its files, its rows and its installation", mac, async t => {
  const r = await rig(t);
  const doomed = await r.h.createProject("Doomed");
  const client = r.h.host.actionClient(doomed.reference), caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: doomed.project_id, permissions: [] };
  const preview = await client.invoke(person(doomed.project_id), ref(pluginInstallActions.preview), { bundle: bundle("project", { storage: ["read", "write"] }) }) as { preview_id: string };
  await client.invoke(person(doomed.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const views = await operationsOf(client, caller);
  await operate(client, caller, views, "notes.add", { text: JSON.stringify({ op: "none" }) });
  const projectFolder = join(r.h.home, "projects", doomed.project_id);
  assert.ok(existsSync(projectFolder), "the project has a folder of its own before");
  const installs = () => runtimeStore(r.h.home, db => db.prepare("SELECT install_id FROM plugin_private_values").all().map(row => (row as { install_id: string }).install_id));
  const before = installs();
  await r.h.web.post(`/api/settings/projects/${doomed.project_id}/delete`, { delete_confirmed: true, idempotency_key: "rac-239-delete-key" });
  assert.equal(existsSync(projectFolder), false, "the project's folder, and every file the package kept in it, is gone");
  assert.deepEqual(installs().filter(id => !before.includes(id)), [], "no row of the Home's stores was left behind or added");
  assert.ok(!readdirSync(join(r.h.home, "projects")).includes(doomed.project_id));
});
