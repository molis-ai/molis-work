import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord, PluginPackageBundle, PluginPackageSigner } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { skillImportActions, SKILLS_MANAGE_PERMISSION } from "@molis-ai/molis-work-contracts/services/skills";
import { MemoryPluginConsentLedger, signPluginPackage, verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { contentPackagePayload, parseContentPackage, skillDeclarationFromFrontmatter, skillFromFolder } from "@molis-ai/molis-work-plugin-sdk";
import { runPluginCli } from "@molis-ai/molis-work-plugin-cli";
import { PluginInstallService, SandboxPackageStore, SkillImportService, homeAgentDefinitions, localSkillScan, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { caller, installedPackageHost, mac } from "./fixtures/signed-package-host.js";

// S-skill-import (batch 08, 08-8): importing Skills from this machine reads only the chosen local Agent's Skills folders (Character
// import's scan, its roots, links and size limits) and makes one content package of the Skills the person picks, signed with this
// Home's publisher identity and installed through the one install path. A Skill that cannot be imported (a frontmatter the reading
// refuses, a hyphenated key, a file outside its resource folders, a folder that is a link) is listed with its reason and leaves the
// others importable; confirming takes only the person's own preview, once, and only its importable Skills. Acceptance SKC-10.

const AT = "2026-11-08T00:00:00.000Z";
const who = { project_id: "project-one", actor_id: LOCAL_PERSON_ACTOR_ID };
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;
const reasons = (error: unknown) => (((error as ActionError).details as { problems?: Array<{ reason: string }> } | undefined)?.problems ?? []).map(problem => problem.reason);

/** A SKILL.md with these frontmatter lines and this body. */
const skillMd = (lines: string[], body = "按步骤做。\n") => ["---", ...lines, "---", "", body].join("\n");
const good = (id: string, extra: string[] = []) => skillMd([`name: ${id}`, `description: 用户要${id}时使用。`, "applies_to: both", ...extra]);

/** Writes a Skill folder `<skills>/<folder>` with its SKILL.md and other files. */
async function writeSkill(skills: string, folder: string, markdown: string, files: Record<string, string> = {}) {
  await mkdir(join(skills, folder), { recursive: true });
  await writeFile(join(skills, folder, "SKILL.md"), markdown);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(skills, folder, path, ".."), { recursive: true });
    await writeFile(join(skills, folder, path), text);
  }
}

/** A person's home with a Claude Code Skills folder, and the install service of a project over a Home of its own. */
async function harness() {
  const root = await mkdtemp(join(tmpdir(), "molis-work-skill-import-")), userHome = join(root, "user"), home = join(root, "home");
  const skills = join(userHome, ".claude", "skills");
  await mkdir(skills, { recursive: true }); await mkdir(home);
  const ledger = new MemoryPluginConsentLedger(), records: PluginInstanceRecord[] = [], packages = new SandboxPackageStore(home);
  const install = new PluginInstallService({ ledger, packages, now: () => AT,
    installInProject: async (_project, release) => {
      const manifest = release.packaged!.manifest;
      records.splice(0, records.length, { install_id: `install-${manifest.plugin_id}`, installation_generation: "1", plugin_id: manifest.plugin_id, version: manifest.version,
        publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature, manifest_digest: "digest", deployment: "local", selected_entrypoint: "",
        grants: [], execution: "sandbox", publisher_trust: "pinned", state: "running", recovery_count: 0, last_error_code: null, installed_at: AT, updated_at: AT,
        uninstalled_at: null, retain_private_data: false });
    },
    installInHome: async () => { throw new Error("imports here go to the project"); },
    installed: async () => records.map(record => ({ record, manifest: undefined })), control: async () => "disabled" });
  const publisher = newPublisher();
  let signed = 0;
  const signer: PluginPackageSigner = { ...publisher.signer, sign: bytes => { signed += 1; return publisher.signer.sign(bytes); } };
  const service = new SkillImportService({ install, scan: localSkillScan(userHome), signer: async () => signer,
    installed: async (pluginId, scope) => {
      const record = scope === "project" ? records.find(item => item.plugin_id === pluginId) : undefined;
      return record && packages.load(pluginId, record.publisher_signature, record.version).packaged;
    } });
  const kept = () => records.map(record => packages.load(record.plugin_id, record.publisher_signature, record.version).packaged!);
  const nothingWritten = () => {
    assert.deepEqual(ledger.publishers(), [], "no publisher was pinned");
    assert.equal(existsSync(join(home, "plugin-packages")), false, "no package was kept");
    assert.deepEqual(records, [], "nothing was installed");
    assert.equal(signed, 0, "nothing was signed");
  };
  return { root, userHome, skills, home, ledger, records, service, publisher, kept, nothingWritten, signedCount: () => signed,
    done: () => rm(root, { recursive: true, force: true }) };
}

