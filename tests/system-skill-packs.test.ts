import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillBodyReadResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { completeContentPackagePayload } from "@molis-ai/molis-work-plugin-sdk";
import { contentDraftFromFolder, readBundledPackOptions } from "@molis-ai/molis-work-plugin-cli";
import { DEMO_PROJECT_ID, MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { caller, mac } from "./fixtures/signed-package-host.js";

// Batch 41, 41-2 (用户 2026-11-14 定, specs/prologue-strategies/skill.md §10): the planning and breakdown methods are a Skill pack
// that comes with the system — `plugins/content/planning-methods`, whose pack-content.json writes `system` — not a library of the
// Goals plugin. Every Home has its Skills in the catalog with no install, each `auto` until the person changes it; switching one off
// is kept. A Skill's body may be written in more than one language (`SKILL.<locale>.md`, declared in `locales`) and is read in the
// caller's.

const root = fileURLToPath(new URL("..", import.meta.url));
const PACK = join(root, "plugins/content/planning-methods");
const PLUGIN_ID = "io.molis.work.content.planning-methods";
const ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
const publisher = { publisher_id: "molis-work", signature: "ed25519:sha256:" + "0".repeat(64) };

test("SKL-41-2 the planning and breakdown pack: 37 Skills, each for the Assistant, each with an English body, none carrying a Goals-only section", () => {
  const skills = readdirSync(join(PACK, "skills")).sort();
  assert.equal(skills.length, 37);
  for (const id of skills) {
    const body = readFileSync(join(PACK, "skills", id, "SKILL.md"), "utf8"), english = readFileSync(join(PACK, "skills", id, "SKILL.en.md"), "utf8");
    assert.match(body, new RegExp(`^---\\nname: ${id}\\nversion: 2\\n`), id);
    assert.match(body, /\napplies_to: assistant\n/, id);
    for (const section of ["## 规划路径", "## 必须覆盖", "## 依赖规则", "## 完成证据", "## 怎样用这份方法"]) assert.ok(body.includes(section), `${id} ${section}`);
    for (const section of ["## Planning path", "## Required coverage", "## Dependency rules", "## How to use this method"]) assert.ok(english.includes(section), `${id} ${section}`);
    assert.doesNotMatch(body + english, /## (事件类型|事件字段|默认要求|Event types|Event fields|Default requirements)/, `${id}: what Goals records about a Goal is not a method's`);
    assert.doesNotMatch(english, /^---/, `${id}: a translation is the body alone`);
  }
});

test("SKL-41-2 a Skill's translations are declared (`locales`) and packed beside its body; a missing one, the default language, or a language the package does not have refuses the package", async () => {
  const draft = await contentDraftFromFolder(join(PACK, "skills"), await readBundledPackOptions(PACK));
  const methods = draft.manifest.methods as Array<{ skill_id: string; locales?: string[] }>;
  assert.ok(methods.every(method => method.locales?.join() === "en"));
  assert.ok(draft.files.some(file => file.path === "skills/work-analyze-decide/SKILL.en.md"));
  completeContentPackagePayload(draft, publisher);
  const declaring = (locales: string[], files = draft.files) => () => completeContentPackagePayload({ manifest: { ...draft.manifest,
    methods: methods.map((method, index) => index ? method : { ...method, locales }) }, files }, publisher);
  assert.throws(declaring(["zh"]), /只列译文/u);
  assert.throws(declaring(["fr"]), /不在 ui\.locales\.available/u);
  assert.throws(declaring(["en"], draft.files.filter(file => file.path !== `skills/${methods[0]!.skill_id}/SKILL.en.md`)), { code: "plugin.declaration_invalid" });
  assert.throws(() => completeContentPackagePayload({ manifest: { ...draft.manifest, methods: methods.map((method, index) => index ? method : { ...method, locales: undefined }) }, files: draft.files }, publisher),
    { code: "plugin.declaration_invalid" }, "an undeclared translation is a file the declaration does not have");
});

test("SKL-41-2 in a new Home the pack's Skills are in the catalog with no install, `auto`, from the system; a body is read in the caller's language; switching one off is kept and it can be switched back", mac, async () => {
  const base = await mkdtemp(join(tmpdir(), "molis-work-system-skills-")), home = join(base, "home");
  await mkdir(home);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const databasePath = join(home, "project.sqlite"); seedDemoBoard(databasePath);
  try {
    const client = host.actionClient(molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID }));
    const person = { ...caller, permissions: SKILLS_PERMISSIONS, user_action: { source: "management" as const, conversation_ref: "41-2:skills", message_ref: "41-2:set" } };
    const ours = async (locale: string) => (await client.invoke({ ...person, locale }, ref(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] }).skills.filter(skill => skill.pack.plugin_id === PLUGIN_ID);
    const zh = await ours("zh"), en = await ours("en");
    assert.equal(zh.length, 37);
    assert.ok(zh.every(skill => skill.state === "auto" && skill.settings_revision === 0 && skill.pack.trust === "host" && skill.availability.available && skill.applies_to === "assistant" && !skill.enabled));
    const pick = (list: SkillCatalogEntry[]) => list.find(skill => skill.ref.skill_id === "work-analyze-decide")!;
    assert.deepEqual([pick(zh).pack.title, pick(zh).name, pick(en).pack.title, pick(en).name], ["规划与拆解", "分析与决策", "Planning and breakdown", "Analyze and decide"]);
    const body = async (locale: string) => ((await client.invoke({ ...person, locale }, ref(skillCatalogActions.readBodies), { refs: [pick(zh).ref] }) as { results: SkillBodyReadResult[] }).results[0]!);
    const text = (result: SkillBodyReadResult) => result.ok ? result.body : assert.fail(`refused: ${result.reason}`);
    assert.match(text(await body("zh")), /## 怎样用这份方法/);
    assert.match(text(await body("en")), /^# Analyze and decide\n[\s\S]*## How to use this method/);

    const agent = { ...person, audience: "agent" as const, skill_round: { consumer: "assistant" as const, named: [], auto: true } };
    const seen = async () => (await client.invoke(agent, ref(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] }).skills.some(skill => skill.ref.skill_id === "work-analyze-decide" && skill.pack.plugin_id === PLUGIN_ID);
    assert.equal(await seen(), true, "an Agent sees it without anyone having enabled it");
    const set = (state: "off" | "auto" | "manual", expected_revision: number) => client.invoke(person, ref(skillCatalogActions.setState),
      { scope: "project", install_id: pick(zh).ref.install_id, skill_id: "work-analyze-decide", state, expected_revision }) as Promise<SkillCatalogEntry>;
    const off = await set("off", 0);
    assert.equal(off.state, "off");
    assert.ok(off.settings_revision > 0, "off is the person's choice here, so it is kept");
    assert.equal(pick(await ours("zh")).state, "off");
    assert.equal(await seen(), false);
    const closed = await body("zh");
    assert.equal(closed.ok ? "read" : closed.reason, "off");
    assert.equal((await set("auto", off.settings_revision)).state, "auto");
    assert.equal(await seen(), true);
  } finally { await host.close(); await rm(base, { recursive: true, force: true }); }
});
