import { installedPackageHost } from "./fixtures/signed-package-host.js";
import { signedAgentPackage } from "./fixtures/sandbox-package.js";
import { homeAgentDefinitions, readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
type PluginInstallPreviewResult = Awaited<ReturnType<PluginInstallService["preview"]>>;
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord, PluginManifest, PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger, SqlitePluginRuntimeRepository, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { DEMO_PROJECT_ID, HomeConsentLedger, HOST_PLUGIN_IDS, LocalProjectDatabase, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, molisWorkHostProjectReference,
  pluginConsentProvider, pluginInstallActions, pluginInstallProvider, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, packageFiles, payloadOf, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { SECOND_PLUGIN_ID } from "./fixtures/home-sandbox.js";

// S-84 (ac-trust T2): a plugin is installed from a signed package only through one path the person walks, and the Host checks the package
// before it writes anything. Unsigned, altered, wrongly signed, from a revoked publisher, or not in the sandbox package format: refused at
// the preview; the confirmation takes only a preview the Host made for this person here, pins a publisher only when the person says so,
// and every one of these actions is the person's own (audience `user`, a protected entry's `user_action`).

const AT = "2026-10-25T00:00:00.000Z";
const who = { project_id: "project-one", actor_id: LOCAL_PERSON_ACTOR_ID };
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

/** The Home's record of a signed package installed there, as its Runtime keeps it. */
const homeRecord = (manifest: PluginManifest): PluginInstanceRecord => ({ install_id: `home-${manifest.plugin_id}-${manifest.version}`, installation_generation: "1",
  plugin_id: manifest.plugin_id, version: manifest.version, publisher_id: "publisher", publisher_signature: manifest.publisher.signature, manifest_digest: "digest",
  deployment: "local", selected_entrypoint: "plugin.mjs", grants: [], execution: "sandbox", publisher_trust: "pinned", state: "running", recovery_count: 0,
  last_error_code: null, installed_at: AT, updated_at: AT, uninstalled_at: null, retain_private_data: false });

/** `withHome`: the Host has a Home, whose installations the confirmation can read (`homeInstalled`); a Home install adds its record there. */
async function harness(ledger: PluginConsentLedger = new MemoryPluginConsentLedger(), withHome = false) {
  const home = await mkdtemp(join(tmpdir(), "molis-work-install-"));
  const installed: Array<{ project: string; plugin: string; trust: unknown }> = [];
  const homeRecords: PluginInstanceRecord[] = [];
  const projectRecords: PluginInstanceRecord[] = [];
  const service = new PluginInstallService({ ledger, packages: new SandboxPackageStore(home), now: () => AT,
    installInProject: async (project, release) => { installed.push({ project, plugin: release.pluginId, trust: release.packaged?.trust }); },
    installInHome: async release => {
      installed.push({ project: "~home", plugin: release.pluginId, trust: release.packaged?.trust });
      if (withHome) homeRecords.push(homeRecord(release.packaged!.manifest));
    },
    installed: async () => projectRecords.map(record => ({ record, manifest: undefined })), control: async () => "disabled",
    ...(withHome ? { homeInstalled: async () => homeRecords.map(record => ({ record, manifest: undefined })) } : {}) });
  /** Nothing the install path writes exists: no pinned publisher, no kept package, no installation. */
  const nothingWritten = () => {
    assert.deepEqual(ledger.publishers(), [], "no publisher was pinned");
    assert.equal(existsSync(join(home, "plugin-packages")), false, "no package was kept");
    assert.deepEqual(installed, [], "nothing was installed");
  };
  return { home, ledger, service, installed, homeRecords, projectRecords, nothingWritten, done: () => rm(home, { recursive: true, force: true }) };
}

test("RAC-387 S-84 a package with no signature is refused at the preview with plugin.signature_invalid, and nothing is written", async () => {
  const h = await harness();
  try {
    const { files, manifest } = packageFiles(newPublisher().identity);
    const unsigned: PluginPackageBundle = { payload: payloadOf(manifest, files), signature: null, publisher_key: null };
    await assert.rejects(h.service.preview({ bundle: unsigned }, who), refused("plugin.signature_invalid"));
    h.nothingWritten();
  } finally { await h.done(); }
});

test("RAC-382 S-84 a package altered after it was signed is refused with plugin.signature_invalid; a key its Manifest does not name with plugin.signer_mismatch", async () => {
  const h = await harness();
  try {
    const publisher = newPublisher(), bundle = signedPackage(publisher);
    const altered = structuredClone(bundle);
    altered.payload.files = altered.payload.files.map(file => file.path === "plugin.mjs" ? { ...file, content_base64: Buffer.from("export const operations = {};\n").toString("base64") } : file);
    await assert.rejects(h.service.preview({ bundle: altered }, who), refused("plugin.signature_invalid"));
    const other = newPublisher();
    await assert.rejects(h.service.preview({ bundle: { ...bundle, publisher_key: { algorithm: "ed25519", spki_base64: other.signer.public_key_spki_base64 } } }, who), refused("plugin.signer_mismatch"));
    h.nothingWritten();
    assert.equal((await h.service.preview({ bundle }, who)).preview.plugin_id, PACKAGE_PLUGIN_ID, "the unaltered package previews");
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
  // BL-588: whatever a Manifest declares beyond the sandbox shape has no sandbox form, so it is refused at the package, not installed to run in the Host.
  ["an integration plugin (a connector driver runs in the Host)", (_files, manifest) => { Object.assign(manifest, { kind: "integration" }); }],
  ["a request for every project's always-on place", (_files, manifest) => { manifest.always_on = true; }],
  ["a look for local tools", (_files, manifest) => { Object.assign(manifest, { local_tools: { tools: [{ tool_id: "git", binaries: ["git"] }] } }); manifest.permissions = [...manifest.permissions, { permission: "local-tools:read", required: true, reason: "x" }]; }],
  ["an event of its own", (_files, manifest) => { Object.assign(manifest, { events: { publishes: [{ event_type_id: "io.molis.work.example.notes.changed", type_version: 1 }], subscribes: [] } }); }],
  ["a port of its own", (_files, manifest) => { Object.assign(manifest, { ports: { inputs: [], outputs: [] } }); }],
  ["a permission the contract does not ask for", (_files, manifest) => { manifest.permissions = [...manifest.permissions, { permission: "network:any", required: true, reason: "x" }]; }],
];

test("RAC-383 S-84 a package that verifies but is not in the sandbox package format is refused with plugin.declaration_invalid, before anything is written", async () => {
  for (const [name, change] of NOT_IN_THE_FORMAT) {
    const h = await harness();
    try {
      const bundle = signedPackage(newPublisher(), change);
      await assert.rejects(h.service.preview({ bundle }, who), refused("plugin.declaration_invalid"), name);
      h.nothingWritten();
    } finally { await h.done(); }
  }
});

test("RAC-383 S-84 an unknown runtime scope is refused before signing with plugin.manifest_invalid, before anything is written", async () => {
  const h = await harness();
  try {
    assert.throws(() => signedPackage(newPublisher(), (_files, manifest) => {
      Object.assign(manifest, { runtime: { scope: "unknown" } });
    }), refused("plugin.manifest_invalid"));
    h.nothingWritten();
  } finally { await h.done(); }
});

test("RAC-382 S-84 a publisher the person has not pinned is pinned only when they give a name, and a preview confirms once", async () => {
  const h = await harness();
  try {
    const publisher = newPublisher(), bundle = signedPackage(publisher);
    const preview = await h.service.preview({ bundle }, who);
    assert.deepEqual([preview.preview.publisher_pinned, preview.publisher.pinned_label, preview.preview.trust], [false, null, "pinned"]);
    await assert.rejects(h.service.confirm({ preview_id: preview.preview_id, consent: true }, who), refused("plugin.publisher_untrusted"));
    h.nothingWritten();
    await assert.rejects(h.service.confirm({ preview_id: preview.preview_id, consent: true, pin_label: "Example" }, who), refused("plugin.preview_unknown"), "the preview was used up");

    const again = await h.service.preview({ bundle }, who);
    await assert.rejects(h.service.confirm({ preview_id: again.preview_id, consent: false, pin_label: "Example" }, who), refused("plugin.consent_required"));
    h.nothingWritten();
    const third = await h.service.preview({ bundle }, who);
    await assert.rejects(h.service.confirm({ preview_id: third.preview_id, consent: true, pin_label: "Example" }, { ...who, project_id: "another-project" }), refused("plugin.preview_unknown"), "a preview belongs to its project");

    const fourth = await h.service.preview({ bundle }, who);
    assert.deepEqual(await h.service.confirm({ preview_id: fourth.preview_id, consent: true, pin_label: "Example" }, who), { plugin_id: PACKAGE_PLUGIN_ID, version: "1.0.0", publisher_key_id: publisher.identity });
    assert.deepEqual(h.ledger.publishers().map(pin => [pin.key_id, pin.label, pin.pinned_by, pin.revoked_at]), [[publisher.identity, "Example", LOCAL_PERSON_ACTOR_ID, null]]);
    assert.deepEqual(h.installed, [{ project: who.project_id, plugin: PACKAGE_PLUGIN_ID, trust: { level: "pinned", publisher_key_id: publisher.identity } }]);

    const pinned = await h.service.preview({ bundle: signedPackage(publisher, undefined, { version: "1.1.0" }) }, who);
    assert.deepEqual([pinned.preview.publisher_pinned, pinned.publisher.pinned_label], [true, "Example"], "a pinned publisher's next package needs no pinning");
    await h.service.confirm({ preview_id: pinned.preview_id, consent: true }, who);
    assert.equal(h.installed.length, 2);
  } finally { await h.done(); }
});

test("RAC-382 S-84 a publisher whose pin was revoked is refused at the preview and again at the confirmation", async () => {
  const memory = new MemoryPluginConsentLedger();
  let revoked = false;
  const h = await harness(Object.assign(Object.create(memory) as PluginConsentLedger, {
    publishers: () => memory.publishers().map(pin => revoked ? { ...pin, revoked_at: AT } : pin) }));
  try {
    const publisher = newPublisher(), bundle = signedPackage(publisher);
    const first = await h.service.preview({ bundle }, who);
    await h.service.confirm({ preview_id: first.preview_id, consent: true, pin_label: "Example" }, who);
    const waiting = await h.service.preview({ bundle: signedPackage(publisher, undefined, { version: "1.1.0" }) }, who);
    revoked = true;
    await assert.rejects(h.service.preview({ bundle }, who), refused("plugin.publisher_revoked"));
    await assert.rejects(h.service.confirm({ preview_id: waiting.preview_id, consent: true }, who), refused("plugin.publisher_revoked"), "a preview made before the revocation");
    assert.equal(h.installed.length, 1);
  } finally { await h.done(); }
});

test("RAC-393 S-84 only the person's own action installs: no other audience reaches it, and a user call without the protected entry's user_action is refused", async () => {
  const h = await harness();
  try {
    const actions = new ActionService();
    actions.registerProvider(pluginConsentProvider(h.ledger)); actions.registerProvider(pluginInstallProvider(h.service));
    const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: who.project_id, permissions: PLUGIN_INSTALL_PERMISSIONS, ...extra });
    const bundle = signedPackage(newPublisher());
    const preview = (context: ActionCallContext) => actions.invoke(context, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version }, { bundle });
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

test("RAC-961 RAC-962 S-80 S-84 a package that asks for the Home previews as home, installs in the Home and nowhere else, and only the person's own action reaches that either", async () => {
  const h = await harness();
  try {
    const home = (change?: (files: PackageFiles, manifest: PluginManifest) => void) => signedPackage(newPublisher(), (files, manifest) => { manifest.runtime = { scope: "home" }; change?.(files, manifest); });
    const preview = await h.service.preview({ bundle: home() }, who);
    assert.equal(preview.runtime_scope, "home");
    assert.equal((await h.service.preview({ bundle: signedPackage(newPublisher()) }, who)).runtime_scope, "project", "a package that says nothing is the project's");
    await h.service.confirm({ preview_id: preview.preview_id, consent: true, pin_label: "Example" }, who);
    assert.deepEqual(h.installed.map(item => item.project), ["~home"], "the Home, not the project the person was in");

    // The same audiences are refused for a Home package as for any other: the Home reaches every project, so asking is not easier.
    const actions = new ActionService();
    actions.registerProvider(pluginConsentProvider(h.ledger)); actions.registerProvider(pluginInstallProvider(h.service));
    const call = (context: ActionCallContext) => actions.invoke(context, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version }, { bundle: home() });
    const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: who.project_id, permissions: PLUGIN_INSTALL_PERMISSIONS, ...extra });
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) await assert.rejects(call(caller({ audience })), error => error instanceof ActionError, `${audience} cannot preview a Home package`);
    await assert.rejects(call(caller()), refused("actions.forbidden"), "a user call without the entry's user action");
    assert.equal(h.installed.length, 1, "none of these installed anything");
  } finally { await h.done(); }
});