test("08-8 S-skill-import a frontmatter key this reading takes is read only as the declaration spells it: argument-hint is refused with argument_hint, a key it does not take is left alone", () => {
  for (const [key, spelled] of [["argument-hint", "argument_hint"], ["user-invocable", "user_invocable"], ["when-to-use", "when_to_use"], ["applies-to", "applies_to"]]) {
    assert.throws(() => skillDeclarationFromFrontmatter(skillMd(["name: notes", "description: 整理时用。", "applies_to: both", `${key}: x`])),
      (error: unknown) => refused("plugin.declaration_invalid")(error) && reasons(error).some(reason => reason.includes(`${key} 要写成 ${spelled}`)), key);
  }
  // Another tool's key (Claude Code's `allowed-tools`) is that tool's: not read, not refused.
  assert.equal(skillDeclarationFromFrontmatter(skillMd(["name: notes", "description: 整理时用。", "applies_to: both", "allowed-tools: Read"])).skill_id, "notes");
});

test("SKC-10 S-skill-import the preview lists every Skill found, each that cannot be imported with its reason, reads only inside the source, and writes and signs nothing", async () => {
  const h = await harness();
  try {
    const outside = join(h.root, "elsewhere");
    await writeSkill(h.skills, "notes", good("notes"), { "references/template.md": "## 模板\n", "scripts/run.sh": "echo hi\n" });
    await writeSkill(h.skills, "multi", skillMd(["name: multi", "description: >", "  两行", "  的说明", "applies_to: both"]));
    await writeSkill(h.skills, "hinted", good("hinted", ["argument-hint: <周期>"]));
    await writeSkill(h.skills, "loose", good("loose"), { "reference.md": "放错了地方\n" });
    await writeSkill(h.skills, "unscoped", skillMd(["name: unscoped", "description: 没写适用范围。"]));
    // A Skill folder that is a link to a folder outside the source, and a resource that is a link out of its Skill.
    await writeSkill(outside, "linked", good("linked"), { "references/secret.md": "来源之外的内容\n" });
    await symlink(join(outside, "linked"), join(h.skills, "linked"));
    await writeFile(join(outside, "leak.md"), "越界的附件\n");
    await writeSkill(h.skills, "leaky", good("leaky"));
    await mkdir(join(h.skills, "leaky", "references")); await symlink(join(outside, "leak.md"), join(h.skills, "leaky", "references", "leak.md"));

    const preview = await h.service.preview({ source: { kind: "runtime", runtime_id: "claude-code" } }, who);
    const by = new Map(preview.candidates.map(candidate => [candidate.skill_id, candidate]));
    assert.deepEqual([...by.keys()].sort(), ["hinted", "leaky", "linked", "loose", "multi", "notes", "unscoped"]);
    assert.deepEqual(preview.candidates.filter(item => item.importable).map(item => item.skill_id).sort(), ["leaky", "notes"]);
    assert.deepEqual([by.get("notes")!.file_count, by.get("notes")!.runs_scripts, by.get("notes")!.change], [3, true, "new"]);
    assert.match(by.get("multi")!.reason!, /多行/u);
    assert.match(by.get("hinted")!.reason!, /argument-hint 要写成 argument_hint/u);
    assert.match(by.get("loose")!.reason!, /reference\.md：不在 references\/、scripts\/、assets\/ 下/u);
    assert.match(by.get("unscoped")!.reason!, /applies_to/u);
    assert.match(by.get("linked")!.reason!, /符号链接/u);
    assert.equal(by.get("leaky")!.file_count, 1, "a resource linking out of its Skill is not read");
    assert.equal(by.get("leaky")!.compatibility, "native-only", "and the Skill says it is incomplete");
    assert.deepEqual([preview.package.version, preview.package.installed_version], ["1.0.0", null]);
    assert.match(preview.package.plugin_id, /^io\.molis\.work\.imported-skills\.claude-code-[0-9a-f]{12}$/u);
    h.nothingWritten();

    // Confirming a Skill the preview did not find importable, someone else's preview, or another project's: refused, nothing written.
    await assert.rejects(h.service.confirm({ preview_id: preview.preview_id, skill_ids: ["linked"], scope: "project" }, who), refused("skills.import_skill_unknown"));
    h.nothingWritten();
    const again = await h.service.preview({ source: { kind: "runtime", runtime_id: "claude-code" } }, who);
    await assert.rejects(h.service.confirm({ preview_id: again.preview_id, skill_ids: ["notes"], scope: "project" }, { ...who, actor_id: "someone-else" }), refused("skills.import_preview_unknown"));
    await assert.rejects(h.service.confirm({ preview_id: again.preview_id, skill_ids: ["notes"], scope: "project" }, { ...who, project_id: "project-two" }), refused("skills.import_preview_unknown"));
    await assert.rejects(h.service.preview({ source: { kind: "runtime", runtime_id: "codex" } }, who), refused("skills.import_source_unavailable"));
    await assert.rejects(h.service.preview({ source: { kind: "project_directory", directory_id: "any" } }, who), refused("skills.import_source_unavailable"));
    h.nothingWritten();
  } finally { await h.done(); }
});

