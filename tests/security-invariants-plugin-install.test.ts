import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord, PluginManifest, PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger, SqlitePluginRuntimeRepository, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { DEMO_PROJECT_ID, HomeConsentLedger, LocalProjectDatabase, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, molisWorkHostProjectReference,
  pluginConsentProvider, pluginInstallActions, pluginInstallProvider, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, packageFiles, payloadOf, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";

// S-81 (ac-trust T2): a plugin is installed from a signed package only through one path the person walks, and the Host checks the package
// before it writes anything. Unsigned, altered, wrongly signed, from a revoked publisher, or not in the sandbox package format: refused at
// the preview; the confirmation takes only a preview the Host made for this person here, pins a publisher only when the person says so,
// and every one of these actions is the person's own (audience `user`, a protected entry's `user_action`).

const AT = "2026-10-25T00:00:00.000Z";
const who = { project_id: "project-one", actor_id: LOCAL_PERSON_ACTOR_ID };
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

async function harness(ledger: PluginConsentLedger = new MemoryPluginConsentLedger()) {
  const home = await mkdtemp(join(tmpdir(), "molis-work-install-"));
  const installed: Array<{ project: string; plugin: string; trust: unknown }> = [];
  const service = new PluginInstallService({ ledger, packages: new SandboxPackageStore(home), now: () => AT,
    install: async (project, release) => { installed.push({ project, plugin: release.pluginId, trust: release.packaged?.trust }); }, installed: async () => [] });
  /** Nothing the install path writes exists: no pinned publisher, no kept package, no installation. */
  const nothingWritten = () => {
    assert.deepEqual(ledger.publishers(), [], "no publisher was pinned");
    assert.equal(existsSync(join(home, "plugin-packages")), false, "no package was kept");
    assert.deepEqual(installed, [], "nothing was installed");
  };
  return { home, ledger, service, installed, nothingWritten, done: () => rm(home, { recursive: true, force: true }) };
}

test("RAC-387 S-81 a package with no signature is refused at the preview with plugin.signature_invalid, and nothing is written", async () => {
  const h = await harness();
  try {
    const { files, manifest } = packageFiles(newPublisher().identity);
    const unsigned: PluginPackageBundle = { payload: payloadOf(manifest, files), signature: null, publisher_key: null };
    assert.throws(() => h.service.preview({ bundle: unsigned }, who), refused("plugin.signature_invalid"));
    h.nothingWritten();
  } finally { await h.done(); }
});

test("RAC-382 S-81 a package altered after it was signed is refused with plugin.signature_invalid; a key its Manifest does not name with plugin.signer_mismatch", async () => {
  const h = await harness();
  try {
    const publisher = newPublisher(), bundle = signedPackage(publisher);
    const altered = structuredClone(bundle);
    altered.payload.files = altered.payload.files.map(file => file.path === "plugin.mjs" ? { ...file, content_base64: Buffer.from("export const operations = {};\n").toString("base64") } : file);
    assert.throws(() => h.service.preview({ bundle: altered }, who), refused("plugin.signature_invalid"));
    const other = newPublisher();
    assert.throws(() => h.service.preview({ bundle: { ...bundle, publisher_key: { algorithm: "ed25519", spki_base64: other.signer.public_key_spki_base64 } } }, who), refused("plugin.signer_mismatch"));
    h.nothingWritten();
    assert.equal(h.service.preview({ bundle }, who).preview.plugin_id, PACKAGE_PLUGIN_ID, "the unaltered package previews");
  } finally { await h.done(); }
});

const NOT_IN_THE_FORMAT: Array<[string, (files: PackageFiles, manifest: PluginManifest) => void]> = [
  ["a file the format does not have", files => { files["extra.txt"] = "hello"; }],
  ["no prompts.json", files => { delete files["prompts.json"]; }],
  ["no contract.json", files => { delete files["contract.json"]; }],
  ["a contract for another plugin", files => { files["contract.json"] = files["contract.json"]!.replace(PACKAGE_PLUGIN_ID, "io.molis.work.example.other"); }],
  ["an interface key the format does not have", files => { files["interface.json"] = JSON.stringify({ ...JSON.parse(files["interface.json"]!), script: "alert(1)" }); }],
  ["no parts", files => { files["interface.json"] = JSON.stringify({ parts: [], nodes: [] }); }],
  ["a part that reads an operation its region does not have", files => {
    const shape = JSON.parse(files["interface.json"]!); shape.parts[1].read.operationId = "notes.erase"; files["interface.json"] = JSON.stringify(shape);
  }],
  ["a component outside the choices for its part", files => {
    const shape = JSON.parse(files["interface.json"]!); shape.nodes[0].kind = "no-such-component"; files["interface.json"] = JSON.stringify(shape);
  }],
  ["a prompt that is not { id, title, purpose, body }", files => { files["prompts.json"] = JSON.stringify([{ id: "x", title: "t" }]); }],
  ["a Manifest with a route of its own", (_files, manifest) => { (manifest.routes as unknown[]).push({ route_id: "extra", method: "GET", path: "/extra" }); }],
  ["a Manifest whose view is somewhere else", (_files, manifest) => { manifest.ui!.views![0]!.title = "Another"; }],
];

test("RAC-383 S-81 a package that verifies but is not in the sandbox package format is refused with plugin.declaration_invalid, before anything is written", async () => {
  for (const [name, change] of NOT_IN_THE_FORMAT) {
    const h = await harness();
    try {
      const bundle = signedPackage(newPublisher(), change);
      assert.throws(() => h.service.preview({ bundle }, who), refused("plugin.declaration_invalid"), name);
      h.nothingWritten();
    } finally { await h.done(); }
  }
});

test("RAC-382 S-81 a publisher the person has not pinned is pinned only when they give a name, and a preview confirms once", async () => {
  const h = await harness();
  try {
    const publisher = newPublisher(), bundle = signedPackage(publisher);
    const preview = h.service.preview({ bundle }, who);
    assert.deepEqual([preview.preview.publisher_pinned, preview.publisher.pinned_label, preview.preview.trust], [false, null, "pinned"]);
    await assert.rejects(h.service.confirm({ preview_id: preview.preview_id, consent: true }, who), refused("plugin.publisher_untrusted"));
    h.nothingWritten();
    await assert.rejects(h.service.confirm({ preview_id: preview.preview_id, consent: true, pin_label: "Example" }, who), refused("plugin.preview_unknown"), "the preview was used up");

    const again = h.service.preview({ bundle }, who);
    await assert.rejects(h.service.confirm({ preview_id: again.preview_id, consent: false, pin_label: "Example" }, who), refused("plugin.consent_required"));
    h.nothingWritten();
    const third = h.service.preview({ bundle }, who);
    await assert.rejects(h.service.confirm({ preview_id: third.preview_id, consent: true, pin_label: "Example" }, { ...who, project_id: "another-project" }), refused("plugin.preview_unknown"), "a preview belongs to its project");

    const fourth = h.service.preview({ bundle }, who);
    assert.deepEqual(await h.service.confirm({ preview_id: fourth.preview_id, consent: true, pin_label: "Example" }, who), { plugin_id: PACKAGE_PLUGIN_ID, version: "1.0.0", publisher_key_id: publisher.identity });
    assert.deepEqual(h.ledger.publishers().map(pin => [pin.key_id, pin.label, pin.pinned_by, pin.revoked_at]), [[publisher.identity, "Example", LOCAL_PERSON_ACTOR_ID, null]]);
    assert.deepEqual(h.installed, [{ project: who.project_id, plugin: PACKAGE_PLUGIN_ID, trust: { level: "pinned", publisher_key_id: publisher.identity } }]);

    const pinned = h.service.preview({ bundle: signedPackage(publisher, undefined, { version: "1.1.0" }) }, who);
    assert.deepEqual([pinned.preview.publisher_pinned, pinned.publisher.pinned_label], [true, "Example"], "a pinned publisher's next package needs no pinning");
    await h.service.confirm({ preview_id: pinned.preview_id, consent: true }, who);
    assert.equal(h.installed.length, 2);
  } finally { await h.done(); }
});

test("RAC-382 S-81 a publisher whose pin was revoked is refused at the preview and again at the confirmation", async () => {
  const memory = new MemoryPluginConsentLedger();
  let revoked = false;
  const h = await harness(Object.assign(Object.create(memory) as PluginConsentLedger, {
    publishers: () => memory.publishers().map(pin => revoked ? { ...pin, revoked_at: AT } : pin) }));
  try {
    const publisher = newPublisher(), bundle = signedPackage(publisher);
    const first = h.service.preview({ bundle }, who);
    await h.service.confirm({ preview_id: first.preview_id, consent: true, pin_label: "Example" }, who);
    const waiting = h.service.preview({ bundle: signedPackage(publisher, undefined, { version: "1.1.0" }) }, who);
    revoked = true;
    assert.throws(() => h.service.preview({ bundle }, who), refused("plugin.publisher_revoked"));
    await assert.rejects(h.service.confirm({ preview_id: waiting.preview_id, consent: true }, who), refused("plugin.publisher_revoked"), "a preview made before the revocation");
    assert.equal(h.installed.length, 1);
  } finally { await h.done(); }
});

test("RAC-393 S-81 only the person's own action installs: no other audience reaches it, and a user call without the protected entry's user_action is refused", async () => {
  const h = await harness();
  try {
    const actions = new ActionService();
    actions.registerProvider(pluginConsentProvider(h.ledger)); actions.registerProvider(pluginInstallProvider(h.service));
    const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: who.project_id, permissions: PLUGIN_INSTALL_PERMISSIONS, ...extra });
    const bundle = signedPackage(newPublisher());
    const preview = (context: ActionCallContext) => actions.invoke(context, { capability_id: pluginInstallActions.preview.capability_id, version: 1 }, { bundle });
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
      const seen = (await actions.discover(caller({ audience }))).filter(view => view.capability_id.startsWith("plugins.install.") || view.capability_id.startsWith("plugins.publishers."));
      assert.deepEqual(seen, [], `${audience} does not see them`);
      await assert.rejects(preview(caller({ audience })), error => error instanceof ActionError, `${audience} cannot call them`);
    }
    await assert.rejects(preview(caller()), refused("actions.forbidden"), "the entry gave no user action");
    h.nothingWritten();
    const person = caller({ user_action: { source: "management", conversation_ref: "cli:plugin-install", message_ref: "call-one" } });
    const shown = await preview(person) as { preview_id: string; preview: { plugin_id: string } };
    assert.equal(shown.preview.plugin_id, PACKAGE_PLUGIN_ID);
    await assert.rejects(actions.invoke(caller(), { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: shown.preview_id, consent: true, pin_label: "Example" }), refused("actions.forbidden"));
    h.nothingWritten();
    const confirmed = await actions.invoke(person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: shown.preview_id, consent: true, pin_label: "Example" });
    assert.equal((confirmed as { plugin_id: string }).plugin_id, PACKAGE_PLUGIN_ID);
    const listed = await actions.invoke(person, { capability_id: pluginInstallActions.publishers.capability_id, version: 1 }, {}) as { publishers: Array<{ label: string }> };
    assert.deepEqual(listed.publishers.map(pin => pin.label), ["Example"]);
  } finally { await h.done(); }
});