test("RAC-961 S-80 a plugin id keeps the range its first kept package gave it: the same id asking for the other range is refused at the preview and again at the confirmation", async () => {
  const h = await harness();
  try {
    const publisher = newPublisher();
    const project = signedPackage(publisher), inHome = signedPackage(publisher, (_files, manifest) => { manifest.runtime = { scope: "home" }; }, { version: "1.1.0" });
    const first = await h.service.preview({ bundle: project }, who);
    // A second preview of the other range is made while nothing is kept yet: it stands until the first one is confirmed.
    const waiting = await h.service.preview({ bundle: inHome }, who);
    await h.service.confirm({ preview_id: first.preview_id, consent: true, pin_label: "Example" }, who);
    await assert.rejects(h.service.preview({ bundle: inHome }, who), refused("plugin.declaration_invalid"), "now that a project package is kept under the id");
    await assert.rejects(h.service.confirm({ preview_id: waiting.preview_id, consent: true }, who), refused("plugin.preview_unknown"), "the preview made before it");
    assert.deepEqual(h.installed.map(item => item.project), [who.project_id], "only the project install happened");
  } finally { await h.done(); }
});

test("S-84 a kept package is read back with the checks it was installed with: its signature, its code, the installation it belongs to", async () => {
  const h = await harness();
  try {
    const publisher = newPublisher(), preview = await h.service.preview({ bundle: signedPackage(publisher) }, who);
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

/** A signed package that asks for the Home. */
const homeBundle = (publisher: ReturnType<typeof newPublisher>, options: { pluginId?: string; version?: string } = {}) =>
  signedPackage(publisher, (_files, manifest) => { manifest.runtime = { scope: "home" }; }, options);

/** Previews and confirms a package as the person, naming its publisher; answers "installed" or the code it was refused with. */
const confirmIn = (service: PluginInstallService) => async (bundle: PluginPackageBundle) => {
  const preview = await service.preview({ bundle }, who);
  return service.confirm({ preview_id: preview.preview_id, consent: true, pin_label: "Example" }, who)
    .then(() => "installed", (error: unknown) => error instanceof ActionError ? error.code : String(error));
};

test("RAC-1500 RAC-1501 RAC-1502 S-84 another publisher's package of a plugin the Home already holds is refused at the confirmation, before its publisher is pinned or the package is kept, whether that installation runs or is switched off", async () => {
  const h = await harness(undefined, true);
  try {
    const a = newPublisher(), b = newPublisher(), c = newPublisher();
    const confirm = confirmIn(h.service);
    const snapshot = async () => ({ pins: h.ledger.publishers().map(pin => pin.key_id).sort(), dirs: (await readdir(join(h.home, "plugin-packages"))).sort(), installs: h.installed.length });
    assert.equal(await confirm(homeBundle(a)), "installed");

    // Each step is compared with what was written just before it, and all of them in one assertion, so a failure shows every step.
    const step = async (bundle: PluginPackageBundle) => { const before = await snapshot(); return { code: await confirm(bundle), unchanged: isDeepStrictEqual(await snapshot(), before) }; };
    const results: Record<string, { code: string; unchanged: boolean }> = {};
    results["RAC-1500 b, not pinned yet"] = await step(homeBundle(b, { version: "2.0.0" }));
    assert.equal(await confirm(homeBundle(c, { pluginId: SECOND_PLUGIN_ID })), "installed", "c is pinned by a plugin of its own");
    results["RAC-1501 c, pinned"] = await step(homeBundle(c, { version: "2.0.0" }));
    h.homeRecords.find(record => record.plugin_id === PACKAGE_PLUGIN_ID)!.state = "disabled";
    results["RAC-1502 b, installation switched off"] = await step(homeBundle(b, { version: "2.1.0" }));
    const refusedUntouched = { code: "plugin.definition_conflict", unchanged: true };
    assert.deepEqual(results, { "RAC-1500 b, not pinned yet": refusedUntouched, "RAC-1501 c, pinned": refusedUntouched, "RAC-1502 b, installation switched off": refusedUntouched },
      "refused, with no publisher pinned, no package kept and nothing installed");
  } finally { await h.done(); }
});

test("RAC-1503 S-84 the other-publisher check refuses only another publisher's package: an id whose Home record the Host built passes it", async () => {
  const h = await harness(undefined, true);
  try {
    const a = newPublisher(), b = newPublisher();
    const confirm = confirmIn(h.service);
    assert.equal(await confirm(homeBundle(a)), "installed");
    // A record the Host built itself is not a signed package's (the Host's own ids are refused at the preview, RAC-1680): this check leaves it alone.
    for (const record of h.homeRecords) record.publisher_trust = "host";
    assert.notEqual(await confirm(homeBundle(b, { version: "2.0.0" })), "plugin.definition_conflict", "an id the Host's own plugin holds is not this check's");
    assert.equal(h.installed.length, 2, "it went on to the Home's install");
  } finally { await h.done(); }
});

test("RAC-1680 RAC-1681 S-84 a package whose plugin id the Host's build ships, or sits on one's dotted path, is refused at the preview with plugin.id_namespace_conflict, in either range, before anything is written", async () => {
  const h = await harness(undefined, true);
  try {
    for (const id of ["io.molis.work.todo", "io.molis.work.files", "io.molis.work.native.workflows"]) assert.ok(HOST_PLUGIN_IDS.has(id), `${id} is one of the Host's`);
    const publisher = newPublisher();
    const cases: Array<[string, PluginPackageBundle]> = [
      ["RAC-1680 a Home package with a Home plugin's id", homeBundle(publisher, { pluginId: "io.molis.work.todo" })],
      ["RAC-1680 a project package with a project plugin's id", signedPackage(publisher, undefined, { pluginId: "io.molis.work.files" })],
      ["RAC-1681 a Home package under a Host plugin's id", homeBundle(publisher, { pluginId: "io.molis.work.todo.notes" })],
      ["RAC-1681 a project package above a Host plugin's id", signedPackage(publisher, undefined, { pluginId: "io.molis.work.native" })],
    ];
    const results: Record<string, string> = {};
    for (const [name, bundle] of cases) results[name] = await h.service.preview({ bundle }, who).then(() => "previewed", (error: unknown) => error instanceof ActionError ? error.code : String(error));
    assert.deepEqual(results, Object.fromEntries(cases.map(([name]) => [name, "plugin.id_namespace_conflict"])), "every one is refused at the preview");
    h.nothingWritten();
  } finally { await h.done(); }
});

test("RAC-1682 S-80 S-84 a compatible Home upgrade is saved and sent to the Home port for running and disabled installations", async () => {
  const h = await harness(undefined, true);
  try {
    const publisher = newPublisher(), confirm = confirmIn(h.service);
    assert.equal(await confirm(homeBundle(publisher)), "installed");
    for (const state of ["running", "disabled"] as const) {
      h.homeRecords[0]!.state = state;
      const bundle = signedPackage(publisher, (_files, manifest) => {
        manifest.runtime = { scope: "home" }; manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
      }, { version: state === "running" ? "1.1.0" : "1.2.0" });
      const count = h.installed.length, pins = h.ledger.publishers();
      assert.equal(await confirm(bundle), "installed");
      assert.equal(h.installed.length, count + 1);
      assert.equal(h.installed.at(-1)!.project, "~home");
      assert.deepEqual(h.ledger.publishers(), pins);
      assert.equal((await readdir(join(h.home, "plugin-packages"))).length, count + 1);
    }
  } finally { await h.done(); }
});

type Harness = Awaited<ReturnType<typeof harness>>;
const CHILD_ID = `${PACKAGE_PLUGIN_ID}.extra`, THIRD_ID = "io.molis.work.example.third";

/** What the install path has written so far: the pinned publishers, the kept packages, the installations. */
const writtenBy = async (h: Harness) => ({ pins: h.ledger.publishers().map(pin => pin.key_id).sort(), installs: h.installed.length,
  dirs: existsSync(join(h.home, "plugin-packages")) ? (await readdir(join(h.home, "plugin-packages"))).sort() : [] });

/** Confirms a package as the person, naming its publisher; answers the code it was refused with, and whether anything the install path writes changed. */
const confirmStep = (h: Harness) => async (bundle: PluginPackageBundle) => {
  const before = await writtenBy(h);
  const code = await confirmIn(h.service)(bundle);
  return { code, unchanged: isDeepStrictEqual(await writtenBy(h), before) };
};

/** The record the Runtime keeps of a signed package of `publisher` that is installed. */
const installedBy = (publisher: ReturnType<typeof newPublisher>, pluginId: string, version = "1.0.0"): PluginInstanceRecord =>
  homeRecord(packageFiles(publisher.identity, undefined, { pluginId, version }).manifest);

/** A package that says it can be upgraded to from these versions. */
const declares = (...versions: string[]) => (_files: PackageFiles, manifest: PluginManifest) => { manifest.upgrade_compatibility = { compatible_from_versions: versions }; };

test("RAC-1835 S-75 S-84 another publisher's package whose plugin id is on the dotted path of an installed plugin's, below it or above it, is refused at the confirmation with plugin.id_namespace_conflict, before its publisher is pinned or the package is kept, in a project and in the Home", async () => {
  const h = await harness(undefined, true);
  try {
    const a = newPublisher(), b = newPublisher(), c = newPublisher();
    const confirm = confirmIn(h.service), step = confirmStep(h);
    const results: Record<string, { code: string; unchanged: boolean }> = {};
    // The project's Runtime holds a's notes plugin.
    h.projectRecords.push(installedBy(a, PACKAGE_PLUGIN_ID));
    results["project, b below a's id, b not pinned yet"] = await step(signedPackage(b, undefined, { pluginId: CHILD_ID }));
    assert.equal(await confirm(signedPackage(c, undefined, { pluginId: THIRD_ID })), "installed", "c is pinned by a plugin of its own");
    results["project, c below a's id, c pinned"] = await step(signedPackage(c, undefined, { pluginId: CHILD_ID }));
    h.projectRecords[0] = installedBy(a, CHILD_ID);
    results["project, b above a's id"] = await step(signedPackage(b, undefined, { pluginId: PACKAGE_PLUGIN_ID }));
    // The Home's Runtime holds a's second plugin.
    assert.equal(await confirm(homeBundle(a, { pluginId: SECOND_PLUGIN_ID })), "installed");
    results["Home, b below a's id"] = await step(homeBundle(b, { pluginId: `${SECOND_PLUGIN_ID}.extra` }));
    results["Home, b above a's id"] = await step(homeBundle(b, { pluginId: "io.molis.work.example" }));
    const refusedUntouched = { code: "plugin.id_namespace_conflict", unchanged: true };
    assert.deepEqual(results, Object.fromEntries(Object.keys(results).map(name => [name, refusedUntouched])), "refused, with no publisher pinned, no package kept and nothing installed");
  } finally { await h.done(); }
});

test("RAC-1836 S-75 S-84 the dotted-path check refuses only another publisher's package: the same publisher's nests, and an id that only starts alike is not on the path", async () => {
  const h = await harness(undefined, true);
  try {
    const a = newPublisher(), b = newPublisher();
    const confirm = confirmIn(h.service);
    h.projectRecords.push(installedBy(a, PACKAGE_PLUGIN_ID));
    assert.equal(await confirm(signedPackage(a, undefined, { pluginId: CHILD_ID })), "installed", "a project: the same publisher's plugin below its own");
    assert.equal(await confirm(signedPackage(b, undefined, { pluginId: `${PACKAGE_PLUGIN_ID}-extra` })), "installed", "a project: another publisher's id that only starts alike is not on the path");
    assert.equal(await confirm(homeBundle(a, { pluginId: SECOND_PLUGIN_ID })), "installed");
    assert.equal(await confirm(homeBundle(a, { pluginId: `${SECOND_PLUGIN_ID}.extra` })), "installed", "the Home: the same publisher's plugin below its own");
    assert.equal(h.installed.length, 4, "all four went on to the install");
  } finally { await h.done(); }
});

test("RAC-1837 S-84 BL-623 in a project, its own publisher's package of an installed plugin that is not an upgrade is refused at the confirmation with plugin.upgrade_required, before the package is kept, and its upgrade goes on", async () => {
  const h = await harness();
  try {
    const a = newPublisher();
    h.projectRecords.push(installedBy(a, PACKAGE_PLUGIN_ID));
    const prior = signedPackage(a);
    new SandboxPackageStore(h.home).save(prior, readSandboxPackage(prior.payload));
    const step = confirmStep(h);
    const results: Record<string, { code: string; unchanged: boolean }> = {};
    results["the same version"] = await step(signedPackage(a));
    results["the same version, declaring it can be upgraded to from itself"] = await step(signedPackage(a, declares("1.0.0")));
    results["an earlier version"] = await step(signedPackage(a, undefined, { version: "0.9.0" }));
    results["a later version that declares nothing"] = await step(signedPackage(a, undefined, { version: "1.1.0" }));
    results["a later version that declares another source"] = await step(signedPackage(a, declares("0.5.0"), { version: "1.1.0" }));
    const refusedUntouched = { code: "plugin.upgrade_required", unchanged: true };
    assert.deepEqual(results, Object.fromEntries(Object.keys(results).map(name => [name, refusedUntouched])), "refused, with no publisher pinned, no package kept and nothing installed");
    assert.equal(await confirmIn(h.service)(signedPackage(a, declares("1.0.0"), { version: "1.1.0" })), "installed", "its upgrade is not in the way");
    assert.equal(h.installed.length, 1, "and it went on to the install");
  } finally { await h.done(); }
});

const mac = { skip: process.platform !== "darwin", timeout: 60_000 };

test("RAC-382 S-84 confirming in a real Host installs the package under pinned trust and starts it in the sandbox", mac, async () => {
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
    const preview = await client.invoke(person, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version }, { bundle: signedPackage(publisher) }) as { preview_id: string };
    await client.invoke(person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: preview.preview_id, consent: true, pin_label: "Example" });

    const database = new LocalProjectDatabase(databasePath);
    try {
      const record = new SqlitePluginRuntimeRepository(database.db).list().find((item: PluginInstanceRecord) => item.plugin_id === PACKAGE_PLUGIN_ID);
      assert.deepEqual([record?.publisher_trust, record?.publisher_signature, record?.state, record?.version], ["pinned", publisher.identity, "running", "1.0.0"]);
    } finally { database.close(); }
    assert.deepEqual(new HomeConsentLedger(home).publishers().map(pin => [pin.key_id, pin.label]), [[publisher.identity, "Example"]]);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("RAC-2640/2643 S-84 preview exposes each signed body and compares the complete installed text before confirmation", { skip: process.platform !== "darwin", timeout: 90_000 }, async () => {
  const h = await installedPackageHost(), publisher = newPublisher(), prefix = "😀".repeat(200);
  const base = { version: "1.1.0", roles: [{ name: "共享名称", purpose: "审阅", body: "agent/role.md" }], methods: [{ name: "将被移除", purpose: "核对", body: "agent/method.md" }], bodies: { "agent/role.md": prefix + "旧尾部" } };
  try {
    const first = signedAgentPackage(publisher, base);
    const peek = await h.client.invoke(h.person, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version }, { bundle: first }) as PluginInstallPreviewResult;
    assert.deepEqual(peek.agent_bodies?.map(item => [item.kind, item.name]), [["role", "共享名称"], ["method", "将被移除"]]);
    assert.equal(peek.agent_bodies![0]!.excerpt, prefix, "200 code points, without splitting surrogate pairs");
    assert.equal(peek.preview.publisher_signature, publisher.identity); assert.equal(peek.preview.version, "1.1.0");
    assert.deepEqual(await h.plugins(), []); assert.deepEqual(h.ledger.publishers(), []);
    await assert.rejects(h.client.invoke(h.person, { capability_id: pluginInstallActions.preview.capability_id, version: 3 }, { bundle: first }));
    await assert.rejects(h.client.invoke(h.person, { capability_id: pluginInstallActions.preview.capability_id, version: 4 }, { bundle: first }));
    await h.install(first);
    const next = signedAgentPackage(publisher, { ...base, version: "1.2.0", compatibleFrom: ["1.1.0"], methods: [{ name: "新增方法", purpose: "整理", body: "agent/new.md" }], bodies: { "agent/role.md": prefix + "新尾部", "agent/new.md": "<script>仅为文本</script>" } });
    const preview = await h.client.invoke(h.person, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version }, { bundle: next }) as PluginInstallPreviewResult;
    // RAC-2643: a changed tail beyond the displayed 200 code points still changes the upgrade preview.
    assert.deepEqual(preview.agent_bodies?.map(item => [item.kind, item.name, item.change]), [["role", "共享名称", "changed"], ["method", "新增方法", "added"], ["method", "将被移除", "removed"]]);
    assert.equal(preview.agent_bodies![0]!.excerpt, prefix, "same excerpt still reports the full-body change");
    assert.equal((await h.plugins())[0]!.version, "1.1.0", "preview keeps the installed version");
    assert.equal(homeAgentDefinitions(h.home).methods().find(item => item.kind === "role" && item.owner_id === PACKAGE_PLUGIN_ID)!.default_ref!.source.plugin_version, "1.1.0");
    await h.client.invoke(h.person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: preview.preview_id, consent: true });
    assert.equal((await h.plugins())[0]!.version, "1.2.0");
    const role = homeAgentDefinitions(h.home).methods().find(item => item.kind === "role" && item.owner_id === PACKAGE_PLUGIN_ID)!;
    assert.equal(homeAgentDefinitions(h.home).signedMaterial(role.install_id!, role.default_ref!).body, prefix + "新尾部");
    await assert.rejects(h.install(signedAgentPackage(publisher, { ...base, version: "1.3.0", compatibleFrom: ["1.2.0"], broken: true, bodies: { "agent/role.md": "未成功的新正文" } })));
    const current = homeAgentDefinitions(h.home).methods().find(item => item.kind === "role" && item.owner_id === PACKAGE_PLUGIN_ID)!;
    assert.equal(current.default_ref!.source.plugin_version, "1.2.0");
    assert.equal(homeAgentDefinitions(h.home).signedMaterial(current.install_id!, current.default_ref!).body, prefix + "新尾部");
  } finally { await h.close(); }
});