test("SKC-10 S-skill-import confirming makes one content package signed by this Home's publisher and installs it through the one install path; the folder changing later changes nothing installed; importing again is the upgrade", async () => {
  const h = await harness();
  try {
    await writeSkill(h.skills, "notes", good("notes"), { "references/template.md": "## 模板\n" });
    await writeSkill(h.skills, "agenda", good("agenda"));
    const source = { kind: "runtime" as const, runtime_id: "claude-code" as const };
    const first = await h.service.preview({ source }, who);
    const result = await h.service.confirm({ preview_id: first.preview_id, skill_ids: ["notes", "agenda"], scope: "project" }, who);
    assert.deepEqual(result, { plugin_id: first.package.plugin_id, version: "1.0.0", publisher_key_id: h.publisher.identity });
    assert.deepEqual(h.ledger.publishers().map(pin => [pin.key_id, pin.label]), [[h.publisher.identity, "这台电脑"]], "this Home's publisher, pinned when the person confirmed");
    const [installed] = h.kept();
    assert.equal(installed!.manifest.kind, "content");
    assert.deepEqual(installed!.manifest.methods!.map(method => [method.skill_id, method.version]), [["notes", 1], ["agenda", 1]]);
    await assert.rejects(h.service.confirm({ preview_id: first.preview_id, skill_ids: ["notes"], scope: "project" }, who), refused("skills.import_preview_unknown"), "a preview is used once");

    // The folder changes: what is installed is the copy the import made.
    await writeFile(join(h.skills, "notes", "SKILL.md"), good("notes", ["when_to_use: 开会以后"]).replace("按步骤做。", "改过的正文。"));
    assert.match(h.kept()[0]!.agentBodies!.find(body => body.entry_id === "notes")!.body, /按步骤做/u);

    // Importing the same source again upgrades the same plugin: a changed Skill takes the next version, an unchanged one keeps its own.
    const second = await h.service.preview({ source }, who);
    assert.deepEqual([second.package.plugin_id, second.package.version, second.package.installed_version], [first.package.plugin_id, "2.0.0", "1.0.0"]);
    assert.deepEqual(second.candidates.map(item => [item.skill_id, item.change]).sort(), [["agenda", "upgrade"], ["notes", "upgrade"]]);
    await h.service.confirm({ preview_id: second.preview_id, skill_ids: ["notes", "agenda"], scope: "project" }, who);
    const [upgraded] = h.kept();
    assert.equal(upgraded!.manifest.version, "2.0.0");
    assert.deepEqual(upgraded!.manifest.methods!.map(method => [method.skill_id, method.version]), [["notes", 2], ["agenda", 1]]);
    assert.match(upgraded!.agentBodies!.find(body => body.entry_id === "notes")!.body, /改过的正文/u);
  } finally { await h.done(); }
});

test("SKC-10 S-skill-import more Skills than one package holds are refused, not dropped: the person picks fewer or splits them", async () => {
  const h = await harness();
  try {
    const count = SKILL_LIMITS.skillsPerPackage + 1;
    for (let index = 0; index < count; index += 1) await writeSkill(h.skills, `s-${index}`, good(`s-${index}`));
    const preview = await h.service.preview({ source: { kind: "runtime", runtime_id: "claude-code" } }, who);
    assert.equal(preview.candidates.filter(item => item.importable).length, count, "the preview lists them all");
    let error: unknown;
    await h.service.confirm({ preview_id: preview.preview_id, skill_ids: preview.candidates.map(item => item.skill_id), scope: "project" }, who).catch((caught: unknown) => { error = caught; });
    assert.ok(refused("plugin.declaration_invalid")(error), String(error));
    assert.ok(reasons(error).some(reason => reason.includes(`一个包至多 ${SKILL_LIMITS.skillsPerPackage} 个技能`)));
    h.nothingWritten();
    // The action itself takes no more than one package holds.
    assert.equal((skillImportActions.confirm.action.input_schema as { properties: { skill_ids: { maxItems: number } } }).properties.skill_ids.maxItems, SKILL_LIMITS.skillsPerPackage);
  } finally { await h.done(); }
});

