import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MemoryPluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { packBundledContent, runPluginCli } from "@molis-ai/molis-work-plugin-cli";
import { DEMO_PROJECT_ID, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, bundledPackagesDirectory, homeAgentDefinitions,
  molisWorkHostProjectReference, pluginInstallActions, seedDemoBoard, type BundledPluginList } from "@molis-ai/molis-work-app-local-host";
import { signedContentPackage } from "./fixtures/content-package.js";
import { newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { caller, mac } from "./fixtures/signed-package-host.js";

// S-bundled-packages (batch 08, 08-10): the packages a release ships uninstalled (「随包带上、还没装」, specs/skill-packs/contract-design.md
// §3, §9) lie in one folder of the release's own build output. Lying there gives a package nothing: it is verified as any package is,
// installing it is the person's preview and confirmation, its publisher is not pinned in advance, and before that it is in no Skill
// catalog, registers no method and keeps no setting. Listing them (`plugins.bundled.list@1`) is the person's own read and writes
// nothing. A file that is a link, not a package, altered, unsigned, not a plugin with only declarations, or not named for its plugin, is
// refused with its reason and cannot be installed by reference. No production code names another folder.

const root = fileURLToPath(new URL("..", import.meta.url));
const PACK = join(root, "plugins/content/design-accessibility");
const PLUGIN_ID = "io.molis.work.content.design-accessibility";
const SKILLS = ["accessibility-review", "design-critique", "design-handoff", "design-system", "ux-copy"];
const who = { project_id: "project-one", actor_id: LOCAL_PERSON_ACTOR_ID };
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

/** The design and accessibility pack built with a test publisher key into a bundled folder, beside an empty Home. */
async function bundledFolder() {
  const base = await mkdtemp(join(tmpdir(), "molis-work-bundled-")), folder = join(base, "bundled-plugins"), home = join(base, "home");
  await mkdir(home);
  const publisher = newPublisher();
  const { file } = await packBundledContent(PACK, folder, publisher.signer);
  /** Changes one Skill's body in the bundled file, after it was signed. */
  const tamper = async () => {
    const bundle = JSON.parse(await readFile(file, "utf8")) as PluginPackageBundle;
    const body = bundle.payload.files.find(item => item.path === "skills/ux-copy/SKILL.md")!;
    body.content_base64 = Buffer.from(Buffer.from(body.content_base64, "base64").toString("utf8").replace("界面文字", "随便写写")).toString("base64");
    await writeFile(file, JSON.stringify(bundle));
  };
  return { base, folder, home, file, publisher, tamper, done: () => rm(base, { recursive: true, force: true }) };
}

/** An install service over a bundled folder that records what it would install; nothing reaches a Runtime. */
function service(folder: string | undefined, home: string) {
  const ledger = new MemoryPluginConsentLedger(), installed: string[] = [];
  const install = new PluginInstallService({ ledger, packages: new SandboxPackageStore(home), now: () => "2026-11-08T00:00:00.000Z", ...(folder ? { bundledDirectory: folder } : {}),
    installInProject: async (_project, release) => { installed.push(`project ${release.packaged!.manifest.plugin_id}`); },
    installInHome: async release => { installed.push(`home ${release.packaged!.manifest.plugin_id}`); },
    installed: async () => [], homeInstalled: async () => [], control: async () => "disabled" });
  const nothingWritten = () => {
    assert.deepEqual(ledger.publishers(), [], "no publisher was pinned");
    assert.equal(existsSync(join(home, "plugin-packages")), false, "no package was kept");
    assert.deepEqual(installed, [], "nothing was installed");
  };
  return { install, ledger, installed, nothingWritten };
}

test("08-10 SKP-01 S-bundled-packages a bundled pack is listed with who signed it, listing writes nothing, and it installs only through the preview and the person's confirmation with its publisher not pinned in advance", async () => {
  const b = await bundledFolder();
  try {
    const s = service(b.folder, b.home);
    const list = await s.install.bundled();
    assert.deepEqual(list.refused, []);
    assert.deepEqual(list.plugins.map(item => [item.plugin_id, item.version, item.name, item.name_en, item.runtime_scope, item.publisher.publisher_id, item.publisher.key_id, item.publisher.pinned_label, item.publisher.revoked]),
      [[PLUGIN_ID, "1.0.0", "设计与无障碍", "Design and accessibility", "home", "molis-work", b.publisher.identity, null, false]]);
    assert.ok(list.plugins[0]!.summary);
    s.nothingWritten();

    const preview = await s.install.preview({ bundled: { plugin_id: PLUGIN_ID, version: "1.0.0" } }, who);
    assert.deepEqual([preview.runtime_scope, preview.preview.trust, preview.preview.publisher_pinned, preview.publisher.pinned_label], ["home", "pinned", false, null],
      "the same trust as any signed package; the release pins nobody");
    assert.deepEqual(preview.skills?.map(skill => [skill.skill_id, skill.state]), SKILLS.map(id => [id, "off"]), "installing enables nothing");
    s.nothingWritten();
    await assert.rejects(s.install.confirm({ preview_id: preview.preview_id, consent: true }, who), refused("plugin.publisher_untrusted"), "the person must trust the publisher first");
    s.nothingWritten();

    const again = await s.install.preview({ bundled: { plugin_id: PLUGIN_ID, version: "1.0.0" } }, who);
    assert.deepEqual(await s.install.confirm({ preview_id: again.preview_id, consent: true, pin_label: "Molis Work（测试密钥）" }, who),
      { plugin_id: PLUGIN_ID, version: "1.0.0", publisher_key_id: b.publisher.identity });
    assert.deepEqual(s.installed, [`home ${PLUGIN_ID}`]);
    assert.deepEqual((await s.install.bundled()).plugins.map(item => item.publisher.pinned_label), ["Molis Work（测试密钥）"]);
  } finally { await b.done(); }
});

test("08-10 S-bundled-packages a bundled file altered after signing is listed as refused and cannot be installed by reference; nothing is written", async () => {
  const b = await bundledFolder();
  try {
    await b.tamper();
    const s = service(b.folder, b.home);
    const list = await s.install.bundled();
    assert.deepEqual(list.plugins, []);
    assert.deepEqual(list.refused.map(item => [item.file, item.code]), [[`${PLUGIN_ID}.json`, "plugin.signature_invalid"]]);
    await assert.rejects(s.install.preview({ bundled: { plugin_id: PLUGIN_ID, version: "1.0.0" } }, who), refused("plugin.signature_invalid"));
    s.nothingWritten();
  } finally { await b.done(); }
});

test("08-10 S-bundled-packages a link, a file that is not a package, an unsigned or sandbox package, or one not named for its plugin is refused with its reason, and the rest are still listed", async () => {
  const b = await bundledFolder();
  try {
    const publisher = newPublisher(), outside = join(b.base, "outside.json");
    const unsigned = signedContentPackage(publisher, { pluginId: "io.molis.work.example.unsigned" });
    await writeFile(outside, JSON.stringify(signedContentPackage(publisher, { pluginId: "io.molis.work.example.linked" })));
    await symlink(outside, join(b.folder, "io.molis.work.example.linked.json"));
    await writeFile(join(b.folder, "notes.txt"), "not a package\n");
    await writeFile(join(b.folder, "io.molis.work.example.unsigned.json"), JSON.stringify({ ...unsigned, signature: null, publisher_key: null }));
    await writeFile(join(b.folder, "io.molis.work.example.renamed.json"), JSON.stringify(signedContentPackage(publisher, { pluginId: "io.molis.work.example.other" })));
    const app = signedPackage(publisher);
    await writeFile(join(b.folder, `${app.payload.manifest.plugin_id}.json`), JSON.stringify(app));
    await mkdir(join(b.folder, "nested.json"));
    const s = service(b.folder, b.home);
    const list = await s.install.bundled();
    assert.deepEqual(list.plugins.map(item => item.plugin_id), [PLUGIN_ID], "the good one is still listed");
    assert.deepEqual(Object.fromEntries(list.refused.map(item => [item.file, item.code])), {
      "io.molis.work.example.linked.json": "plugin.package_invalid",
      "io.molis.work.example.renamed.json": "plugin.package_invalid",
      "io.molis.work.example.unsigned.json": "plugin.signature_invalid",
      [`${app.payload.manifest.plugin_id}.json`]: "plugin.declaration_invalid",
      "nested.json": "plugin.package_invalid",
      "notes.txt": "plugin.package_invalid",
    });
    for (const [plugin_id, code] of [["io.molis.work.example.linked", "plugin.package_invalid"], ["io.molis.work.example.unsigned", "plugin.signature_invalid"],
      ["io.molis.work.example.other", "plugin.definition_missing"], ["io.molis.work.example.nowhere", "plugin.definition_missing"]] as const) {
      await assert.rejects(s.install.preview({ bundled: { plugin_id, version: "1.0.0" } }, who), refused(code), plugin_id);
    }
    await assert.rejects(s.install.preview({ bundled: { plugin_id: PLUGIN_ID, version: "0.9.0" } }, who), refused("plugin.definition_missing"), "only the version the person saw");
    s.nothingWritten();
    const none = service(undefined, b.home);
    assert.deepEqual(await none.install.bundled(), { plugins: [], refused: [] }, "a Host given no folder ships nothing");
    await assert.rejects(none.install.preview({ bundled: { plugin_id: PLUGIN_ID, version: "1.0.0" } }, who), refused("plugin.definition_missing"));
  } finally { await b.done(); }
});

test("08-10 S-bundled-packages pack-bundled without a publisher key packs nothing and says the official key is batch 26's", async () => {
  const out = await mkdtemp(join(tmpdir(), "molis-work-bundled-"));
  try {
    const target = join(out, "bundled-plugins");
    await assert.rejects(packBundledContent(PACK, target, undefined), (error: unknown) => error instanceof ActionError && error.code === "plugin.publisher_key_missing" && /26-1/u.test(error.message));
    assert.equal(existsSync(target), false, "no folder, no file");
    const lines: string[] = [], output = { stdout: (text: string) => lines.push(text), stderr: (text: string) => lines.push(text) };
    assert.equal(await runPluginCli(["pack-bundled", PACK, target], output), 1, lines.join(""));
    assert.equal(JSON.parse(lines.at(-1)!).code, "plugin.publisher_key_missing");
    assert.equal(existsSync(target), false, "the command writes nothing either");
  } finally { await rm(out, { recursive: true, force: true }); }
});

test("08-10 S-bundled-packages the bundled folder is the release's own, beside the Host's code, and no production code hands the Host another", () => {
  const hostEntry = fileURLToPath(import.meta.resolve("@molis-ai/molis-work-app-local-host"));
  assert.equal(bundledPackagesDirectory(), join(dirname(hostEntry), "bundled-plugins"), "in the Host package's build output, which the release copies");
  const action = pluginInstallActions.bundled.action;
  assert.deepEqual([action.audiences, action.effect, action.permissions, action.scope], [["user"], "read", ["plugin-install:read"], "home"], "the person's own read");
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "apps", "packages", "horizontal", "modules", "plugins", "server", "tooling", "scripts", "examples"],
    { cwd: root, encoding: "utf8" }).split("\0").filter(file => /\.(?:ts|tsx|mts|mjs)$/u.test(file) && !/(?:^|\/)(?:tests?|dist|node_modules)\//u.test(file) && !/\.test\.[cm]?[tj]sx?$/u.test(file));
  const given: string[] = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    if (!text.includes("bundledPluginsDirectory")) continue;
    const visit = (node: ts.Node): void => {
      if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name.getText() === "bundledPluginsDirectory") given.push(file);
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true));
  }
  assert.deepEqual(given, [], "only a test gives the Host a bundled folder");
});