test("S-81 a kept package is read back with the checks it was installed with: its signature, its code, the installation it belongs to", async () => {
  const h = await harness();
  try {
    const publisher = newPublisher(), preview = h.service.preview({ bundle: signedPackage(publisher) }, who);
    await h.service.confirm({ preview_id: preview.preview_id, consent: true, pin_label: "Example" }, who);
    const store = new SandboxPackageStore(h.home), key = [PACKAGE_PLUGIN_ID, publisher.identity, "1.0.0"] as const;
    assert.deepEqual([store.load(...key).pluginId, store.load(...key).packaged?.trust], [PACKAGE_PLUGIN_ID, { level: "pinned", publisher_key_id: publisher.identity }]);
    assert.throws(() => store.load(PACKAGE_PLUGIN_ID, publisher.identity, "9.9.9"), /找不到已安装的插件包/);
    assert.throws(() => store.load(PACKAGE_PLUGIN_ID, newPublisher().identity, "1.0.0"), /找不到已安装的插件包/, "another publisher's key does not read it");
    const [directory] = await readdir(join(h.home, "plugin-packages"));
    const code = join(h.home, "plugin-packages", directory!, "plugin.mjs");
    await chmod(code, 0o600); await writeFile(code, "export const operations = {};\n");
    assert.throws(() => store.load(...key), /被改过/, "code that differs from the signed package is not run");
  } finally { await h.done(); }
});

