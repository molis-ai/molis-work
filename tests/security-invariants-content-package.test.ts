import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginInstanceRecord, PluginManifest, PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MemoryPluginConsentLedger, PluginRuntime, SqlitePluginRuntimeRepository, resolvePluginActivation } from "@molis-ai/molis-work-plugin-runtime";
import { PluginInstallService, SandboxPackageStore, homeAgentDefinitions, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { CONTENT_PLUGIN_ID, MEETING_NOTES, contentPackageParts, contentPayload, forgedBundle, signedContentPackage, type ContentPackageOptions } from "./fixtures/content-package.js";
import { caller, installedPackageHost, mac } from "./fixtures/signed-package-host.js";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import { newPublisher } from "./fixtures/sandbox-package.js";

// S-content-package (batch 08, 08-6): a plugin with only declarations is installed from its signed content package through the one install
// path (`plugins.install.preview` / `confirm`), and the Host reads that package only as its Manifest declares it. A file the Manifest does
// not declare, a declared file that is missing or whose size or digest differs, a path that leaves the package, a key a plugin with only
// declarations may not write: refused at the preview with nothing written. Installed, it is "declared, not started": no process, no
// action, no MCP tool; its Skills are registered from the verified package while it is enabled, and a kept package that no longer
// verifies is not enabled. Acceptance SKC-02, SKC-03, SKC-04, SKP-01, SKP-08 (specs/skill-packs/spec.md §10).

const AT = "2026-11-08T00:00:00.000Z";
const who = { project_id: "project-one", actor_id: LOCAL_PERSON_ACTOR_ID };
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;
const BODY = `skills/${MEETING_NOTES.id}/SKILL.md`, TEMPLATE = `skills/${MEETING_NOTES.id}/references/template.md`;

/** The install service of a project; an install there adds the record the Runtime would keep, so a later package is an upgrade. */
async function harness(offered: readonly string[] = []) {
  const home = await mkdtemp(join(tmpdir(), "molis-work-content-"));
  const ledger = new MemoryPluginConsentLedger(), records: PluginInstanceRecord[] = [], installed: string[] = [];
  const service = new PluginInstallService({ ledger, packages: new SandboxPackageStore(home), now: () => AT,
    installInProject: async (_project, release) => {
      const manifest = release.packaged!.manifest;
      installed.push(`${manifest.plugin_id}@${manifest.version}`);
      records.splice(0, records.length, { install_id: `install-${manifest.plugin_id}`, installation_generation: "1", plugin_id: manifest.plugin_id, version: manifest.version,
        publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature, manifest_digest: "digest", deployment: "local", selected_entrypoint: "",
        grants: [], execution: "sandbox", publisher_trust: "pinned", state: "running", recovery_count: 0, last_error_code: null, installed_at: AT, updated_at: AT,
        uninstalled_at: null, retain_private_data: false });
    },
    installInHome: async () => { throw new Error("these packages run in a project"); },
    installed: async () => records.map(record => ({ record, manifest: undefined })), control: async () => "disabled",
    offers: (_project, reference) => offered.includes(`${reference.capability_id}@${reference.version}`) });
  const nothingWritten = () => {
    assert.deepEqual(ledger.publishers(), [], "no publisher was pinned");
    assert.equal(existsSync(join(home, "plugin-packages")), false, "no package was kept");
    assert.deepEqual(installed, [], "nothing was installed");
  };
  const install = async (bundle: PluginPackageBundle) => {
    const preview = await service.preview({ bundle }, who);
    return service.confirm({ preview_id: preview.preview_id, consent: true, pin_label: "Example" }, who);
  };
  return { home, ledger, service, installed, nothingWritten, install, done: () => rm(home, { recursive: true, force: true }) };
}

/** The Skill a package declares under `id`, as the preview lists it, with the problems a refusal names. */
const problemsOf = (error: unknown) => ((error as ActionError).details as { problems?: Array<{ skill_id?: string; path?: string; reason: string }> } | undefined)?.problems ?? [];

test("SKC-03 S-content-package a content package whose files are not exactly what its Manifest declares is refused at the preview, naming each file, and nothing is written", async () => {
  // Each package is signed after the change, so its signature verifies and only the Host's reading of the content package can refuse it.
  const publisher = newPublisher();
  const afterwards = (change: (files: Record<string, string>) => void) => signedContentPackage(publisher, {}, change);
  const cases: Array<[string, PluginPackageBundle, string]> = [
    ["a declared body is missing", afterwards(files => { delete files[BODY]; }), BODY],
    ["a declared resource is missing", afterwards(files => { delete files[TEMPLATE]; }), TEMPLATE],
    ["a resource differs from its declared digest", afterwards(files => { files[TEMPLATE] = files[TEMPLATE]!.replace("结论", "结语"); }), TEMPLATE],
    ["a resource is longer than its declared size", afterwards(files => { files[TEMPLATE] = `${files[TEMPLATE]}- 附录\n`; }), TEMPLATE],
    ["a file nothing declares", afterwards(files => { files[`skills/${MEETING_NOTES.id}/scripts/run.sh`] = "rm -rf ~\n"; }), `skills/${MEETING_NOTES.id}/scripts/run.sh`],
  ];
  for (const [label, bundle, path] of cases) {
    const h = await harness();
    try {
      let error: unknown;
      await h.service.preview({ bundle }, who).catch((caught: unknown) => { error = caught; });
      assert.ok(refused("plugin.declaration_invalid")(error), `${label}: ${String(error)}`);
      assert.ok(problemsOf(error).some(problem => problem.path === path), `${label}: names ${path}, got ${JSON.stringify(problemsOf(error))}`);
      h.nothingWritten();
    } finally { await h.done(); }
  }
  // manifest.json that says something else than the Manifest the package carries: refused where every package is read, before the content package is.
  const h = await harness();
  try {
    const { manifest, files } = contentPackageParts(publisher.identity), payload = contentPayload(manifest, files);
    payload.manifest = { ...payload.manifest, name: "另一个名字" };
    await assert.rejects(h.service.preview({ bundle: forgedBundle(publisher, payload) }, who), refused("plugin.package_invalid"));
    h.nothingWritten();
  } finally { await h.done(); }
});

test("SKC-03 S-content-package a package path or declared path that leaves the package, is absolute, or names a folder above it is refused at the preview, and nothing is written", async () => {
  const publisher = newPublisher();
  for (const path of ["../outside.md", "/etc/passwd", "skills/../../outside.md", "skills\\meeting-notes\\SKILL.md"]) {
    const h = await harness();
    try {
      // A file at a path out of the package: signing refuses it, so it comes signed over its bytes as they stand.
      const { manifest, files } = contentPackageParts(publisher.identity);
      files[path] = "越界\n";
      await assert.rejects(h.service.preview({ bundle: forgedBundle(publisher, contentPayload(manifest, files)) }, who), refused("plugin.package_invalid"), path);
      h.nothingWritten();
    } finally { await h.done(); }
  }
  for (const body of ["../outside/SKILL.md", "/skills/meeting-notes/SKILL.md", "skills/../manifest.json"]) {
    const h = await harness();
    try {
      // A declaration that points out of its Skill's folder: the Manifest is refused before any file is read.
      const { manifest, files } = contentPackageParts(publisher.identity);
      manifest.methods![0] = { ...manifest.methods![0]!, body };
      await assert.rejects(h.service.preview({ bundle: forgedBundle(publisher, contentPayload(manifest, files)) }, who),
        (error: unknown) => refused("plugin.declaration_invalid")(error) || refused("plugin.manifest_invalid")(error), body);
      h.nothingWritten();
    } finally { await h.done(); }
  }
});

test("SKC-02 S-content-package a plugin with only declarations that writes an entrypoint, a permission, an action it provides, or a Skill twice is refused at the preview, and nothing is written", async () => {
  const publisher = newPublisher();
  const cases: Array<[string, (manifest: PluginManifest) => void]> = [
    ["an entrypoint", manifest => { manifest.entrypoints = [{ deployment: "local", entrypoint: "plugin.mjs" }]; }],
    ["a permission", manifest => { manifest.permissions = [{ permission: "storage.read", reason: "读", required: true }] as PluginManifest["permissions"]; }],
    ["an action it provides", manifest => { manifest.capabilities = { provides: ["meeting.notes@1"], consumes: [] }; }],
    ["a Skill declared twice", manifest => { manifest.methods = [manifest.methods![0]!, manifest.methods![0]!]; }],
    ["a Skill that names a tool outside the allowed set", manifest => { manifest.methods![0] = { ...manifest.methods![0]!, tools: ["shell.exec"] }; }],
    ["a Skill for a surface that does not exist", manifest => { manifest.methods![0] = { ...manifest.methods![0]!, applies_to: "everywhere" as never }; }],
  ];
  for (const [label, change] of cases) {
    const h = await harness();
    try {
      const { manifest, files } = contentPackageParts(publisher.identity);
      change(manifest);
      await assert.rejects(h.service.preview({ bundle: forgedBundle(publisher, contentPayload(manifest, files)) }, who),
        (error: unknown) => refused("plugin.declaration_invalid")(error) || refused("plugin.manifest_invalid")(error), label);
      h.nothingWritten();
    } finally { await h.done(); }
  }
});

test("SKP-01 SKP-08 the preview of a content package lists each Skill in its declaration's words, off, with its body's opening and its resources, and each requirement with whether this project offers it", async () => {
  const h = await harness(["records.search@1"]);
  try {
    const publisher = newPublisher(), opening = "😀".repeat(300);
    const bundle = signedContentPackage(publisher, {
      skills: [MEETING_NOTES, { id: "weekly-report", name: "周报", body: opening, applies_to: "assistant", resources: { "scripts/collect.sh": "echo 收集\n" } }],
      requires: [{ capability_id: "records.search", version: 1, reason: "检索会议记录" }, { capability_id: "calendar.read", version: 1, optional: true, reason: "读日程" }] });
    const preview = await h.service.preview({ bundle }, who);
    assert.equal(preview.preview.plugin_id, CONTENT_PLUGIN_ID);
    assert.deepEqual([preview.effects, preview.preview.permissions, preview.agent_bodies], [{}, [], undefined], "a plugin with only declarations asks for nothing and ships no role");
    assert.deepEqual(preview.skills?.map(skill => [skill.skill_id, skill.version, skill.name, skill.applies_to, skill.state, skill.runs_scripts, skill.change]),
      [["meeting-notes", 1, "meeting-notes", "both", "off", false, undefined], ["weekly-report", 1, "周报", "assistant", "off", true, undefined]]);
    assert.deepEqual(preview.skills![0]!.resources, [{ path: TEMPLATE, role: "reference", bytes: Buffer.byteLength(MEETING_NOTES.resources!["references/template.md"]!) }]);
    assert.equal(preview.skills![0]!.excerpt, MEETING_NOTES.body);
    assert.equal(preview.skills![1]!.excerpt, "😀".repeat(200), "the opening is 200 code points, not split inside a surrogate pair");
    assert.equal(preview.skills![0]!.user_invocable, true, "not written means it can be named");
    assert.deepEqual(preview.requires, [
      { capability_id: "records.search", version: 1, optional: false, reason: "检索会议记录", satisfied: true },
      { capability_id: "calendar.read", version: 1, optional: true, reason: "读日程", satisfied: false }]);
    h.nothingWritten();
  } finally { await h.done(); }
});

test("SKP-01 S-content-package a Host that cannot say whether a requirement is offered previews no package that has one", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-content-"));
  try {
    const service = new PluginInstallService({ ledger: new MemoryPluginConsentLedger(), packages: new SandboxPackageStore(home), now: () => AT,
      installInProject: async () => undefined, installInHome: async () => undefined, installed: async () => [], control: async () => "disabled" });
    const publisher = newPublisher();
    await assert.rejects(service.preview({ bundle: signedContentPackage(publisher, { requires: [{ capability_id: "records.search", version: 1, reason: "检索" }] }) }, who), refused("plugin.state_invalid"));
    assert.equal((await service.preview({ bundle: signedContentPackage(publisher) }, who)).skills?.length, 1, "without requirements it previews");
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("SKC-04 SKP-01 an upgrade's preview says what changed in each Skill, and a Skill whose body or resources changed without a higher version, or whose version went down, refuses the package at the preview and at the confirmation", async () => {
  const h = await harness();
  const publisher = newPublisher();
  const pkg = (version: string, skills: ContentPackageOptions["skills"], compatibleFrom?: string[]) => signedContentPackage(publisher, { version, skills, ...(compatibleFrom ? { compatibleFrom } : {}) });
  const notes = (version: number, body = MEETING_NOTES.body, template = MEETING_NOTES.resources!["references/template.md"]!) => ({ ...MEETING_NOTES, version, body, resources: { "references/template.md": template } });
  try {
    await h.install(pkg("1.0.0", [notes(1), { id: "agenda" }, { id: "follow-up" }]));
    const upgrade = await h.service.preview({ bundle: pkg("1.1.0", [notes(2, "# 会议纪要 v2\n"), { id: "agenda", version: 2, resources: { "references/x.md": "新附件\n" } }, { id: "minutes" }], ["1.0.0"]) }, who);
    assert.deepEqual(upgrade.skills?.map(skill => [skill.skill_id, skill.version, skill.change, skill.state]), [
      ["meeting-notes", 2, "body_changed", "off"], ["agenda", 2, "resources_changed", "off"], ["minutes", 1, "added", "off"], ["follow-up", 1, "removed", "off"]]);
    const unchanged = await h.service.preview({ bundle: pkg("1.1.0", [notes(1), { id: "agenda" }], ["1.0.0"]) }, who);
    assert.deepEqual(unchanged.skills?.map(skill => [skill.skill_id, skill.change]), [["meeting-notes", undefined], ["agenda", undefined], ["follow-up", "removed"]], "a Skill that did not change says nothing");

    const refusals: Array<[string, PluginPackageBundle, string]> = [
      ["body changed, version kept", pkg("1.1.0", [notes(1, "# 改过的正文\n"), { id: "agenda" }], ["1.0.0"]), "meeting-notes"],
      ["resource changed, version kept", pkg("1.1.0", [notes(1, MEETING_NOTES.body, "## 新模板\n"), { id: "agenda" }], ["1.0.0"]), "meeting-notes"],
    ];
    for (const [label, bundle, skill] of refusals) {
      let error: unknown;
      await h.service.preview({ bundle }, who).catch((caught: unknown) => { error = caught; });
      assert.ok(refused("plugin.declaration_invalid")(error), `${label}: ${String(error)}`);
      assert.deepEqual(problemsOf(error).map(problem => problem.skill_id), [skill], label);
    }

    // The installed package moves between a preview and its confirmation: the confirmation asks again against the one installed now.
    const waiting = await h.service.preview({ bundle: pkg("1.2.0", [notes(2, "# v2\n"), { id: "agenda" }], ["1.0.0", "1.1.0"]) }, who);
    await h.install(pkg("1.1.0", [notes(3, "# v3\n"), { id: "agenda" }], ["1.0.0"]));
    const before = await readdir(join(h.home, "plugin-packages"));
    await assert.rejects(h.service.confirm({ preview_id: waiting.preview_id, consent: true }, who), (error: unknown) =>
      refused("plugin.declaration_invalid")(error) && problemsOf(error).some(problem => problem.skill_id === "meeting-notes"));
    assert.deepEqual(await readdir(join(h.home, "plugin-packages")), before, "the refused package is not kept");
    // At the preview too: a Skill whose version went down, even with the body it had then.
    await assert.rejects(h.service.preview({ bundle: pkg("1.2.0", [notes(2, "# v3\n"), { id: "agenda" }], ["1.1.0"]) }, who), (error: unknown) =>
      refused("plugin.declaration_invalid")(error) && isDeepStrictEqual(problemsOf(error).map(problem => problem.skill_id), ["meeting-notes"]));
    assert.deepEqual(h.installed, [`${CONTENT_PLUGIN_ID}@1.0.0`, `${CONTENT_PLUGIN_ID}@1.1.0`]);
  } finally { await h.done(); }
});

test("SKC-02 a plugin with only declarations is declared, not started: the Runtime runs it without starting anything, and its requirements hold nothing back", async () => {
  const publisher = newPublisher();
  const { manifest } = contentPackageParts(publisher.identity, { requires: [{ capability_id: "nobody.offers", version: 1, reason: "没有提供者" }] });
  let started = 0;
  const definition = { manifest, execution: "sandbox", async start() { started += 1; throw new Error("a plugin with only declarations is never started"); }, async stop() {} } as PluginDefinition;
  const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS });
  const { install } = runtime.install({ definition, deployment: "local", grants: [], trust: { level: "pinned", publisher_key_id: publisher.identity } });
  assert.equal(install.selected_entrypoint, "", "no entrypoint is selected");
  const receipt = await runtime.start(install.install_id);
  assert.deepEqual([receipt.install.state, started], ["running", 0]);
  await runtime.stop(install.install_id);
  assert.equal((await runtime.start(install.install_id)).install.state, "running");
  assert.equal(started, 0, "nor on a second start");
  const resolution = resolvePluginActivation({ manifests: [manifest] });
  assert.deepEqual([resolution.blocked, resolution.order], [[], [manifest.plugin_id]], "an unmet requirement marks its Skills unavailable in the catalog; it does not block the plugin");
});

test("SKC-02 SKP-01 S-content-package in a real Host a content package installs through the one path, exposes no action, and registers its Skills only while it is enabled and its kept package verifies", mac, async () => {
  const h = await installedPackageHost();
  try {
    const publisher = newPublisher();
    const ours = async () => (await h.client.invoke(h.person, { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version }, {}) as
      { plugins: Array<{ plugin_id: string; version: string; state: string; recovery_error: string | null }> }).plugins.filter(item => item.plugin_id === CONTENT_PLUGIN_ID);
    const skills = () => homeAgentDefinitions(h.home).methods().filter(item => item.owner_id === CONTENT_PLUGIN_ID);
    const actions = async () => { await h.host.inspectActions(caller, h.reference); return (await h.client.discover(caller)).map(item => `${item.provider_id} ${item.capability_id}`).sort(); };
    const before = await actions();

    await h.install(signedContentPackage(publisher));
    assert.deepEqual((await ours()).map(item => [item.version, item.state]), [["1.0.0", "running"]]);
    const record = await h.host.withProject(h.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list().find(item => item.plugin_id === CONTENT_PLUGIN_ID));
    assert.deepEqual([record?.selected_entrypoint, record?.execution, record?.publisher_trust, record?.grants], ["", "sandbox", "pinned", []]);
    assert.deepEqual(await actions(), before, "no action, so no MCP tool either");
    assert.deepEqual(skills().map(item => [item.kind, item.name]), [["method", "meeting-notes"]]);
    const skill = skills()[0]!;
    assert.equal(homeAgentDefinitions(h.home).signedMaterial(skill.install_id!, skill.default_ref!).body, MEETING_NOTES.body, "registered from the verified package");

    await h.control("disable", { plugin_id: CONTENT_PLUGIN_ID });
    assert.deepEqual(skills(), [], "a disabled plugin's Skills are not offered");
    await h.control("enable", { plugin_id: CONTENT_PLUGIN_ID });
    assert.deepEqual(skills().map(item => item.name), ["meeting-notes"]);

    await h.reopen();
    assert.deepEqual((await ours()).map(item => item.state), ["running"]);
    assert.deepEqual(skills().map(item => item.name), ["meeting-notes"], "registered again when the Host starts");

    await h.control("uninstall", { plugin_id: CONTENT_PLUGIN_ID, keep_data: false });
    assert.deepEqual(skills(), [], "taken off: its Skills are gone");
    assert.deepEqual((await ours()).filter(item => item.state !== "uninstalled"), []);

    // A kept package altered on disk no longer verifies: the plugin is not enabled and says why.
    await h.install(signedContentPackage(publisher));
    assert.deepEqual(skills().map(item => item.name), ["meeting-notes"]);
    await h.host.close();
    const [directory] = await readdir(join(h.home, "plugin-packages"));
    const kept = join(h.home, "plugin-packages", directory!, "bundle.json");
    const bundle = JSON.parse(await readFile(kept, "utf8")) as PluginPackageBundle;
    const body = bundle.payload.files.find(file => file.path === BODY)!;
    body.content_base64 = Buffer.from("# 被换掉的正文\n").toString("base64");
    await chmod(kept, 0o600); await writeFile(kept, JSON.stringify(bundle));
    await h.reopen();
    const [after] = await ours();
    assert.notEqual(after?.state, "running", "not enabled");
    assert.ok(after?.recovery_error, "and says why");
    assert.deepEqual(skills(), [], "its Skills are not registered");
  } finally { await h.close(); }
});

test("SKC-02 S-content-package in a real Host the Skills of a Home content package are offered while its publisher stands, and not once the publisher is taken back", mac, async () => {
  const h = await installedPackageHost();
  try {
    const publisher = newPublisher();
    const skills = () => homeAgentDefinitions(h.home).methods().filter(item => item.owner_id === CONTENT_PLUGIN_ID).map(item => item.name);
    const installed = () => h.client.invoke(h.person, { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version }, {});
    const preview = await h.client.invoke(h.person, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version },
      { bundle: signedContentPackage(publisher, { scope: "home" }) }) as { preview_id: string; runtime_scope: string };
    assert.equal(preview.runtime_scope, "home");
    await h.client.invoke(h.person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: preview.preview_id, consent: true, pin_label: "Example" });
    assert.deepEqual(skills(), ["meeting-notes"]);
    h.service().revokePublisher(publisher.identity);
    await installed();
    assert.deepEqual(skills(), [], "a publisher taken back: its Skills are not offered");
    await h.reopen();
    await installed();
    assert.deepEqual(skills(), [], "nor after a restart");
  } finally { await h.close(); }
});

