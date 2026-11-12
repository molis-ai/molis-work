import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os, { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, retainActionAuthority, type ActionExecutionContext, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord, PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { externalTool } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { localPackageSignAction, type LocalPackageSignResult } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { CHARACTER_IMPORT_RUNTIMES } from "@molis-ai/molis-work-contracts/modules/characters";
import { skillImportActions, skillCatalogActions, SKILLS_READ_PERMISSION, type SkillCatalogEntry, type SkillImportPreview, SKILLS_MANAGE_PERMISSION } from "@molis-ai/molis-work-contracts/services/skills";
import { ActionService, type CallOutcome } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger, signPluginPackage, verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { contentPackageDraft, contentPackagePayload, parseContentPackage, skillDeclarationFromFrontmatter, skillFromFolder } from "@molis-ai/molis-work-plugin-sdk";
import { runPluginCli } from "@molis-ai/molis-work-plugin-cli";
import { PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, SkillImportService, homeAgentDefinitions, localSkillScan, pluginInstallActions, pluginInstallProvider, suggestedAppliesTo } from "@molis-ai/molis-work-app-local-host";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { caller, installedPackageHost, mac } from "./fixtures/signed-package-host.js";

// S-skill-import (batch 08, 08-8): importing Skills from this machine reads only the chosen local Agent's Skills folders (Character
// import's scan, its roots, links and size limits) and makes one content package of the Skills the person picks, signed with this
// Home's publisher identity and installed through the one install path. A Skill that cannot be imported (a frontmatter the reading
// refuses, a hyphenated key, a file outside its resource folders, a folder that is a link) is listed with its reason and leaves the
// others importable; confirming takes only the person's own preview, once, and only its importable Skills. Who a Skill is for
// (`applies_to`) is its SKILL.md's when written, else the person's choice at the confirmation, pre-selected from the source and never
// filled in by the Host (spec §9, 2026-11-08 用户定). Acceptance SKC-10.

const AT = "2026-11-08T00:00:00.000Z";
const who = { project_id: "project-one", actor_id: LOCAL_PERSON_ACTOR_ID };
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;
const reasons = (error: unknown) => (((error as ActionError).details as { problems?: Array<{ reason: string }> } | undefined)?.problems ?? []).map(problem => problem.reason);
const signing = { capability_id: localPackageSignAction.capability_id, version: localPackageSignAction.version, provider_id: "plugin-install" };
const confirming = { capability_id: skillImportActions.confirm.capability_id, version: skillImportActions.confirm.version, provider_id: "plugin-install" };
const identityPath = (home: string) => join(home, "config", "plugin-publisher.json");

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
async function harness(hooks: { installed?(): Promise<void>; committing?(): Promise<void>; publisherKeyId?(): string | null; sealedKeyId?(): string | null } = {}) {
  const root = await mkdtemp(join(tmpdir(), "molis-work-skill-import-")), userHome = join(root, "user"), home = join(root, "home");
  const skills = join(userHome, ".claude", "skills");
  await mkdir(skills, { recursive: true }); await mkdir(home);
  const ledger = new MemoryPluginConsentLedger(), records: PluginInstanceRecord[] = [], packages = new SandboxPackageStore(home);
  const byProject = new Map([[who.project_id, records]]);
  const recordsFor = (projectId: string) => { let rows = byProject.get(projectId); if (!rows) { rows = []; byProject.set(projectId, rows); } return rows; };
  const install = new PluginInstallService({ ledger, packages, now: () => AT,
    installInProject: async (project, release, check) => {
      check?.();
      const records = recordsFor(project);
      const manifest = release.packaged!.manifest;
      records.splice(0, records.length, { install_id: `install-${manifest.plugin_id}`, installation_generation: "1", plugin_id: manifest.plugin_id, version: manifest.version,
        publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature, manifest_digest: "digest", deployment: "local", selected_entrypoint: "",
        grants: [], execution: "sandbox", publisher_trust: "pinned", state: "running", recovery_count: 0, last_error_code: null, installed_at: AT, updated_at: AT,
        uninstalled_at: null, retain_private_data: false });
    },
    installInHome: async () => { throw new Error("imports here go to the project"); },
    installed: async project => { await hooks.committing?.(); return recordsFor(project).map(record => ({ record, manifest: undefined })); }, control: async () => "disabled" });
  const signOutcomes: CallOutcome[] = [];
  const actions = new ActionService(undefined, { settled: (_caller, action, outcome) => {
    if (action.capability_id === signing.capability_id) signOutcomes.push(outcome);
  } });
  const storedPublisherKeyId = () => existsSync(identityPath(home)) ? (JSON.parse(readFileSync(identityPath(home), "utf8")) as { key_id: string }).key_id : null;
  const publisherKeyId = () => (hooks.publisherKeyId ? hooks.publisherKeyId() : storedPublisherKeyId());
  const importer = new SkillImportService({ install, scan: localSkillScan(userHome, {}), publisherKeyId,
    readSealedPublisherKeyId: async () => (hooks.sealedKeyId ? hooks.sealedKeyId() : null),
    sign: async (input, caller) => await actions.invoke(retainActionAuthority(caller, confirming, caller.beforeEffect), signing, input) as LocalPackageSignResult,
    retained: (pluginId, keyId) => packages.releases(pluginId, keyId),
    retainedOf: pluginId => packages.releasesOf(pluginId),
    installed: async (pluginId, scope, project) => {
      await hooks.installed?.();
      const record = scope === "project" ? recordsFor(project).find(item => item.plugin_id === pluginId) : undefined;
      return record && packages.load(pluginId, record.publisher_signature, record.version).packaged;
    } });
  actions.registerProvider(pluginInstallProvider(install, importer, home));
  const control: ActionExecutionContext = { ...who, call_id: "skill-import-test", audience: "user", permissions: [...PLUGIN_INSTALL_PERMISSIONS, SKILLS_MANAGE_PERMISSION],
    user_action: { source: "web", conversation_ref: "test", message_ref: "confirm" }, beforeEffect: async () => undefined };
  const service = { preview: importer.preview.bind(importer), confirm: (input: Parameters<SkillImportService['confirm']>[0], person: typeof who) =>
    importer.confirm(input, person, { ...control, ...person }) };
  const kept = () => records.map(record => packages.load(record.plugin_id, record.publisher_signature, record.version).packaged!);
  const nothingWritten = () => {
    assert.deepEqual(ledger.publishers(), [], "no publisher was pinned");
    assert.equal(existsSync(join(home, "plugin-packages")), false, "no package was kept");
    assert.deepEqual(records, [], "nothing was installed");
    assert.equal(publisherKeyId(), null, "no signing identity was created");
    assert.equal(signOutcomes.some(outcome => outcome.ok), false, "no signing completed");
  };
  return { root, userHome, skills, home, ledger, records, recordsFor, packages, service, actions, publisherKeyId: storedPublisherKeyId, kept, nothingWritten, signOutcomes,
    done: () => rm(root, { recursive: true, force: true }) };
}

test("08-8 S-skill-import a frontmatter key this reading takes is read only as the declaration spells it: argument-hint is refused with argument_hint, a key it does not take is left alone", () => {
  for (const [key, spelled] of [["argument-hint", "argument_hint"], ["user-invocable", "user_invocable"], ["when-to-use", "when_to_use"], ["when-not-to-use", "when_not_to_use"], ["applies-to", "applies_to"], ["connector-categories", "connector_categories"]]) {
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
    await writeSkill(h.skills, "undescribed", skillMd(["name: undescribed", "applies_to: both"]));
    // A Skill folder that is a link to a folder outside the source, and a resource that is a link out of its Skill.
    await writeSkill(outside, "linked", good("linked"), { "references/secret.md": "来源之外的内容\n" });
    await symlink(join(outside, "linked"), join(h.skills, "linked"));
    await writeFile(join(outside, "leak.md"), "越界的附件\n");
    await writeSkill(h.skills, "leaky", good("leaky"));
    await mkdir(join(h.skills, "leaky", "references")); await symlink(join(outside, "leak.md"), join(h.skills, "leaky", "references", "leak.md"));

    const preview = await h.service.preview({ source: { kind: "runtime", runtime_id: "claude-code" } }, who);
    const by = new Map(preview.candidates.map(candidate => [candidate.skill_id, candidate]));
    assert.deepEqual([...by.keys()].sort(), ["hinted", "leaky", "linked", "loose", "multi", "notes", "undescribed", "unscoped"]);
    assert.deepEqual(preview.candidates.filter(item => item.importable).map(item => item.skill_id).sort(), ["leaky", "notes", "unscoped"]);
    assert.deepEqual([by.get("notes")!.file_count, by.get("notes")!.runs_scripts, by.get("notes")!.change], [3, true, "new"]);
    assert.match(by.get("multi")!.reason!, /多行/u);
    assert.match(by.get("hinted")!.reason!, /argument-hint 要写成 argument_hint/u);
    assert.match(by.get("loose")!.reason!, /reference\.md：不在 references\/、scripts\/、assets\/ 下/u);
    // A SKILL.md without `applies_to` is importable, for whom the person chooses; one without `description` still is not.
    assert.deepEqual([by.get("unscoped")!.applies_to, by.get("unscoped")!.applies_to_from, by.get("unscoped")!.reason], ["coding", "suggested", undefined]);
    assert.deepEqual([by.get("notes")!.applies_to, by.get("notes")!.applies_to_from], ["both", "file"]);
    assert.match(by.get("undescribed")!.reason!, /description/u);
    assert.deepEqual([by.get("multi")!.applies_to, by.get("multi")!.applies_to_from], [undefined, undefined], "a Skill that cannot be imported says no 「给谁用」");
    assert.equal(preview.applies_to, "coding", "a coding tool's Skills folder pre-selects coding");
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
    const native = await h.service.preview({ source: { kind: "runtime", runtime_id: "claude-code" } }, who);
    await h.service.confirm({ preview_id: native.preview_id, skill_ids: ["leaky"], scope: "project" }, who);
    assert.equal(h.kept()[0]?.manifest.methods?.[0]?.native_only_reason, by.get("leaky")!.reason);

  } finally { await h.done(); }
});

// B12 (round-2 review): the preview used to fall back to 「1.0.0」 when this Home's publisher metadata was unreadable, while the
// confirmation recovered the sealed identity and installed the next major. Both now count the retained releases of the source, so the
// version the person sees in the preview is the one the confirmation installs.
test("B12 S-skill-import the preview and the confirmation name the same next version when the publisher metadata is unreadable and the sealed identity recovers it", async () => {
  let metadataUnreadable = true, sealed: string | null = null;
  const h = await harness({ publisherKeyId: () => metadataUnreadable ? null : sealed, sealedKeyId: () => sealed });
  try {
    await writeSkill(h.skills, "notes", good("notes"));
    const source = { kind: "runtime" as const, runtime_id: "claude-code" as const };
    const first = await h.service.preview({ source }, who);
    assert.deepEqual([first.package.version, first.package.installed_version], ["1.0.0", null]);
    assert.equal((await h.service.confirm({ preview_id: first.preview_id, skill_ids: ["notes"], scope: "project" }, who)).version, "1.0.0");
    sealed = h.publisherKeyId();
    assert.ok(sealed, "the confirmation created this Home's sealed publisher identity");
    await writeFile(join(h.skills, "notes", "SKILL.md"), good("notes").replace("按步骤做。", "改过的正文。"));
    const second = await h.service.preview({ source }, who);
    const upgraded = await h.service.confirm({ preview_id: second.preview_id, skill_ids: ["notes"], scope: "project" }, who);
    assert.deepEqual([second.package.version, second.package.installed_version], ["2.0.0", "1.0.0"]);
    assert.equal(upgraded.version, "2.0.0", "the version the confirmation installs is the one the preview named");
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
    assert.deepEqual(result, { plugin_id: first.package.plugin_id, version: "1.0.0", publisher_key_id: h.publisherKeyId() });
    assert.deepEqual(h.ledger.publishers().map(pin => [pin.key_id, pin.label]), [[h.publisherKeyId(), "这台电脑"]], "this Home's publisher, pinned when the person confirmed");
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

test("SKC-10 S-skill-import 给谁用: a SKILL.md without applies_to imports with the person's choice, a confirmation without one is refused, an author's value is not overridden, and the pre-selection follows the source", async () => {
  const h = await harness();
  try {
    await writeSkill(h.skills, "notes", good("notes").replace("applies_to: both", "applies_to: assistant"));
    await writeSkill(h.skills, "plain", skillMd(["name: plain", "description: 用户要整理时使用。"]));
    const source = { kind: "runtime" as const, runtime_id: "claude-code" as const }, preview = () => h.service.preview({ source }, who);
    const first = await preview(), by = new Map(first.candidates.map(item => [item.skill_id, item]));
    assert.equal(first.applies_to, "coding");
    assert.deepEqual([by.get("plain")!.applies_to, by.get("plain")!.applies_to_from], ["coding", "suggested"], "suggested, not yet chosen");
    assert.deepEqual([by.get("notes")!.applies_to, by.get("notes")!.applies_to_from], ["assistant", "file"]);

    // The suggestion alone does not count: a confirmation that names no choice for `plain` is refused, and nothing is written.
    await assert.rejects(h.service.confirm({ preview_id: first.preview_id, skill_ids: ["notes", "plain"], scope: "project" }, who), refused("skills.import_applies_to_invalid"));
    h.nothingWritten();
    // An author's own value is not overridden, even to the suggestion.
    for (const applies_to of [[{ skill_id: "notes", applies_to: "coding" as const }, { skill_id: "plain", applies_to: "coding" as const }],
      [{ skill_id: "notes", applies_to: "assistant" as const }, { skill_id: "plain", applies_to: "coding" as const }]]) {
      await assert.rejects(h.service.confirm({ preview_id: (await preview()).preview_id, skill_ids: ["notes", "plain"], scope: "project", applies_to }, who), refused("skills.import_applies_to_invalid"));
    }
    // A choice for a Skill not chosen, or two for one, is refused too.
    await assert.rejects(h.service.confirm({ preview_id: (await preview()).preview_id, skill_ids: ["notes"], scope: "project", applies_to: [{ skill_id: "plain", applies_to: "both" }] }, who),
      refused("skills.import_applies_to_invalid"));
    await assert.rejects(h.service.confirm({ preview_id: (await preview()).preview_id, skill_ids: ["plain"], scope: "project",
      applies_to: [{ skill_id: "plain", applies_to: "both" }, { skill_id: "plain", applies_to: "coding" }] }, who), refused("skills.import_applies_to_invalid"));
    h.nothingWritten();

    // The person's choice, not the suggestion, is what the signed package says; the author's value stays the author's.
    await h.service.confirm({ preview_id: (await preview()).preview_id, skill_ids: ["notes", "plain"], scope: "project", applies_to: [{ skill_id: "plain", applies_to: "assistant" }] }, who);
    assert.deepEqual(h.kept()[0]!.manifest.methods!.map(method => [method.skill_id, method.applies_to, method.version]), [["notes", "assistant", 1], ["plain", "assistant", 1]]);
    // Choosing again on the next import is a change of that Skill: its version counts up, the other's does not.
    await h.service.confirm({ preview_id: (await preview()).preview_id, skill_ids: ["notes", "plain"], scope: "project", applies_to: [{ skill_id: "plain", applies_to: "both" }] }, who);
    assert.deepEqual(h.kept()[0]!.manifest.methods!.map(method => [method.skill_id, method.applies_to, method.version]), [["notes", "assistant", 1], ["plain", "both", 2]]);

    // The pre-selection follows the source: every local Agent the import reads is a coding tool; any other source suggests both.
    for (const runtime_id of CHARACTER_IMPORT_RUNTIMES) assert.equal(suggestedAppliesTo({ kind: "runtime", runtime_id }), "coding", runtime_id);
    assert.equal(suggestedAppliesTo({ kind: "project_directory", directory_id: "any" }), "both");
    // A project directory is not a source in this batch (spec §9, 2026-11-08 用户定; BACKLOG): refused before anything is read.
    await assert.rejects(h.service.preview({ source: { kind: "project_directory", directory_id: "any" } }, who), refused("skills.import_source_unavailable"));
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
    const folder = join(h.root, "pack"), output = join(h.root, "out.json"), lines: string[] = [], publisher = newPublisher();
    await writeSkill(folder, "notes", good("notes"), { "references/template.md": "## 模板\n" });
    const out = { stdout: (value: string) => lines.push(value), stderr: (value: string) => lines.push(value) };
    const options = ["--plugin-id", "io.molis.work.example.packed-skills", "--name", "打包的技能", "--version", "1.0.0", "--publisher-id", "example", "--publisher-key-id", publisher.identity];
    assert.equal(await runPluginCli(["pack-content", folder, output, ...options], out), 0, lines.join(""));
    const bundle = JSON.parse(await readFile(output, "utf8")) as PluginPackageBundle;
    assert.deepEqual(parseContentPackage(bundle.payload).manifest.methods!.map(method => method.skill_id), ["notes"]);
    // The import's packer makes the same package from the same folder.
    const files = new Map([["SKILL.md", Buffer.from(good("notes"))], ["references/template.md", Buffer.from("## 模板\n")]]);
    assert.deepEqual(contentPackagePayload({ plugin_id: "io.molis.work.example.packed-skills", version: "1.0.0", name: "打包的技能", scope: "project",
      publisher: { publisher_id: "example", signature: publisher.identity }, skills: [skillFromFolder(files)] }), bundle.payload);
    const signed = signPluginPackage(bundle, publisher.signer);
    assert.equal(verifyPluginPackageSignature(signed).key_id, publisher.identity);

    await symlink(join(folder, "notes", "SKILL.md"), join(folder, "notes", "references", "again.md"));
    lines.length = 0;
    assert.equal(await runPluginCli(["pack-content", folder, join(h.root, "out-2.json"), ...options], out), 1);
    assert.match(lines.join(""), /符号链接/u);
    assert.equal(existsSync(join(h.root, "out-2.json")), false, "nothing is written");
  } finally { await h.done(); }
});

for (const scope of ["project", "home"] as const) test(`SKC-10 SPC-15 S-skill-import in a real Host the person imports a local Skills folder through the actions, it installs as a content plugin and its Skills are registered; an Agent or a call without the person's entry is refused (${scope})`, mac, async () => {
  const userHome = await mkdtemp(join(tmpdir(), "molis-work-user-")), was = process.env.HOME;
  process.env.HOME = userHome;
  try {
    await writeSkill(join(userHome, ".claude", "skills"), "notes", good("notes"), { "scripts/run.sh": "echo test\n" });
    await writeSkill(join(userHome, ".claude", "skills"), "plain", skillMd(["name: plain", "description: 用户要整理时使用。"]));
    const h = await installedPackageHost();
    try {
      const prior = contentPackageDraft({ plugin_id: "io.molis.work.example.previously-signed", version: "1.0.0", name: "Previous publication",
        scope: "home", skills: [skillFromFolder(new Map([["SKILL.md", Buffer.from(good("prior"))]]))] });
      const { preview_id: priorPreview } = await h.client.invoke(h.person, signing, prior) as LocalPackageSignResult;
      await h.client.invoke(h.person, pluginInstallActions.confirm, { preview_id: priorPreview, consent: true, pin_label: "My existing publisher" });
      const signChecks: string[] = [];
      const person: ActionCallContext = { ...h.person, permissions: [...h.person.permissions, SKILLS_MANAGE_PERMISSION],
        validate_authority: async reference => {
          if (reference.capability_id === signing.capability_id) signChecks.push(reference.provider_id!);
        } };
      const ref = (action: typeof skillImportActions.preview | typeof skillImportActions.confirm) => ({ capability_id: action.capability_id, version: action.version });
      const input = { source: { kind: "runtime", runtime_id: "claude-code" } };
      await assert.rejects(h.client.invoke({ ...caller, permissions: [SKILLS_MANAGE_PERMISSION] }, ref(skillImportActions.preview), input), "without the person's protected entry");
      await assert.rejects(h.client.invoke({ ...person, audience: "agent" }, ref(skillImportActions.preview), input), "not offered to an Agent");
      const preview = await h.client.invoke(person, ref(skillImportActions.preview), input) as
        { preview_id: string; applies_to: string; candidates: Array<{ skill_id: string; importable: boolean; applies_to_from: string }> };
      assert.deepEqual(preview.candidates.map(item => [item.skill_id, item.importable, item.applies_to_from]).sort(), [["notes", true, "file"], ["plain", true, "suggested"]]);
      assert.equal(preview.applies_to, "coding");
      const selected = { skill_ids: ["notes", "plain"], scope, applies_to: [{ skill_id: "plain", applies_to: "coding" }] };
      const result = await h.client.invoke(person, confirming, { preview_id: preview.preview_id, ...selected }) as { plugin_id: string; version: string; publisher_key_id: string };
      const listed = await h.client.invoke(h.person, scope === "home" ? pluginInstallActions.homeInstalled : pluginInstallActions.installed, {}) as
        { plugins: Array<{ plugin_id: string; version: string; state: string }> };
      assert.deepEqual(listed.plugins.filter(item => item.plugin_id === result.plugin_id).map(item => [item.version, item.state]), [["1.0.0", "running"]]);
      assert.deepEqual(homeAgentDefinitions(h.home).methods().filter(item => item.owner_id === result.plugin_id).map(item => item.name).sort(), ["notes", "plain"]);
      assert.deepEqual(h.ledger.publishers().map(pin => [pin.key_id, pin.label]), [[result.publisher_key_id, "My existing publisher"]]);
      assert.ok(signChecks.length > 0, "the import entered the shared signing action with this person's authority");
      assert.deepEqual([...new Set(signChecks)], [signing.provider_id]);
      await h.reopen();
      const catalog = await h.client.invoke({ ...person, permissions: [...person.permissions, SKILLS_READ_PERMISSION] },
        { capability_id: skillCatalogActions.list.capability_id, version: skillCatalogActions.list.version }, {}) as { skills: SkillCatalogEntry[] };
      const imported = catalog.skills.find(skill => skill.pack.plugin_id === result.plugin_id && skill.ref.skill_id === "notes")!;
      assert.equal(imported.pack.trust, "home_local");
      assert.equal(imported.state, "off");
      assert.equal(imported.availability.available, false);
      if (!imported.availability.available) assert.equal(imported.availability.reason, "native_only");

      // Interrupted identity creation already has the sealed key and retained releases. The import preview must never repair metadata.
      const metadata = await readFile(identityPath(h.home), "utf8");
      await rm(identityPath(h.home));
      await writeFile(join(userHome, ".claude", "skills", "notes", "SKILL.md"), good("notes").replace("按步骤做。", "更新后的正文。"));
      const nextPreview = async () => (await h.client.invoke(person, ref(skillImportActions.preview), input) as { preview_id: string }).preview_id;
      const unauthorized = await nextPreview();
      assert.equal(existsSync(identityPath(h.home)), false);
      await assert.rejects(h.client.invoke({ ...person, permissions: [SKILLS_MANAGE_PERMISSION] }, confirming, { preview_id: unauthorized, ...selected }), refused("actions.forbidden"));
      assert.equal(existsSync(identityPath(h.home)), false, "a caller without signing authority cannot repair the metadata");

      const next = await h.client.invoke(person, confirming, { preview_id: await nextPreview(), ...selected }) as typeof result;
      assert.deepEqual(next, { ...result, version: "2.0.0" });
      assert.equal(await readFile(identityPath(h.home), "utf8"), metadata);
      const store = new SandboxPackageStore(h.home);
      const upgraded = store.load(next.plugin_id, next.publisher_key_id, next.version).packaged!;
      assert.deepEqual(upgraded.manifest.upgrade_compatibility?.compatible_from_versions, ["1.0.0"]);
      assert.deepEqual(upgraded.manifest.methods?.map(method => [method.skill_id, method.version]), [["notes", 2], ["plain", 1]]);
      assert.deepEqual(h.ledger.publishers().map(pin => pin.label), ["My existing publisher"]);
    } finally { await h.close(); }
  } finally {
    if (was === undefined) delete process.env.HOME; else process.env.HOME = was;
    await rm(userHome, { recursive: true, force: true });
  }
});


test("SPC-15 S-skill-import a retained 9.0.0 makes the final import exceed the budget without restoring public metadata", mac, async t => {
  const userHome = await mkdtemp(join(tmpdir(), "molis-skill-budget-user-"));
  const mockedHome = t.mock.method(os, "homedir", () => userHome);
  syncBuiltinESMExports();
  t.after(async () => { mockedHome.mock.restore(); syncBuiltinESMExports(); await rm(userHome, { recursive: true, force: true }); });
  const skillsDir = join(userHome, ".claude", "skills"), markdown = good("notes");
  await writeSkill(skillsDir, "notes", markdown);
  const h = await installedPackageHost();
  t.after(h.close);
  const person: ActionCallContext = { ...h.person, permissions: [...h.person.permissions, SKILLS_MANAGE_PERMISSION] };
  const preview = async () => await h.client.invoke(person, skillImportActions.preview, { source: { kind: "runtime", runtime_id: "claude-code" } }) as SkillImportPreview;
  const pluginId = (await preview()).package.plugin_id, body = Buffer.from(markdown);
  const pack = { plugin_id: pluginId, name: `从 ${externalTool("claude-code").display_name} 导入的技能`, scope: "project" as const };
  const retained = contentPackageDraft({ ...pack, version: "9.0.0", skills: [skillFromFolder(new Map([["SKILL.md", body]]), { version: 9 })] });
  const { preview_id } = await h.client.invoke(person, signing, retained) as LocalPackageSignResult;
  const { publisher_key_id } = await h.client.invoke(person, pluginInstallActions.confirm, { preview_id, consent: true, pin_label: "Previous publisher" }) as { publisher_key_id: string };
  await h.control("uninstall", { plugin_id: pluginId, keep_data: true });
  await rm(identityPath(h.home));

  // The current selection fits exactly in the provisional version. With the retained release, both the package and its changed Skill take version 10.
  const chunk = Buffer.alloc(SKILL_LIMITS.fileBytes, "x");
  const chunkCount = Math.floor(SKILL_LIMITS.packageBytes / SKILL_LIMITS.fileBytes);
  const files = new Map<string, Buffer>([["SKILL.md", body]]);
  for (let index = 0; index < chunkCount; index++) files.set(`assets/chunk-${index}.txt`, chunk);
  const manifestBytes = () => {
    const skill = skillFromFolder(files), { manifest } = contentPackageDraft({ ...pack, version: "1.0.0", skills: [{ ...skill, files: new Map() }] });
    return Buffer.byteLength(JSON.stringify({ ...manifest, publisher: { publisher_id: "molis-home", signature: publisher_key_id } }));
  };
  const tailBytes = SKILL_LIMITS.packageBytes - body.length - (chunkCount - 1) * chunk.length - manifestBytes();
  assert.ok(tailBytes > 0 && tailBytes < chunk.length);
  files.set(`assets/chunk-${chunkCount - 1}.txt`, chunk.subarray(0, tailBytes));
  assert.equal([...files.values()].reduce((bytes, file) => bytes + file.length, manifestBytes()), SKILL_LIMITS.packageBytes);
  await mkdir(join(skillsDir, "notes", "assets"));
  for (const [path, bytes] of files) await writeFile(join(skillsDir, "notes", path), bytes);
  const next = await preview();
  assert.equal(next.package.installed_version, null);
  assert.equal(next.candidates.find(skill => skill.skill_id === "notes")?.importable, true);
  await assert.rejects(h.client.invoke(person, confirming, { preview_id: next.preview_id, skill_ids: ["notes"], scope: "project" }),
    error => refused("plugin.declaration_invalid")(error) && reasons(error).some(reason => reason.includes("内容包合计超过")));
  assert.equal(existsSync(identityPath(h.home)), false, "a rejected final package never restores publisher metadata");
  assert.deepEqual(new SandboxPackageStore(h.home).releases(pluginId, publisher_key_id).map(pkg => pkg.manifest.version), ["9.0.0"]);
});

test("SKC-10 S-skill-import cancelled or revoked imports cannot sign or commit after asynchronous reads", async () => {
  for (const stage of ["source", "commit"] as const) for (const reason of ["cancelled", "forbidden"] as const) {
    let waiting = false, entered!: () => void, resume!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { resume = resolve; });
    const hook = async () => { if (waiting) { entered(); await held; } };
    const h = await harness(stage === "source" ? { installed: hook } : { committing: hook });
    try {
      await writeSkill(h.skills, "notes", good("notes"));
      const preview = await h.service.preview({ source: { kind: "runtime", runtime_id: "claude-code" } }, who);
      const controller = new AbortController(); let revoked = false;
      const context: ActionCallContext = { ...who, audience: "user", call_id: "cancel-import", permissions: [...PLUGIN_INSTALL_PERMISSIONS, SKILLS_MANAGE_PERMISSION],
        signal: controller.signal,
        assert_authority_current: reference => {
          if (revoked && reference?.capability_id === confirming.capability_id && reference.provider_id === confirming.provider_id) {
            throw new ActionError("actions.forbidden", "import confirmation revoked");
          }
        },
        user_action: { source: "web", conversation_ref: "test", message_ref: "confirm" } };
      waiting = true;
      const pending = h.actions.invoke(context, confirming, { preview_id: preview.preview_id, skill_ids: ["notes"], scope: "project" });
      const rejected = assert.rejects(pending, refused(`actions.${reason}`));
      await reached;
      if (reason === "cancelled") controller.abort(new ActionError("actions.cancelled", "cancelled")); else revoked = true;
      resume(); await rejected;
      assert.deepEqual(h.ledger.publishers(), [], "no pin committed after the wait");
      assert.equal(existsSync(join(h.home, "plugin-packages")), false, "no package committed");
      assert.deepEqual(h.records, [], "no install committed");
      assert.equal(h.signOutcomes.some(outcome => outcome.ok), false, "the nested signing action never returned a preview");
      if (stage === "source") assert.equal(h.publisherKeyId(), null, "a cancelled source read never creates a signing identity");
    } finally { resume(); await h.done(); }
  }
});

test("SKC-10 imported versions span projects, selections and uninstall without overwriting retained releases", async () => {
  const h = await harness();
  try {
    await writeSkill(h.skills, "notes", good("notes"));
    await writeSkill(h.skills, "plain", skillMd(["name: plain", "description: 整理时用。"]));
    const source = { kind: "runtime" as const, runtime_id: "claude-code" as const };
    const importInto = async (project: string, ids: string[], appliesTo: "assistant" | "coding" = "assistant") => {
      const person = { ...who, project_id: project }, preview = await h.service.preview({ source }, person);
      return h.service.confirm({ preview_id: preview.preview_id, skill_ids: ids, scope: "project",
        ...(ids.includes("plain") ? { applies_to: [{ skill_id: "plain", applies_to: appliesTo }] } : {}) }, person);
    };
    const first = await importInto(who.project_id, ["notes", "plain"]);
    await writeSkill(h.skills, "notes", good("notes").replace("按步骤做。", "新的正文。"));
    const second = await importInto("project-two", ["notes", "plain"], "coding");
    const third = await importInto("project-three", ["plain"]);
    h.records.splice(0);
    const fourth = await importInto(who.project_id, ["notes", "plain"]);
    assert.deepEqual([first, second, third, fourth].map(row => row.version), ["1.0.0", "2.0.0", "3.0.0", "4.0.0"]);
    assert.equal(new Set([first, second, third, fourth].map(row => row.plugin_id)).size, 1);
    const retained = h.packages.releases(first.plugin_id, first.publisher_key_id).sort((a, b) => a.manifest.version.localeCompare(b.manifest.version));
    assert.deepEqual(retained.map(pkg => pkg.manifest.methods!.map(method => [method.skill_id, method.version, method.applies_to])), [
      [["notes", 1, "both"], ["plain", 1, "assistant"]], [["notes", 2, "both"], ["plain", 2, "coding"]],
      [["plain", 3, "assistant"]], [["notes", 2, "both"], ["plain", 3, "assistant"]],
    ]);
    assert.match(retained[0]!.agentBodies![0]!.body, /按步骤做/u, "the retained first release is unchanged");
    const upgraded = await importInto("project-two", ["notes", "plain"]);
    assert.equal(upgraded.version, "5.0.0");
    assert.deepEqual(h.packages.load(upgraded.plugin_id, first.publisher_key_id, upgraded.version).packaged!.manifest.upgrade_compatibility?.compatible_from_versions, ["2.0.0"]);
  } finally { await h.done(); }
});