test("SKC-10 S-skill-import CLI pack-content packs a folder of Skills with the same packer as the import, refuses a link, and its package is signed like any other", async () => {
  const h = await harness();
  try {
    const folder = join(h.root, "pack"), output = join(h.root, "out.json"), lines: string[] = [];
    await writeSkill(folder, "notes", good("notes"), { "references/template.md": "## 模板\n" });
    const out = { stdout: (value: string) => lines.push(value), stderr: (value: string) => lines.push(value) };
    const options = ["--plugin-id", "io.molis.work.example.packed-skills", "--name", "打包的技能", "--version", "1.0.0", "--publisher-id", "example", "--publisher-key-id", h.publisher.identity];
    assert.equal(await runPluginCli(["pack-content", folder, output, ...options], out), 0, lines.join(""));
    const bundle = JSON.parse(await readFile(output, "utf8")) as PluginPackageBundle;
    assert.deepEqual(parseContentPackage(bundle.payload).manifest.methods!.map(method => method.skill_id), ["notes"]);
    // The import's packer makes the same package from the same folder.
    const files = new Map([["SKILL.md", Buffer.from(good("notes"))], ["references/template.md", Buffer.from("## 模板\n")]]);
    assert.deepEqual(contentPackagePayload({ plugin_id: "io.molis.work.example.packed-skills", version: "1.0.0", name: "打包的技能", scope: "project",
      publisher: { publisher_id: "example", signature: h.publisher.identity }, skills: [skillFromFolder(files)] }), bundle.payload);
    const signed = signPluginPackage(bundle, h.publisher.signer);
    assert.equal(verifyPluginPackageSignature(signed).key_id, h.publisher.identity);

    await symlink(join(folder, "notes", "SKILL.md"), join(folder, "notes", "references", "again.md"));
    lines.length = 0;
    assert.equal(await runPluginCli(["pack-content", folder, join(h.root, "out-2.json"), ...options], out), 1);
    assert.match(lines.join(""), /符号链接/u);
    assert.equal(existsSync(join(h.root, "out-2.json")), false, "nothing is written");
  } finally { await h.done(); }
});

test("SKC-10 S-skill-import in a real Host the person imports a local Skills folder through the actions, it installs as a content plugin and its Skills are registered; an Agent or a call without the person's entry is refused", mac, async () => {
  const userHome = await mkdtemp(join(tmpdir(), "molis-work-user-")), was = process.env.HOME;
  process.env.HOME = userHome;
  try {
    await writeSkill(join(userHome, ".claude", "skills"), "notes", good("notes"));
    const h = await installedPackageHost();
    try {
      const person: ActionCallContext = { ...h.person, permissions: [...h.person.permissions, SKILLS_MANAGE_PERMISSION] };
      const ref = (action: typeof skillImportActions.preview | typeof skillImportActions.confirm) => ({ capability_id: action.capability_id, version: action.version });
      const input = { source: { kind: "runtime", runtime_id: "claude-code" } };
      await assert.rejects(h.client.invoke({ ...caller, permissions: [SKILLS_MANAGE_PERMISSION] }, ref(skillImportActions.preview), input), "without the person's protected entry");
      await assert.rejects(h.client.invoke({ ...person, audience: "agent" }, ref(skillImportActions.preview), input), "not offered to an Agent");
      const preview = await h.client.invoke(person, ref(skillImportActions.preview), input) as { preview_id: string; candidates: Array<{ skill_id: string; importable: boolean }> };
      assert.deepEqual(preview.candidates.map(item => [item.skill_id, item.importable]), [["notes", true]]);
      const result = await h.client.invoke(person, ref(skillImportActions.confirm), { preview_id: preview.preview_id, skill_ids: ["notes"], scope: "project" }) as { plugin_id: string; version: string };
      const listed = await h.client.invoke(h.person, { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version }, {}) as
        { plugins: Array<{ plugin_id: string; version: string; state: string }> };
      assert.deepEqual(listed.plugins.filter(item => item.plugin_id === result.plugin_id).map(item => [item.version, item.state]), [["1.0.0", "running"]]);
      assert.deepEqual(homeAgentDefinitions(h.home).methods().filter(item => item.owner_id === result.plugin_id).map(item => item.name), ["notes"]);
      assert.deepEqual(h.ledger.publishers().map(pin => pin.label), ["这台电脑"]);
    } finally { await h.close(); }
  } finally {
    if (was === undefined) delete process.env.HOME; else process.env.HOME = was;
    await rm(userHome, { recursive: true, force: true });
  }
});