test("SKC-04 SKC-05 an upgrade preview reads a home pack's Skill state from the home scope, not from the project's", mac, async () => {
  const h = await installedPackageHost();
  try {
    const publisher = newPublisher(), person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] };
    const homePerson = { ...person, project_id: null }, homeClient = h.host.homeActionClient();
    await h.install(signedContentPackage(publisher, { scope: "home" }));
    const listed = (await homeClient.invoke(homePerson, { capability_id: skillCatalogActions.list.capability_id, version: skillCatalogActions.list.version }, {}) as
      { skills: SkillCatalogEntry[] }).skills.filter(row => row.ref.source.plugin_id === CONTENT_PLUGIN_ID);
    const entry = listed.find(row => row.ref.skill_id === MEETING_NOTES.id);
    assert.ok(entry, "the home install lists its Skill");
    await homeClient.invoke(homePerson, { capability_id: skillCatalogActions.setState.capability_id, version: skillCatalogActions.setState.version },
      { scope: "home", install_id: entry.ref.install_id, skill_id: entry.ref.skill_id, state: "manual", expected_revision: entry.settings_revision });
    const upgrade = signedContentPackage(publisher, { scope: "home", version: "2.0.0", compatibleFrom: ["1.0.0"], skills: [{ ...MEETING_NOTES, version: 2, body: `# ${MEETING_NOTES.id} v2\n` }] });
    const preview = (await h.client.invoke(h.person, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version }, { bundle: upgrade })) as
      { runtime_scope: string; skills?: Array<{ skill_id: string; state: string }> };
    assert.equal(preview.runtime_scope, "home");
    assert.equal(preview.skills?.find(skill => skill.skill_id === MEETING_NOTES.id)?.state, "manual", "the home scope's manual state is what a home pack's upgrade preview shows");
  } finally { await h.close(); }
});