const mac = { skip: process.platform !== "darwin", timeout: 60_000 };

test("RAC-382 S-81 confirming in a real Host installs the package under pinned trust and starts it in the sandbox", mac, async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-install-host-"));
  const databasePath = join(home, "project.sqlite");
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  seedDemoBoard(databasePath);
  const ref = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const publisher = newPublisher(), client = host.actionClient(ref);
    const person: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: DEMO_PROJECT_ID, permissions: PLUGIN_INSTALL_PERMISSIONS,
      user_action: { source: "management", conversation_ref: "cli:plugin-install", message_ref: "call-host" } };
    const preview = await client.invoke(person, { capability_id: pluginInstallActions.preview.capability_id, version: 1 }, { bundle: signedPackage(publisher) }) as { preview_id: string };
    await client.invoke(person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: preview.preview_id, consent: true, pin_label: "Example" });

    const database = new LocalProjectDatabase(databasePath);
    try {
      const record = new SqlitePluginRuntimeRepository(database.db).list().find((item: PluginInstanceRecord) => item.plugin_id === PACKAGE_PLUGIN_ID);
      assert.deepEqual([record?.publisher_trust, record?.publisher_signature, record?.state, record?.version], ["pinned", publisher.identity, "running", "1.0.0"]);
    } finally { database.close(); }
    assert.deepEqual(new HomeConsentLedger(home).publishers().map(pin => [pin.key_id, pin.label]), [[publisher.identity, "Example"]]);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