test("08-10 SKP-01 SKC-02 S-bundled-packages in a real Host the bundled design and accessibility pack is listed to the person only, registers nothing until it is installed through preview and confirm, then its five Skills come from the verified package; altered, it is refused", mac, async () => {
  const b = await bundledFolder();
  const host = new MolisWorkLocalHost({ homeDirectory: b.home, completeText: null, bundledPluginsDirectory: b.folder });
  const databasePath = join(b.home, "project.sqlite"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  try {
    const client = host.actionClient(reference);
    const person = { ...caller, permissions: PLUGIN_INSTALL_PERMISSIONS, user_action: { source: "management" as const, conversation_ref: "08-10:install", message_ref: "08-10:confirm" } };
    const ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
    const ours = () => homeAgentDefinitions(b.home).methods().filter(item => item.owner_id === PLUGIN_ID).map(item => item.name).sort();
    const homeInstalled = async () => (await client.invoke(person, ref(pluginInstallActions.homeInstalled), {}) as { plugins: Array<{ plugin_id: string; state: string }> })
      .plugins.filter(item => item.plugin_id === PLUGIN_ID).map(item => item.state);

    await assert.rejects(client.invoke({ ...person, audience: "agent" }, ref(pluginInstallActions.bundled), {}), "not offered to an Agent");
    await assert.rejects(client.invoke({ ...person, permissions: [] }, ref(pluginInstallActions.bundled), {}), "not without the person's install permission");
    const list = await client.invoke(person, ref(pluginInstallActions.bundled), {}) as BundledPluginList;
    assert.deepEqual(list.plugins.map(item => [item.plugin_id, item.publisher.pinned_label]), [[PLUGIN_ID, null]]);
    assert.deepEqual(ours(), [], "before it is installed: no method registered, so not in the Skill catalog");
    assert.deepEqual(await homeInstalled(), [], "and not installed");

    const preview = await client.invoke(person, ref(pluginInstallActions.preview), { bundled: { plugin_id: PLUGIN_ID, version: "1.0.0" } }) as { preview_id: string; runtime_scope: string };
    assert.equal(preview.runtime_scope, "home");
    assert.deepEqual(ours(), [], "a preview registers nothing either");
    await client.invoke(person, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Molis Work（测试密钥）" });
    assert.deepEqual(await homeInstalled(), ["running"]);
    assert.deepEqual(ours(), SKILLS, "installed and enabled: its Skills are registered from the verified package");

    await b.tamper();
    const after = await client.invoke(person, ref(pluginInstallActions.bundled), {}) as BundledPluginList;
    assert.deepEqual([after.plugins, after.refused.map(item => item.code)], [[], ["plugin.signature_invalid"]]);
    await assert.rejects(client.invoke(person, ref(pluginInstallActions.preview), { bundled: { plugin_id: PLUGIN_ID, version: "1.0.0" } }), /Plugin 内容或签名已改变/u);
    await assert.rejects(client.invoke(person, ref(pluginInstallActions.preview), { bundle: {}, bundled: { plugin_id: PLUGIN_ID, version: "1.0.0" } }), "one package at a time");
  } finally { await host.close(); await b.done(); }
});
